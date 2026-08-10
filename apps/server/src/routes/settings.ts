/**
 * API v1：/api/settings（B2 第二批：route TS 权威源）。
 *
 * 与 v2 复用同一 application service（settings-service），禁止复制业务逻辑。
 * C2 工厂注入模式：db 查询由组合根注入（src/db/sqlite 进程单例），产物不持有
 * DB 状态。dist 产物引用统一 2 级（源 src/routes/ 与产物 dist/routes/ 均解析到
 * serverRoot/dist；v2 子层为 3 级）：
 *   仓库：apps/server/dist
 *   stage：.electron-stage/dist（stage 脚本复制）
 *   最终包：Contents/Resources/dist（electron-builder extraResources 复制）
 * 构建链（turbo build / stage 预构建 / pretest）保证加载前产物已生成；
 * 禁止双路径 try/catch 掩盖位置不确定。
 */
/* eslint-disable @typescript-eslint/no-require-imports -- dist 产物/JS 引用的 CJS 同构合同
   （policy/service 经 require 运行时解析 serverRoot/dist；utils 经 tsup bundle），
   用 import 会被 esbuild 静态解析破坏产物路径合同。 */
import { Router, type Request, type Response } from 'express';
import {
  createDefaultSubjectSettings,
  normalizeSubjectSettings,
} from '@xiaohuang/subject-settings';

/** 与 createDefaultSubjectSettings 返回值同构；避免 type-only 命名导出在 tsup d.ts 消费端丢失。 */
type SubjectSettingsMap = ReturnType<typeof createDefaultSubjectSettings>;

// CJS 产物同构：policy/service 权威源为 dist 产物（tsup；3 级解析）。
// 类型来自 TS 源文件（编译期），运行时经 require 加载产物。
const settingsPolicy = require('../../dist/domain/settings-policy.js') as {
  MAX_ICON_DATA_URL: number;
  maskApiKey: (key: unknown) => string;
  isMaskedKey: (key: unknown) => boolean;
  validateIconDataUrl: (url: unknown) => string | null;
};
const settingsService = require('../../dist/services/settings-service.js') as {
  loadSubjectSettings: (db: {
    queryOne: (sql: string, params?: unknown[]) => { value: string } | null;
  }) =>
    | { ok: true; value: SubjectSettingsMap }
    | { ok: false; error: { code: string; message: string } };
};
// utils（JS 权威源）经 tsup bundle 进产物（无状态函数，行为等价）。
const { success, error, badRequest } = require('../utils/response') as {
  success: (res: Response, data?: unknown, message?: string) => Response;
  error: (res: Response, message?: string, status?: number) => Response;
  badRequest: (res: Response, message?: string) => Response;
};
const { normalizeApiBase, normalizeModel } = require('../utils/ai-config') as {
  normalizeApiBase: (url: unknown) => { base: string; rejected: boolean };
  normalizeModel: (model: unknown) => string;
};

/** 组合根注入的 db 查询接口（src/db/sqlite 进程单例）。 */
export interface SettingsRouterDeps {
  query: (sql: string, params?: unknown[]) => unknown[];
  queryOne: (sql: string, params?: unknown[]) => { value: string } | null;
  run: (sql: string, params?: unknown[]) => unknown;
}

const DEFAULT_THEME: { id: string } = { id: 'default' };

type DeepObject = Record<string, unknown>;

