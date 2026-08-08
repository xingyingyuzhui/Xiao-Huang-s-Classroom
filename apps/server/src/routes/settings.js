const express = require('express');
const router = express.Router();
const { query, queryOne, run } = require('../db/sqlite');
const { success, error, badRequest } = require('../utils/response');
const { normalizeApiBase, normalizeModel } = require('../utils/ai-config');
const {
  createDefaultSubjectSettings,
  normalizeSubjectSettings,
} = require('@xiaohuang/subject-settings');
const { loadSubjectSettings } = require('../services/settings-service');

// R5.1：业务规则收敛到 TS domain policy（src/domain/settings-policy.ts）。
// 产物合同：<server 根>/dist/domain/settings-policy.js（仓库 = apps/server/dist；
// Electron stage = .electron-stage/server/dist）。构建链（turbo build / stage
// 预构建）保证加载前产物已生成；禁止双路径 try/catch 掩盖位置不确定。
const { MAX_ICON_DATA_URL, maskApiKey, isMaskedKey, validateIconDataUrl } = require('../../dist/domain/settings-policy.js');

const DEFAULT_THEME = { id: 'default' };

const MASKED_KEY_PLACEHOLDER = '__MASKED_API_KEY__';

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return patch;
  }
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      base[k] &&
      typeof base[k] === 'object' &&
      !Array.isArray(base[k])
    ) {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function readSettingObject(key, fallback) {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return structuredClone(fallback);
  try {
    const parsed = JSON.parse(row.value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return deepMerge(fallback, parsed);
    }
    return parsed;
  } catch {
    return structuredClone(fallback);
  }
}

function readSettingValue(key) {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

function loadSubjectSettingsFromDb() {
  const result = loadSubjectSettings({
    queryOne: (sql, params) => queryOne(sql, params),
  });
  // 失败时回退默认（route 层容错；错误已由 service 记录，不静默）
  return result.ok ? result.value : normalizeSubjectSettings({});
}

function maskSubjectSettingsForClient(subjectSettings) {
  const out = structuredClone(subjectSettings);
  for (const entry of Object.values(out)) {
    if (entry?.ai?.apiKey) {
      entry.ai.apiKey = maskApiKey(entry.ai.apiKey);
    }
  }
  return out;
}

function mergeSubjectAi(oldAi, patchAi) {
  let nextAi = deepMerge(oldAi, patchAi);
  if (patchAi.apiKey === undefined || patchAi.apiKey === null || isMaskedKey(patchAi.apiKey)) {
    nextAi.apiKey = oldAi.apiKey || '';
  }
  const { base, rejected } = normalizeApiBase(nextAi.apiBase);
  if (rejected) {
    console.warn('拒绝非法 apiBase，已回退默认:', nextAi.apiBase);
  }
  nextAi.apiBase = base;
  nextAi.model = normalizeModel(nextAi.model);
  return nextAi;
}

function applySubjectSettingsPatch(patchSubjects) {
  const current = loadSubjectSettingsFromDb();
  for (const [subjectId, subPatch] of Object.entries(patchSubjects)) {
    if (!current[subjectId] || !subPatch || typeof subPatch !== 'object') continue;
    const base = current[subjectId];

    if (subPatch.brand && typeof subPatch.brand === 'object') {
      let nextBrand = deepMerge(base.brand, subPatch.brand);
      if (Object.prototype.hasOwnProperty.call(subPatch.brand, 'iconDataUrl')) {
        nextBrand.iconDataUrl = validateIconDataUrl(subPatch.brand.iconDataUrl);
      }
      if (nextBrand.title != null) {
        nextBrand.title = String(nextBrand.title).slice(0, 80);
      }
      base.brand = nextBrand;
    }

    if (typeof subPatch.defaultPage === 'string') {
      base.defaultPage = subPatch.defaultPage;
    }

    if (subPatch.ai && typeof subPatch.ai === 'object') {
      base.ai = mergeSubjectAi(base.ai, subPatch.ai);
    }

    if (subjectId === 'chemistry' && Array.isArray(subPatch.electronOrder)) {
      base.electronOrder = subPatch.electronOrder.map(Number).filter((n) => Number.isFinite(n));
    }
  }
  return normalizeSubjectSettings(current);
}

/**
 * GET /api/settings
 */
router.get('/', (req, res) => {
  try {
    const theme = deepMerge(DEFAULT_THEME, readSettingObject('theme', DEFAULT_THEME));
    const subjectSettings = maskSubjectSettingsForClient(loadSubjectSettingsFromDb());

    success(res, {
      theme,
      subjectSettings,
    });
  } catch (err) {
    console.error('获取设置失败:', err);
    error(res, '获取设置失败');
  }
});

const LEGACY_SETTING_KEYS = new Set([
  'brand',
  'ai',
  'electronOrder',
  'defaultPage',
  'defaultPages',
]);

/**
 * PUT /api/settings
 */
router.put('/', (req, res) => {
  try {
    const patch = req.body;
    if (!patch || typeof patch !== 'object') {
      return badRequest(res, '无效的设置数据');
    }

    for (const key of Object.keys(patch)) {
      if (patch[key] === undefined) continue;

      if (LEGACY_SETTING_KEYS.has(key)) {
        return badRequest(res, `请使用 subjectSettings 保存「${key}」`);
      }

      if (key === 'theme' && patch.theme && typeof patch.theme === 'object') {
        const nextTheme = deepMerge(readSettingObject('theme', DEFAULT_THEME), patch.theme);
        upsertSetting('theme', nextTheme);
        continue;
      }

      if (
        key === 'subjectSettings' &&
        patch.subjectSettings &&
        typeof patch.subjectSettings === 'object'
      ) {
        const next = applySubjectSettingsPatch(patch.subjectSettings);
        upsertSetting('subjectSettings', next);
        continue;
      }

      if (key !== 'theme' && key !== 'subjectSettings') {
        continue;
      }
    }

    success(res, null, '设置已保存');
  } catch (err) {
    console.error('保存设置失败:', err);
    if (err.message && /图标/.test(err.message)) {
      return badRequest(res, err.message);
    }
    error(res, '保存设置失败');
  }
});

function upsertSetting(key, value) {
  const existing = queryOne('SELECT key FROM settings WHERE key = ?', [key]);
  const json = JSON.stringify(value);
  if (existing) {
    run('UPDATE settings SET value = ? WHERE key = ?', [json, key]);
  } else {
    run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, json]);
  }
}

module.exports = router;
