import { SUBJECT_TAB_CATALOG, READY_SUBJECT_IDS } from './tab-catalog.js';
import type { SubjectCatalogEntry } from './tab-catalog.js';

export { SUBJECT_TAB_CATALOG, READY_SUBJECT_IDS } from './tab-catalog.js';

export const HUB_BRAND_TITLE = '小黄的教室';

export const DEFAULT_AI = {
  apiBase: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
};

export const ALLOWED_AI_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const;

const ALLOWED_MODELS = new Set<string>(ALLOWED_AI_MODELS);

export type AiProviderId = 'openai' | 'deepseek';

export function getSubjectTabMeta(subjectId: string): SubjectCatalogEntry | null {
  return SUBJECT_TAB_CATALOG[subjectId] ?? null;
}

/**
 * @param {string} subjectId
 * @returns {{ brand: boolean, defaultPage: boolean, ai: boolean }}
 */
export function getSubjectCapabilities(subjectId: string): {
  brand: boolean;
  defaultPage: boolean;
  ai: boolean;
} {
  const meta = getSubjectTabMeta(subjectId);
  if (!meta) {
    return { brand: false, defaultPage: false, ai: false };
  }
  return {
    brand: true,
    defaultPage: meta.tabs.length > 1,
    ai: meta.ai,
  };
}

export function defaultSubjectBrandTitle(subjectId: string): string {
  const meta = getSubjectTabMeta(subjectId);
  return meta ? `小黄的${meta.name}教室` : HUB_BRAND_TITLE;
}

export function getDefaultPageOptions(subjectId: string): Array<{ id: string; label: string }> {
  const meta = getSubjectTabMeta(subjectId);
  if (!meta) return [];
  return meta.tabs.map((t) => ({ id: t.id, label: t.label }));
}

export function getDefaultTabId(subjectId: string): string {
  const meta = getSubjectTabMeta(subjectId);
  return meta?.defaultTabId ?? 'home';
}

function allowedDefaultPageIds(subjectId: string) {
  const meta = getSubjectTabMeta(subjectId);
  return new Set((meta?.tabs ?? []).map((t) => t.id));
}

export function isValidDefaultPage(subjectId: string, pageId: string): boolean {
  return allowedDefaultPageIds(subjectId).has(pageId);
}

/**
 * Persisted AI prefs. `apiKey` is write-only and never populated from storage.
 * Callers that still need a leftover plaintext key (Electron lab SQLite) must
 * use `extractLeftoverApiKey` on the raw blob before normalize.
 */
export interface SubjectAiSettings {
  apiBase: string;
  model: string;
  /** Write-only input; omitted on read / normalize. */
  apiKey?: string;
}

export interface SubjectSettingsEntry {
  brand: { title: string; iconDataUrl: string | null };
  defaultPage: string;
  ai: SubjectAiSettings;
  electronOrder?: number[];
}

export type SubjectSettingsMap = Record<string, SubjectSettingsEntry>;

export type LeftoverAiKey = {
  subjectId: string;
  apiKey: string;
  apiBase: string;
  model: string;
};

export function inferProviderFromApiBase(apiBase: unknown): AiProviderId {
  const base = typeof apiBase === 'string' ? apiBase : '';
  return /openai/i.test(base) ? 'openai' : 'deepseek';
}

export function isPlaintextApiKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const key = value.trim();
  if (key.length < 8) return false;
  if (key.includes('*')) return false;
  return true;
}

export function extractLeftoverApiKey(raw: unknown, subjectId: string): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  const entry = (raw as Record<string, unknown>)[subjectId];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
  const ai = (entry as { ai?: unknown }).ai;
  if (!ai || typeof ai !== 'object' || Array.isArray(ai)) return '';
  const key = (ai as { apiKey?: unknown }).apiKey;
  return isPlaintextApiKey(key) ? key.trim() : '';
}