function deepMerge(base: DeepObject, patch: unknown): unknown {
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
      out[k] = deepMerge(base[k] as DeepObject, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/** 工厂：组合根注入 db 查询，返回 v1 settings router。 */
export function createSettingsRouter(deps: SettingsRouterDeps): Router {
  const { queryOne, run } = deps;
  const router = Router();

  function readSettingObject(key: string, fallback: DeepObject): DeepObject {
    const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
    if (!row) return structuredClone(fallback);
    try {
      const parsed: unknown = JSON.parse(row.value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return deepMerge(fallback, parsed) as DeepObject;
      }
      return parsed as DeepObject;
    } catch {
      return structuredClone(fallback);
    }
  }

  function loadSubjectSettingsFromDb(): SubjectSettingsMap {
    const result = settingsService.loadSubjectSettings({
      queryOne: (sql, params) => queryOne(sql, params),
    });
    // 失败时回退默认（route 层容错；错误已由 service 记录，不静默）
    return result.ok ? result.value : normalizeSubjectSettings({});
  }

  function maskSubjectSettingsForClient(subjectSettings: SubjectSettingsMap): SubjectSettingsMap {
    const out = structuredClone(subjectSettings);
    for (const entry of Object.values(out)) {
      if (entry?.ai?.apiKey) {
        entry.ai.apiKey = settingsPolicy.maskApiKey(entry.ai.apiKey);
      }
    }
    return out;
  }

  function mergeSubjectAi(oldAi: SubjectSettingsMap[string]['ai'], patchAi: unknown) {
    const nextAi = deepMerge(oldAi as unknown as DeepObject, patchAi) as SubjectSettingsMap[string]['ai'];
    if (
      (patchAi as { apiKey?: unknown } | null)?.apiKey === undefined ||
      (patchAi as { apiKey?: unknown } | null)?.apiKey === null ||
      settingsPolicy.isMaskedKey((patchAi as { apiKey?: unknown } | null)?.apiKey)
    ) {
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

  function applySubjectSettingsPatch(patchSubjects: Record<string, unknown>): SubjectSettingsMap {
    const current = loadSubjectSettingsFromDb();
    for (const [subjectId, subPatch] of Object.entries(patchSubjects)) {
      if (!current[subjectId] || !subPatch || typeof subPatch !== 'object') continue;
      const base = current[subjectId];
      const patch = subPatch as Record<string, unknown>;

      if (patch.brand && typeof patch.brand === 'object') {
        const nextBrand = deepMerge(base.brand as DeepObject, patch.brand) as SubjectSettingsMap[string]['brand'];
        if (Object.prototype.hasOwnProperty.call(patch.brand, 'iconDataUrl')) {
          nextBrand.iconDataUrl = settingsPolicy.validateIconDataUrl(
            (patch.brand as { iconDataUrl?: unknown }).iconDataUrl,
          );
        }
        if (nextBrand.title != null) {
          nextBrand.title = String(nextBrand.title).slice(0, 80);
        }
        base.brand = nextBrand;
      }

      if (typeof patch.defaultPage === 'string') {
        base.defaultPage = patch.defaultPage;
      }

      if (patch.ai && typeof patch.ai === 'object') {
        base.ai = mergeSubjectAi(base.ai, patch.ai);
      }

      if (subjectId === 'chemistry' && Array.isArray(patch.electronOrder)) {
        base.electronOrder = (patch.electronOrder as unknown[]).map(Number).filter((n) => Number.isFinite(n));
      }
    }
    return normalizeSubjectSettings(current);
  }

  /**
   * GET /api/settings
   */
  router.get('/', (_req: Request, res: Response) => {
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

  function upsertSetting(key: string, value: unknown) {
    const existing = queryOne('SELECT key FROM settings WHERE key = ?', [key]);
    const json = JSON.stringify(value);
    if (existing) {
      run('UPDATE settings SET value = ? WHERE key = ?', [json, key]);
    } else {
      run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, json]);
    }
  }

  /**
   * PUT /api/settings
   */
  router.put('/', (req: Request, res: Response) => {
    try {
      const patch: unknown = req.body;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        badRequest(res, '无效的设置数据');
        return;
      }
      const patchObj = patch as Record<string, unknown>;

      for (const key of Object.keys(patchObj)) {
        if (patchObj[key] === undefined) continue;

        if (LEGACY_SETTING_KEYS.has(key)) {
          badRequest(res, `请使用 subjectSettings 保存「${key}」`);
          return;
        }

        if (key === 'theme' && patchObj.theme && typeof patchObj.theme === 'object') {
          const nextTheme = deepMerge(readSettingObject('theme', DEFAULT_THEME), patchObj.theme);
          upsertSetting('theme', nextTheme);
          continue;
        }

        if (
          key === 'subjectSettings' &&
          patchObj.subjectSettings &&
          typeof patchObj.subjectSettings === 'object'
        ) {
          const next = applySubjectSettingsPatch(patchObj.subjectSettings as Record<string, unknown>);
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
      if (err instanceof Error && /图标/.test(err.message)) {
        badRequest(res, err.message);
        return;
      }
      error(res, '保存设置失败');
      return;
    }
  });

  return router;
}
