/**
 * 设置抽屉
 * - 全局：主题（大厅与各学科共用）
 * - 各学科独立：标识、默认页、AI（存 subjectSettings）
 */

import { settingsApi } from '../api/client.js';
import { THEME_CATALOG, normalizeTheme, DEFAULT_THEME_ID } from '../theme/catalog.js';
import { applyTheme } from '../theme/apply.js';
import {
  HUB_BRAND_TITLE,
  DEFAULT_AI,
  createDefaultSubjectSettings,
  normalizeSubjectSettings,
  defaultSubjectBrandTitle,
} from '@xiaohuang/subject-settings';

export const SETTINGS_CONTEXT = {
  hub: 'hub',
  lab: 'lab',
};

/** 图标文件大小上限：500KB */
export const BRAND_ICON_MAX_BYTES = 500 * 1024;

export const DEFAULT_ICON_SRC = '/brand-avatar.png';

export const DEFAULT_SETTINGS = {
  theme: { id: DEFAULT_THEME_ID },
  subjectSettings: createDefaultSubjectSettings(),
};

function getSubjectSettingsSlice(settings, subjectId) {
  const all = settings?.subjectSettings ?? {};
  const normalized = normalizeSubjectSettings(all);
  return normalized[subjectId] ?? createDefaultSubjectSettings()[subjectId];
}

const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);

let cachedSettings = null;

const THEME_PREVIEW = {
  default: ['#3b82f6', '#f0f4f8', '#ffffff'],
  stationery: ['#c23b22', '#f2e9dc', '#1f6f6a'],
  reagent: ['#b45309', '#e9e6e0', '#c9a227'],
  blackboard: ['#f0d060', '#1a3d32', '#7ec8c0'],
  pixel: ['#ff6b81', '#dfe6e9', '#1dd1a1'],
};

export async function loadSettings() {
  if (cachedSettings) return cachedSettings;

  try {
    const settings = await settingsApi.get();
    cachedSettings = {
      theme: normalizeTheme(settings.theme),
      subjectSettings: normalizeSubjectSettings(settings.subjectSettings ?? {}),
    };
    return cachedSettings;
  } catch (err) {
    console.error('加载设置失败:', err);
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export async function saveSettings(patch) {
  try {
    await settingsApi.update(patch);
    if (cachedSettings) {
      if (patch.theme) {
        cachedSettings.theme = normalizeTheme({ ...cachedSettings.theme, ...patch.theme });
      }
      if (patch.subjectSettings) {
        cachedSettings.subjectSettings = normalizeSubjectSettings(
          deepMergeSubjectSettings(cachedSettings.subjectSettings, patch.subjectSettings),
        );
      }
    }
    return true;
  } catch (err) {
    console.error('保存设置失败:', err);
    throw err;
  }
}

function deepMergeSubjectSettings(base, patch) {
  const out = { ...base };
  for (const [sid, subPatch] of Object.entries(patch)) {
    if (!subPatch || typeof subPatch !== 'object') continue;
    out[sid] = { ...out[sid], ...subPatch };
    if (subPatch.brand) out[sid].brand = { ...out[sid]?.brand, ...subPatch.brand };
    if (subPatch.ai) out[sid].ai = { ...out[sid]?.ai, ...subPatch.ai };
  }
  return out;
}

async function saveSubjectSettingsPatch(subjectId, subPatch) {
  const settings = await loadSettings();
  const next = deepMergeSubjectSettings(settings.subjectSettings, {
    [subjectId]: subPatch,
  });
  await saveSettings({ subjectSettings: next });
}

/** 仅更新缓存中的化学 electronOrder */
export function patchCachedElectronOrder(order) {
  if (!cachedSettings?.subjectSettings?.chemistry) return;
  cachedSettings.subjectSettings.chemistry.electronOrder = Array.isArray(order) ? order : [];
}

export { applyTheme };

export function applyBrand(brand) {
  const titleEl = document.getElementById('appBrandTitle');
  const iconEl = document.getElementById('appBrandIcon');
  if (titleEl) titleEl.textContent = brand.title || HUB_BRAND_TITLE;
  if (iconEl) iconEl.src = brand.iconDataUrl || DEFAULT_ICON_SRC;
  document.title = brand.title || HUB_BRAND_TITLE;
}

export function applyHubBrand() {
  applyBrand({ title: HUB_BRAND_TITLE, iconDataUrl: null });
}

/**
 * @param {string} subjectId
 * @param {Record<string, unknown>} [settings]
 */
export function applySubjectBrand(subjectId, settings) {
  const slice = settings
    ? getSubjectSettingsSlice(settings, subjectId)
    : getSubjectSettingsSlice(cachedSettings ?? DEFAULT_SETTINGS, subjectId);
  applyBrand(slice.brand ?? { title: defaultSubjectBrandTitle(subjectId), iconDataUrl: null });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderThemePicker(root, activeId, onPick) {
  if (!root) return;
  root.innerHTML = '';
  THEME_CATALOG.forEach((meta) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-card' + (meta.id === activeId ? ' is-active' : '');
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', meta.id === activeId ? 'true' : 'false');
    btn.dataset.themeId = meta.id;

    const swatch = document.createElement('span');
    swatch.className = 'theme-card-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    (THEME_PREVIEW[meta.id] || THEME_PREVIEW.default).forEach((hex) => {
      const i = document.createElement('i');
      i.style.background = hex;
      swatch.appendChild(i);
    });

    const name = document.createElement('span');
    name.className = 'theme-card-name';
    name.textContent = meta.name;

    const desc = document.createElement('span');
    desc.className = 'theme-card-desc';
    desc.textContent = meta.description;

    btn.append(swatch, name, desc);
    btn.addEventListener('click', () => onPick(meta.id));
    root.appendChild(btn);
  });
}