export function extractLeftoverApiKeys(raw: unknown): LeftoverAiKey[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: LeftoverAiKey[] = [];
  for (const [subjectId, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const ai = (entry as { ai?: unknown }).ai;
    if (!ai || typeof ai !== 'object' || Array.isArray(ai)) continue;
    const rec = ai as { apiKey?: unknown; apiBase?: unknown; model?: unknown };
    if (!isPlaintextApiKey(rec.apiKey)) continue;
    const model = typeof rec.model === 'string' && ALLOWED_MODELS.has(rec.model)
      ? rec.model
      : DEFAULT_AI.model;
    out.push({
      subjectId,
      apiKey: rec.apiKey.trim(),
      apiBase: typeof rec.apiBase === 'string' && rec.apiBase.trim()
        ? rec.apiBase.trim()
        : DEFAULT_AI.apiBase,
      model,
    });
  }
  return out;
}

export function stripApiKeysFromSubjectSettings(raw: unknown): SubjectSettingsMap {
  const normalized = normalizeSubjectSettings(raw);
  for (const entry of Object.values(normalized)) {
    if (entry?.ai && 'apiKey' in entry.ai) {
      delete entry.ai.apiKey;
    }
  }
  return normalized;
}

/** Strip apiKey from a teacher.settings sync payload (idempotent). */
export function sanitizeTeacherSettingsPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const rec = payload as Record<string, unknown>;
  if (!rec.subjectSettings) return payload;
  return {
    ...rec,
    subjectSettings: stripApiKeysFromSubjectSettings(rec.subjectSettings),
  };
}

function normalizeAi(raw: Record<string, unknown> | null | undefined): SubjectAiSettings {
  const model = typeof raw?.model === 'string' ? raw.model : '';
  return {
    apiBase: typeof raw?.apiBase === 'string' && raw.apiBase.trim()
      ? raw.apiBase
      : DEFAULT_AI.apiBase,
    model: ALLOWED_MODELS.has(model) ? model : DEFAULT_AI.model,
  };
}

export function createDefaultSubjectSettings(): SubjectSettingsMap {
  const out: SubjectSettingsMap = {};
  for (const subjectId of READY_SUBJECT_IDS) {
    const meta = SUBJECT_TAB_CATALOG[subjectId];
    if (!meta) continue;
    out[subjectId] = {
      brand: {
        title: defaultSubjectBrandTitle(subjectId),
        iconDataUrl: null,
      },
      defaultPage: meta.defaultTabId,
      ai: { ...DEFAULT_AI },
    };
    if (meta.hasElectronOrder) {
      out[subjectId].electronOrder = [];
    }
  }
  return out;
}

export function normalizeSubjectSettings(raw: unknown): SubjectSettingsMap {
  const defaults = createDefaultSubjectSettings();
  const out = JSON.parse(JSON.stringify(defaults)) as SubjectSettingsMap;

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [subjectId, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (!out[subjectId] || !entry || typeof entry !== 'object') continue;
      const base = out[subjectId];
      const rec = entry as {
        brand?: { title?: unknown; iconDataUrl?: unknown };
        defaultPage?: unknown;
        ai?: Record<string, unknown>;
        electronOrder?: unknown;
      };
      if (rec.brand && typeof rec.brand === 'object') {
        base.brand = {
          title: String(rec.brand.title || base.brand.title).slice(0, 80),
          iconDataUrl: (rec.brand.iconDataUrl as string | null | undefined) ?? base.brand.iconDataUrl,
        };
      }
      if (
        typeof rec.defaultPage === 'string' &&
        isValidDefaultPage(subjectId, rec.defaultPage)
      ) {
        base.defaultPage = rec.defaultPage;
      }
      if (rec.ai && typeof rec.ai === 'object') {
        base.ai = normalizeAi({ ...base.ai, ...rec.ai });
      }
      if (subjectId === 'chemistry' && Array.isArray(rec.electronOrder)) {
        base.electronOrder = rec.electronOrder
          .map((n: unknown) => Number(n))
          .filter((n: number) => Number.isFinite(n));
      }
    }
  }

  return out;
}

export function readSubjectAiFromMap(
  subjectSettings: unknown,
  subjectId = 'chemistry',
): SubjectAiSettings {
  const map = normalizeSubjectSettings(subjectSettings);
  return map[subjectId]?.ai ?? { ...DEFAULT_AI };
}
