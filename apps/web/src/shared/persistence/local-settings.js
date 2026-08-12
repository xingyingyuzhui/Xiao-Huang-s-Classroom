/**
 * Device-local settings (theme + unmigrated subjectSettings).
 * Public web with accountCloudProgram must not call anonymous lab /api/settings.
 * Electron / flag-off still uses apps/server via settingsApi.
 */

export const THEME_STORAGE_KEY = 'xh-theme-id';
export const LOCAL_SETTINGS_KEY = 'xh-local-settings';

/** Shown on unmigrated settings surfaces when account cloud is the data plane. */
export const LOCAL_ONLY_HINT = '此数据当前仅保存在本机';

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readJson(key) {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {unknown} id
 * @returns {string | null}
 */
export function normalizeStoredThemeId(id) {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed || null;
}

/** @returns {string | null} */
export function readLocalThemeId() {
  const store = storage();
  if (!store) return null;
  try {
    return normalizeStoredThemeId(store.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** @param {string} id */
export function writeLocalThemeId(id) {
  const store = storage();
  const normalized = normalizeStoredThemeId(id);
  if (!store || !normalized) return false;
  try {
    store.setItem(THEME_STORAGE_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}

function mergeSubjectSettings(base, patch) {
  const out = { ...(base && typeof base === 'object' ? base : {}) };
  if (!patch || typeof patch !== 'object') return out;
  for (const [sid, subPatch] of Object.entries(patch)) {
    if (!subPatch || typeof subPatch !== 'object') continue;
    const prev = out[sid] && typeof out[sid] === 'object' ? out[sid] : {};
    out[sid] = { ...prev, ...subPatch };
    if (subPatch.brand && typeof subPatch.brand === 'object') {
      out[sid].brand = { ...(prev.brand || {}), ...subPatch.brand };
    }
    if (subPatch.ai && typeof subPatch.ai === 'object') {
      out[sid].ai = { ...(prev.ai || {}), ...subPatch.ai };
    }
  }
  return out;
}

/**
 * @returns {{ theme: { id: string }, subjectSettings: Record<string, unknown> }}
 */
export function readLocalSettings() {
  const blob = readJson(LOCAL_SETTINGS_KEY);
  const fromBlob =
    blob && typeof blob === 'object' && !Array.isArray(blob) ? blob : {};
  const themeFromBlob =
    fromBlob.theme && typeof fromBlob.theme === 'object' ? fromBlob.theme : {};
  const themeId =
    readLocalThemeId() || normalizeStoredThemeId(themeFromBlob.id) || 'default';
  const subjectSettings =
    fromBlob.subjectSettings && typeof fromBlob.subjectSettings === 'object'
      ? fromBlob.subjectSettings
      : {};
  return {
    theme: { id: themeId },
    subjectSettings,
  };
}

/**
 * Merge-patch local settings (same shape as lab PUT /api/settings).
 * @param {Record<string, unknown>} patch
 * @returns {{ theme: { id: string }, subjectSettings: Record<string, unknown> }}
 */
export function writeLocalSettings(patch) {
  const current = readLocalSettings();
  const next = {
    theme: { ...current.theme },
    subjectSettings: current.subjectSettings,
  };
  if (patch && typeof patch === 'object') {
    if (patch.theme && typeof patch.theme === 'object') {
      next.theme = { ...next.theme, ...patch.theme };
    }
    if (patch.subjectSettings) {
      next.subjectSettings = mergeSubjectSettings(
        next.subjectSettings,
        patch.subjectSettings,
      );
    }
  }
  const themeId = normalizeStoredThemeId(next.theme.id) || 'default';
  next.theme.id = themeId;
  writeLocalThemeId(themeId);
  writeJson(LOCAL_SETTINGS_KEY, next);
  return next;
}