/**
 * @param {{
 *   onDefaultPageChange?: (subjectId: string, pageId: string) => void,
 *   getDefaultPageOptions?: (subjectId: string) => import('../../subjects/classrooms/tabbed-classroom.js').DefaultPageOption[],
 *   resolveDefaultPage?: (subjectId: string, storedPageId: string | undefined) => string,
 *   getClassroomCapabilities?: (subjectId: string) => { brand: boolean, defaultPage: boolean, ai: boolean },
 * }} opts
 */
export async function initSettingsUI({
  onDefaultPageChange,
  getDefaultPageOptions = () => [],
  resolveDefaultPage,
  getClassroomCapabilities = () => ({ brand: false, defaultPage: false, ai: false }),
} = {}) {
  const $ = (sel) => document.querySelector(sel);

  const btnOpen = $('#btnSettings');
  const backdrop = $('#settingsBackdrop');
  const drawer = $('#settingsDrawer');
  const btnClose = $('#btnSettingsClose');

  const themeSection = $('#settingsThemeSection');
  const subjectSection = $('#settingsSubjectSection');
  const brandBlock = $('#settingsBrandBlock');
  const brandIconPreview = $('#brandIconPreview');
  const brandIconInput = $('#brandIconInput');
  const brandTitleInput = $('#brandTitleInput');
  const btnSaveBrand = $('#btnSaveBrand');
  const btnResetBrand = $('#btnResetBrand');
  const brandStatus = $('#brandStatus');

  const themePicker = $('#themePicker');
  const themeStatus = $('#themeStatus');
  const defaultPage = $('#settingDefaultPage');
  const defaultPageStatus = $('#defaultPageStatus');
  const defaultPageBlock = $('#settingsDefaultPageBlock');
  const aiSection = $('#settingsAiSection');

  /** @type {{ mode: 'hub' | 'lab', subjectId: string | null }} */
  let settingsContext = { mode: SETTINGS_CONTEXT.hub, subjectId: null };

  function syncSettingsSections() {
    const isHub = settingsContext.mode === SETTINGS_CONTEXT.hub;
    const subjectId = settingsContext.subjectId;
    const caps =
      subjectId && !isHub
        ? getClassroomCapabilities(subjectId)
        : { brand: false, defaultPage: false, ai: false };

    if (themeSection) themeSection.hidden = false;
    if (subjectSection) {
      subjectSection.hidden = isHub || (!caps.brand && !caps.defaultPage);
    }
    if (brandBlock) brandBlock.hidden = isHub || !caps.brand;
    if (aiSection) aiSection.hidden = isHub || !caps.ai;
    if (defaultPageBlock) {
      defaultPageBlock.hidden = isHub || !caps.defaultPage;
    }
  }

  function renderDefaultPageOptions(subjectId, selectedId) {
    if (!defaultPage) return;
    const options = getDefaultPageOptions(subjectId);
    defaultPage.innerHTML = '';
    for (const opt of options) {
      const el = document.createElement('option');
      el.value = opt.id;
      el.textContent = opt.label;
      defaultPage.appendChild(el);
    }
    if (options.some((o) => o.id === selectedId)) {
      defaultPage.value = selectedId;
    } else if (options[0]) {
      defaultPage.value = options[0].id;
    }
  }

  const apiBase = $('#aiApiBase');
  const apiKey = $('#aiApiKey');
  const apiModel = $('#aiModel');
  const btnSaveAi = $('#btnSaveAi');
  const aiStatus = $('#aiStatus');

  let pendingIconDataUrl = null;

  function setStatus(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.className = 'settings-status ' + (ok ? 'is-ok' : 'is-err');
    setTimeout(() => {
      el.textContent = '';
      el.className = 'settings-status';
    }, 2800);
  }

  function syncBrandInputs(brand) {
    if (brandTitleInput) brandTitleInput.value = brand.title;
    if (brandIconPreview) brandIconPreview.src = brand.iconDataUrl || DEFAULT_ICON_SRC;
  }

  async function onThemePick(nextId) {
    const label = THEME_CATALOG.find((t) => t.id === nextId)?.name || nextId;
    /* 先本地换肤（含 chem-theme-change → 书封面），再尝试持久化 */
    applyTheme({ id: nextId });
    syncThemePicker({ id: nextId });
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('xh-theme-id', nextId);
      }
    } catch {
      /* ignore quota / private mode */
    }
    try {
      await saveSettings({ theme: { id: nextId } });
      setStatus(themeStatus, `已切换为「${label}」`, true);
    } catch (err) {
      /* 后端未启动时仍保留本地主题，避免「保存失败」连封面也不换的错觉 */
      console.warn('主题已应用，但未能写入服务器:', err);
      setStatus(
        themeStatus,
        `已切换为「${label}」（未同步服务器，请确认后端 npm run dev:server 已启动）`,
        false,
      );
    }
  }

  function syncThemePicker(theme) {
    const { id } = normalizeTheme(theme);
    renderThemePicker(themePicker, id, onThemePick);
  }

  async function openDrawer() {
    cachedSettings = null;
    const settings = await loadSettings();
    syncThemePicker(settings.theme);
    syncSettingsSections();

    const subjectId = settingsContext.subjectId;
    if (subjectId && settingsContext.mode === SETTINGS_CONTEXT.lab) {
      const slice = getSubjectSettingsSlice(settings, subjectId);
      syncBrandInputs(slice.brand);
      if (defaultPageBlock && !defaultPageBlock.hidden) {
        const resolved = resolveDefaultPage
          ? resolveDefaultPage(subjectId, slice.defaultPage)
          : slice.defaultPage;
        renderDefaultPageOptions(subjectId, resolved);
      }
      if (apiBase) apiBase.value = slice.ai?.apiBase || DEFAULT_AI.apiBase;
      if (apiKey) apiKey.value = slice.ai?.apiKey || '';
      if (apiModel) apiModel.value = slice.ai?.model || DEFAULT_AI.model;
    }

    pendingIconDataUrl = null;

    backdrop?.classList.add('is-open');
    drawer?.classList.add('is-open');
    backdrop?.setAttribute('aria-hidden', 'false');
    drawer?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('settings-open');
  }

  function closeDrawer() {
    backdrop?.classList.remove('is-open');
    drawer?.classList.remove('is-open');
    backdrop?.setAttribute('aria-hidden', 'true');
    drawer?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('settings-open');
  }

  btnOpen?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer?.classList.contains('is-open')) closeDrawer();
  });

  brandIconInput?.addEventListener('change', async () => {
    const file = brandIconInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus(brandStatus, '请选择图片文件', false);
      return;
    }
    if (file.size > BRAND_ICON_MAX_BYTES) {
      setStatus(brandStatus, '图片过大（限 500KB）', false);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > BRAND_ICON_MAX_BYTES * 1.4) {
        setStatus(brandStatus, '编码后过大', false);
        return;
      }
      pendingIconDataUrl = dataUrl;
      if (brandIconPreview) brandIconPreview.src = dataUrl;
    } catch {
      setStatus(brandStatus, '读取文件失败', false);
    }
  });

  btnSaveBrand?.addEventListener('click', async () => {
    const subjectId = settingsContext.subjectId;
    if (!subjectId) return;
    const title = brandTitleInput?.value?.trim();
    if (!title) {
      setStatus(brandStatus, '标题不能为空', false);
      return;
    }
    try {
      const settings = await loadSettings();
      const prev = getSubjectSettingsSlice(settings, subjectId);
      const brand = {
        title: title.slice(0, 32),
        iconDataUrl: pendingIconDataUrl || prev.brand.iconDataUrl,
      };
      await saveSubjectSettingsPatch(subjectId, { brand });
      applySubjectBrand(subjectId);
      pendingIconDataUrl = null;
      setStatus(brandStatus, '已保存', true);
    } catch (err) {
      setStatus(brandStatus, '保存失败: ' + err.message, false);
    }
  });

  btnResetBrand?.addEventListener('click', async () => {
    const subjectId = settingsContext.subjectId;
    if (!subjectId) return;
    try {
      const brand = {
        title: defaultSubjectBrandTitle(subjectId),
        iconDataUrl: null,
      };
      await saveSubjectSettingsPatch(subjectId, { brand });
      applySubjectBrand(subjectId);
      syncBrandInputs(brand);
      pendingIconDataUrl = null;
      setStatus(brandStatus, '已恢复默认', true);
    } catch (err) {
      setStatus(brandStatus, '重置失败: ' + err.message, false);
    }
  });

  defaultPage?.addEventListener('change', async () => {
    const subjectId = settingsContext.subjectId;
    if (!subjectId || settingsContext.mode === SETTINGS_CONTEXT.hub) return;
    const pageId = defaultPage.value;
    try {
      await saveSubjectSettingsPatch(subjectId, { defaultPage: pageId });
      onDefaultPageChange?.(subjectId, pageId);
      setStatus(defaultPageStatus, '已保存', true);
    } catch (err) {
      setStatus(defaultPageStatus, '保存失败: ' + err.message, false);
    }
  });

  btnSaveAi?.addEventListener('click', async () => {
    const subjectId = settingsContext.subjectId;
    if (!subjectId) return;
    const model = apiModel?.value;
    if (!ALLOWED_MODELS.has(model)) {
      setStatus(aiStatus, '不支持的模型', false);
      return;
    }
    try {
      const ai = {
        apiBase: apiBase?.value?.trim() || DEFAULT_AI.apiBase,
        apiKey: apiKey?.value?.trim() || '',
        model,
      };
      await saveSubjectSettingsPatch(subjectId, { ai });
      setStatus(aiStatus, '已保存', true);
    } catch (err) {
      setStatus(aiStatus, '保存失败: ' + err.message, false);
    }
  });

  const settings = await loadSettings();
  applyTheme(settings.theme);
  applyHubBrand();

  return {
    getSettings: () => loadSettings(),
    openDrawer,
    closeDrawer,
    applyHubBrand,
    applySubjectBrand: (subjectId) => {
      const s = cachedSettings ?? DEFAULT_SETTINGS;
      applySubjectBrand(subjectId, s);
    },
    setContext(ctx) {
      settingsContext = {
        mode: ctx.mode === SETTINGS_CONTEXT.lab ? SETTINGS_CONTEXT.lab : SETTINGS_CONTEXT.hub,
        subjectId: ctx.subjectId ?? null,
      };
      syncSettingsSections();
    },
    getDefaultPage: async (subjectId) => {
      const s = await loadSettings();
      const slice = getSubjectSettingsSlice(s, subjectId);
      if (resolveDefaultPage) {
        return resolveDefaultPage(subjectId, slice.defaultPage);
      }
      return slice.defaultPage;
    },
  };
}
