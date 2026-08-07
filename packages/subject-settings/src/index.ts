import { SUBJECT_TAB_CATALOG, READY_SUBJECT_IDS } from './tab-catalog.js';
import type { SubjectCatalogEntry } from './tab-catalog.js';

export { SUBJECT_TAB_CATALOG, READY_SUBJECT_IDS } from './tab-catalog.js';

export const HUB_BRAND_TITLE = '小黄的教室';

export const DEFAULT_AI = {
  apiBase: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-v4-flash',
};

const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);

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

function normalizeAi(raw: Record<string, any> | null | undefined) {
  return {
    apiBase: raw?.apiBase || DEFAULT_AI.apiBase,
    apiKey: raw?.apiKey || '',
    model: ALLOWED_MODELS.has(raw?.model as string) ? (raw?.model as string) : DEFAULT_AI.model,
  };
}

export function createDefaultSubjectSettings(): Record<string, any> {
  const out: Record<string, any> = {};
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

export function normalizeSubjectSettings(raw: unknown): Record<string, any> {
  const defaults = createDefaultSubjectSettings();
  const out = JSON.parse(JSON.stringify(defaults));

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [subjectId, entry] of Object.entries(raw)) {
      if (!out[subjectId] || !entry || typeof entry !== 'object') continue;
      const base = out[subjectId];
      if (entry.brand && typeof entry.brand === 'object') {
        base.brand = {
          title: String(entry.brand.title || base.brand.title).slice(0, 80),
          iconDataUrl: entry.brand.iconDataUrl ?? base.brand.iconDataUrl,
        };
      }
      if (
        typeof entry.defaultPage === 'string' &&
        isValidDefaultPage(subjectId, entry.defaultPage)
      ) {
        base.defaultPage = entry.defaultPage;
      }
      if (entry.ai && typeof entry.ai === 'object') {
        base.ai = normalizeAi({ ...base.ai, ...entry.ai });
      }
      if (subjectId === 'chemistry' && Array.isArray(entry.electronOrder)) {
        base.electronOrder = entry.electronOrder
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
): Record<string, any> {
  const map = normalizeSubjectSettings(subjectSettings);
  return map[subjectId]?.ai ?? { ...DEFAULT_AI };
}
