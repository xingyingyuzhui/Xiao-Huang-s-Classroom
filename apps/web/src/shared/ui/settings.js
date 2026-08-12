/**
 * 设置抽屉
 * - 全局：主题（大厅与各学科共用）
 * - 各学科独立：标识、默认页、AI（存 subjectSettings）
 */

import { settingsApi } from '../api/client.js';
import { createToast } from '@xiaohuang/ui';
import { appConfirm } from './app-dialog.js';
import { THEME_CATALOG, normalizeTheme, DEFAULT_THEME_ID } from '../theme/catalog.js';
import { applyTheme } from '../theme/apply.js';
import { isFeatureEnabled } from '../runtime-config.js';
import {
  LOCAL_ONLY_HINT,
  LOCAL_SETTINGS_KEY,
  readLocalThemeId,
  writeLocalThemeId,
} from '../persistence/local-settings.js';
import {
  HUB_BRAND_TITLE,
  DEFAULT_AI,
  createDefaultSubjectSettings,
  normalizeSubjectSettings,
  defaultSubjectBrandTitle,
  extractLeftoverApiKeys,
  inferProviderFromApiBase,
  sanitizeTeacherSettingsPayload,
  stripApiKeysFromSubjectSettings,
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

/** Leftover plaintext keys seen on teacher.settings hydrate (IndexedDB / pull). */
let hydratedLeftoverAiKeys = [];

/**
 * Replace the in-memory settings cache after a cloud pull.
 * Theme/brand UI must update without waiting for the next drawer open.
 * apiKey never enters the cache (write-only; migrate separately).
 * @param {{ theme?: { id?: string }, subjectSettings?: Record<string, unknown> }} next
 */
export function hydrateSettingsCache(next) {
  if (!next || typeof next !== 'object') return cachedSettings;
  hydratedLeftoverAiKeys = extractLeftoverApiKeys(next.subjectSettings ?? {});
  cachedSettings = settingsWithLocalTheme({
    theme: normalizeTheme(next.theme),
    subjectSettings: stripApiKeysFromSubjectSettings(next.subjectSettings ?? {}),
  });
  return cachedSettings;
}

/** @type {((settings: typeof DEFAULT_SETTINGS) => void | Promise<void>) | null} */
let onSettingsPersisted = null;

/** @param {((settings: any) => void | Promise<void>) | null} fn */
export function setOnSettingsPersisted(fn) {
  onSettingsPersisted = fn;
}

const THEME_PREVIEW = {
  default: ['#3b82f6', '#f0f4f8', '#ffffff'],
  stationery: ['#c23b22', '#f2e9dc', '#1f6f6a'],
  reagent: ['#b45309', '#e9e6e0', '#c9a227'],
  blackboard: ['#f0d060', '#1a3d32', '#7ec8c0'],
  pixel: ['#ff6b81', '#dfe6e9', '#1dd1a1'],
};

function isAccountCloudProgram() {
  return isFeatureEnabled('accountCloudProgram');
}

function settingsWithLocalTheme(settings) {
  const localId = readLocalThemeId();
  if (!localId) return settings;
  return {
    ...settings,
    theme: normalizeTheme({ ...settings.theme, id: localId }),
  };
}

export async function loadSettings() {
  if (cachedSettings) return cachedSettings;

  try {
    const settings = await settingsApi.get();
    cachedSettings = settingsWithLocalTheme({
      theme: normalizeTheme(settings.theme),
      subjectSettings: normalizeSubjectSettings(settings.subjectSettings ?? {}),
    });
    return cachedSettings;
  } catch (err) {
    console.error('加载设置失败:', err);
    return settingsWithLocalTheme(structuredClone(DEFAULT_SETTINGS));
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
    if (onSettingsPersisted && cachedSettings) {
      try {
        await onSettingsPersisted(cachedSettings);
      } catch (syncErr) {
        console.warn('设置已保存，但入队云同步失败:', syncErr);
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
  accountCloud = null,
} = {}) {
  const $ = (sel) => document.querySelector(sel);

  const btnOpen = $('#btnSettings');
  const backdrop = $('#settingsBackdrop');
  const drawer = $('#settingsDrawer');
  const btnClose = $('#btnSettingsClose');

  const themeSection = $('#settingsThemeSection');
  const accountSection = $('#settingsAccountSection');
  const subjectSection = $('#settingsSubjectSection');
  const brandBlock = $('#settingsBrandBlock');
  const brandIconPreview = $('#brandIconPreview');
  const brandIconInput = $('#brandIconInput');
  const brandTitleInput = $('#brandTitleInput');
  const btnSaveBrand = $('#btnSaveBrand');
  const btnResetBrand = $('#btnResetBrand');

  const themePicker = $('#themePicker');
  const defaultPage = $('#settingDefaultPage');
  const defaultPageBlock = $('#settingsDefaultPageBlock');
  const aiSection = $('#settingsAiSection');

  /** @type {{ mode: 'hub' | 'lab', subjectId: string | null }} */
  let settingsContext = { mode: SETTINGS_CONTEXT.hub, subjectId: null };

  setOnSettingsPersisted(async (settings) => {
    await accountCloud?.enqueueTeacherSettings?.(sanitizeTeacherSettingsPayload(settings));
  });

  function ensureLocalOnlyHint(section) {
    if (!section || !isAccountCloudProgram()) return;
    if (section.querySelector('[data-local-only-hint]')) return;
    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.dataset.localOnlyHint = '1';
    hint.textContent = LOCAL_ONLY_HINT;
    section.insertBefore(hint, section.firstChild);
  }

  function syncSettingsSections() {
    const isHub = settingsContext.mode === SETTINGS_CONTEXT.hub;
    const subjectId = settingsContext.subjectId;
    const caps =
      subjectId && !isHub
        ? getClassroomCapabilities(subjectId)
        : { brand: false, defaultPage: false, ai: false };

    if (themeSection) themeSection.hidden = false;
    if (accountSection) accountSection.hidden = !accountCloud;
    if (subjectSection) {
      subjectSection.hidden = isHub || (!caps.brand && !caps.defaultPage);
    }
    if (brandBlock) brandBlock.hidden = isHub || !caps.brand;
    if (aiSection) aiSection.hidden = isHub || !caps.ai;
    if (defaultPageBlock) {
      defaultPageBlock.hidden = isHub || !caps.defaultPage;
    }
    if (!isHub && isAccountCloudProgram()) {
      ensureLocalOnlyHint(subjectSection);
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
  const aiCredentialStatus = $('#aiCredentialStatus');
  const aiCloudOnlyHint = $('#aiCloudOnlyHint');

  /** @type {import('@xiaohuang/subject-settings').LeftoverAiKey[]} */
  let leftoverAiKeys = [];

  function isOnline() {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  function isLoggedIn() {
    return accountCloud?.session?.isAuthenticated?.() === true;
  }

  function formatCredentialStatus(meta) {
    if (!meta?.configured) return '未配置云端密钥';
    const updated = meta.updatedAt
      ? String(meta.updatedAt).slice(0, 10)
      : '';
    const parts = [
      '已配置',
      [meta.provider, meta.model].filter(Boolean).join(' / '),
      meta.last4 ? `末四位 ${meta.last4}` : '',
      updated ? `更新于 ${updated}` : '',
    ].filter(Boolean);
    return parts.join(' · ');
  }

  function renderAiCredentialStatus(meta) {
    if (!aiCredentialStatus) return;
    if (!isLoggedIn()) {
      aiCredentialStatus.hidden = false;
      aiCredentialStatus.textContent = isOnline()
        ? '登录后可将密钥保存到云端；本机不保存明文。'
        : '离线时云端 AI 不可用';
      return;
    }
    if (!isOnline()) {
      aiCredentialStatus.hidden = false;
      aiCredentialStatus.textContent = '离线时云端 AI 不可用';
      return;
    }
    aiCredentialStatus.hidden = false;
    aiCredentialStatus.textContent = formatCredentialStatus(meta);
  }

  async function refreshAiCredentialStatus() {
    if (!isLoggedIn() || !accountCloud?.client?.getAiCredential) {
      renderAiCredentialStatus(null);
      return;
    }
    if (!isOnline()) {
      renderAiCredentialStatus(null);
      return;
    }
    try {
      const meta = await accountCloud.client.getAiCredential();
      renderAiCredentialStatus(meta);
      if (meta?.configured && meta.model && apiModel && ALLOWED_MODELS.has(meta.model)) {
        apiModel.value = meta.model;
      }
    } catch {
      renderAiCredentialStatus(null);
    }
  }

  function persistStrippedLocalAiKeys(rawSubjectSettings) {
    const stripped = stripApiKeysFromSubjectSettings(rawSubjectSettings);
    leftoverAiKeys = [];
    if (cachedSettings) {
      cachedSettings.subjectSettings = stripApiKeysFromSubjectSettings(
        cachedSettings.subjectSettings,
      );
    }
    if (!isAccountCloudProgram()) return stripped;
    try {
      const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
      const blob = raw ? JSON.parse(raw) : {};
      if (!blob || typeof blob !== 'object') return stripped;
      blob.subjectSettings = stripped;
      localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(blob));
    } catch {
      /* private mode / quota */
    }
    return stripped;
  }

  async function migrateLeftoverAiKeys() {
    if (leftoverAiKeys.length === 0) return;
    if (!isLoggedIn()) return;
    if (!isOnline()) {
      notify('离线时云端 AI 不可用', false);
      return;
    }
    const first = leftoverAiKeys[0];
    try {
      await accountCloud.client.setAiCredential({
        provider: inferProviderFromApiBase(first.apiBase),
        model: first.model || DEFAULT_AI.model,
        apiKey: first.apiKey,
      });
      const settings = await loadSettings();
      persistStrippedLocalAiKeys(settings.subjectSettings);
      leftoverAiKeys = [];
      hydratedLeftoverAiKeys = [];
      if (onSettingsPersisted && cachedSettings) {
        try {
          await onSettingsPersisted(cachedSettings);
        } catch {
          /* cloud already has the key; enqueue failure is not migrate failure */
        }
      }
      await refreshAiCredentialStatus();
    } catch (err) {
      notify('本地密钥未能迁到云端，未删除本机明文', false);
      throw err;
    }
  }

  let pendingIconDataUrl = null;

  /** 当前活动轻提示：同一时刻只保留一条，新提示覆盖旧提示（与旧内联状态行为一致） */
  let activeToast = null;

  function dismissActiveToast() {
    if (activeToast) {
      activeToast.dispose();
      activeToast = null;
    }
  }

  /** 操作成功/失败轻提示：统一走 @xiaohuang/ui Toast（2800ms 自动消失，与旧内联状态时限一致） */
  function notify(text, ok) {
    dismissActiveToast();
    const toast = createToast({
      message: text,
      kind: ok ? 'success' : 'error',
      durationMs: 2800,
      onDismiss: () => toast.dispose(),
    });
    activeToast = toast;
    document.body.appendChild(toast.element);
  }

  /**
   * 保存类按钮忙态：禁用 + 「保存中…」，防连点（成功/失败路径由调用方收尾恢复）。
   * 鸭子类型守卫（'disabled' in btn）保证 fake DOM / 非按钮宿主下无副作用。
   * @param {HTMLElement | null | undefined} btn
   * @param {boolean} busy
   * @param {string} idleLabel
   */
  function setSaveBusy(btn, busy, idleLabel) {
    if (!btn || !('disabled' in btn)) return;
    btn.disabled = busy;
    btn.textContent = busy ? '保存中…' : idleLabel;
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
    writeLocalThemeId(nextId);
    try {
      await saveSettings({ theme: { id: nextId } });
      notify(`已切换为「${label}」`, true);
    } catch (err) {
      /* 公网云模式不依赖 lab；Electron 后端未启动时仍保留本地主题 */
      console.warn('主题已应用，但未能写入服务器:', err);
      if (isAccountCloudProgram()) {
        notify(`已切换为「${label}」`, true);
      } else {
        notify(`已切换为「${label}」（未同步服务器，请确认后端 npm run dev:server 已启动）`, false);
      }
    }
  }

  function syncThemePicker(theme) {
    const { id } = normalizeTheme(theme);
    renderThemePicker(themePicker, id, onThemePick);
  }

  async function openDrawer() {
    if (drawer?.classList.contains('is-open')) return;
    cachedSettings = null;
    let rawSubjectSettings = {};
    try {
      const raw = await settingsApi.get();
      rawSubjectSettings = raw?.subjectSettings ?? {};
      leftoverAiKeys = [
        ...extractLeftoverApiKeys(rawSubjectSettings),
        ...hydratedLeftoverAiKeys,
      ];
      cachedSettings = settingsWithLocalTheme({
        theme: normalizeTheme(raw.theme),
        subjectSettings: normalizeSubjectSettings(rawSubjectSettings),
      });
    } catch (err) {
      console.error('加载设置失败:', err);
      leftoverAiKeys = [];
      cachedSettings = settingsWithLocalTheme(structuredClone(DEFAULT_SETTINGS));
    }
    const settings = cachedSettings;
    syncThemePicker(settings.theme);
    syncSettingsSections();
    accountCloud?.refreshSettingsSection?.();

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
      if (apiKey) apiKey.value = '';
      if (apiModel) apiModel.value = slice.ai?.model || DEFAULT_AI.model;
      if (aiCloudOnlyHint) {
        aiCloudOnlyHint.textContent = isOnline()
          ? 'API Key 仅保存在云端，本机不保存明文。离线时云端 AI 不可用。'
          : '离线时云端 AI 不可用';
      }
      await refreshAiCredentialStatus();
      if (leftoverAiKeys.length > 0 && isLoggedIn()) {
        try {
          await migrateLeftoverAiKeys();
        } catch {
          /* migrateLeftoverAiKeys already notified; do not report success */
        }
      }
    }

    pendingIconDataUrl = null;

    backdrop?.classList.add('is-open');
    drawer?.classList.add('is-open');
    backdrop?.setAttribute('aria-hidden', 'false');
    drawer?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('settings-open');
    // 焦点顺序：进入抽屉（tabindex -1 使容器可聚焦，Tab 起点为抽屉内控件），
    // 关闭时由 closeDrawer 归还触发按钮
    drawer?.setAttribute('tabindex', '-1');
    drawer?.focus?.();
  }

  function closeDrawer() {
    backdrop?.classList.remove('is-open');
    drawer?.classList.remove('is-open');
    backdrop?.setAttribute('aria-hidden', 'true');
    drawer?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('settings-open');
    // 焦点归还：回到打开设置的触发按钮
    btnOpen?.focus?.();
  }

  btnOpen?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !drawer?.classList.contains('is-open')) return;
    // 顶层 app-dialog / ui-dialog / 账户登录·冲突层打开时 Esc 只关顶层，不连带关设置抽屉
    if (
      document.querySelector(
        '.app-dialog-root.is-open, .ui-dialog:not([hidden]), .account-login-overlay, .conflict-dialog-overlay',
      )
    ) {
      return;
    }
    closeDrawer();
  });

  brandIconInput?.addEventListener('change', async () => {
    const file = brandIconInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('请选择图片文件', false);
      return;
    }
    if (file.size > BRAND_ICON_MAX_BYTES) {
      notify('图片过大（限 500KB）', false);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > BRAND_ICON_MAX_BYTES * 1.4) {
        notify('编码后过大', false);
        return;
      }
      pendingIconDataUrl = dataUrl;
      if (brandIconPreview) brandIconPreview.src = dataUrl;
    } catch {
      notify('读取文件失败', false);
    }
  });

  btnSaveBrand?.addEventListener('click', async () => {
    const subjectId = settingsContext.subjectId;
    if (!subjectId) return;
    const title = brandTitleInput?.value?.trim();
    if (!title) {
      notify('标题不能为空', false);
      return;
    }
    setSaveBusy(btnSaveBrand, true, '保存标识');
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
      notify('已保存', true);
    } catch (err) {
      notify('保存失败: ' + err.message, false);
    } finally {
      setSaveBusy(btnSaveBrand, false, '保存标识');
    }
  });

  btnResetBrand?.addEventListener('click', async () => {
    const subjectId = settingsContext.subjectId;
    if (!subjectId) return;
    // 危险操作确认：恢复默认会覆盖自定义标题与图标
    const ok = await appConfirm('确定恢复默认标题与图标？当前自定义标识将被覆盖。', {
      title: '恢复默认',
      okText: '恢复',
      danger: true,
    });
    if (!ok) return;
    try {
      const brand = {
        title: defaultSubjectBrandTitle(subjectId),
        iconDataUrl: null,
      };
      await saveSubjectSettingsPatch(subjectId, { brand });
      applySubjectBrand(subjectId);
      syncBrandInputs(brand);
      pendingIconDataUrl = null;
      notify('已恢复默认', true);
    } catch (err) {
      notify('重置失败: ' + err.message, false);
    }
  });

  defaultPage?.addEventListener('change', async () => {
    const subjectId = settingsContext.subjectId;
    if (!subjectId || settingsContext.mode === SETTINGS_CONTEXT.hub) return;
    const pageId = defaultPage.value;
    try {
      await saveSubjectSettingsPatch(subjectId, { defaultPage: pageId });
      onDefaultPageChange?.(subjectId, pageId);
      notify('已保存', true);
    } catch (err) {
      notify('保存失败: ' + err.message, false);
    }
  });

  btnSaveAi?.addEventListener('click', async () => {
    const subjectId = settingsContext.subjectId;
    if (!subjectId) return;
    const model = apiModel?.value;
    if (!ALLOWED_MODELS.has(model)) {
      notify('不支持的模型', false);
      return;
    }
    const key = apiKey?.value?.trim() || '';
    if (apiKey) apiKey.value = '';
    setSaveBusy(btnSaveAi, true, '保存 AI 设置');
    try {
      if (key) {
        if (!isLoggedIn()) {
          notify('请先登录后再保存 API Key（密钥仅存云端）', false);
          return;
        }
        if (!isOnline()) {
          notify('离线时云端 AI 不可用', false);
          return;
        }
        await accountCloud.client.setAiCredential({
          provider: inferProviderFromApiBase(apiBase?.value),
          model,
          apiKey: key,
        });
      }

      await saveSubjectSettingsPatch(subjectId, {
        ai: {
          apiBase: apiBase?.value?.trim() || DEFAULT_AI.apiBase,
          model,
        },
      });

      if (key) {
        persistStrippedLocalAiKeys(cachedSettings?.subjectSettings ?? {});
        await refreshAiCredentialStatus();
        notify('已保存至云端', true);
      } else {
        notify('已保存', true);
      }
    } catch (err) {
      notify('保存失败: ' + err.message, false);
    } finally {
      setSaveBusy(btnSaveAi, false, '保存 AI 设置');
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
    /** 设置抽屉为应用级单例（shell 无卸载路径）；dispose 幂等，回收活动轻提示 */
    dispose() {
      dismissActiveToast();
    },
  };
}
