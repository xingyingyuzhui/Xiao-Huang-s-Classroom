import {
  classRosterPayloadSchema,
  classSettingsPayloadSchema,
  teacherSettingsPayloadSchema,
} from '@xiaohuang/contracts';
import { applyTheme } from '../shared/theme/apply.js';
import { writeLocalSettings, writeLocalThemeId } from '../shared/persistence/local-settings.js';
import { hydrateSettingsCache, applyHubBrand, applySubjectBrand } from '../shared/ui/settings.js';
import { getCurrentSubjectId } from '../subjects/session.js';
import { replaceRoster, clearRoster } from './roster-store.js';

const SECRET_KEYS = new Set(['apiKey', 'refreshToken', 'accessToken', 'password']);

export function stripSecretsFromSettings(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripSecretsFromSettings(item));
  }
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key)) continue;
    out[key] = stripSecretsFromSettings(nested);
  }
  return out;
}

export function parseTeacherSettingsPayload(payload: unknown) {
  const stripped = stripSecretsFromSettings(payload);
  return teacherSettingsPayloadSchema.parse(stripped);
}

export function parseClassSettingsPayload(payload: unknown) {
  return classSettingsPayloadSchema.parse(payload ?? {});
}

export function parseClassRosterPayload(payload: unknown) {
  return classRosterPayloadSchema.parse(payload ?? { students: [] });
}

export type Wave1ApplyResult = {
  resourceType: string;
  applied: boolean;
  reason?: string;
};

/**
 * Project a pulled Wave 1 resource into live UI + device-local prefs.
 * Does not write IndexedDB (caller persists first).
 */
export function applyWave1Change(change: {
  resourceType: string;
  resourceId: string;
  payload: unknown;
  deletedAt: number | null;
}): Wave1ApplyResult {
  if (change.resourceType === 'teacher.settings') {
    if (change.deletedAt != null) {
      return { resourceType: change.resourceType, applied: true };
    }
    const parsed = parseTeacherSettingsPayload(change.payload);
    if (parsed.theme?.id) {
      writeLocalThemeId(parsed.theme.id);
      applyTheme({ id: parsed.theme.id });
    }
    const next = {
      theme: parsed.theme ?? { id: 'default' },
      subjectSettings: (parsed.subjectSettings ?? {}) as Record<string, unknown>,
    };
    writeLocalSettings(next);
    const cached = hydrateSettingsCache(next);
    if (cached) {
      const subjectId = getCurrentSubjectId();
      if (subjectId) applySubjectBrand(subjectId, cached);
      else applyHubBrand();
    }
    return { resourceType: change.resourceType, applied: true };
  }

  if (change.resourceType === 'class.settings') {
    if (change.deletedAt != null) {
      return { resourceType: change.resourceType, applied: true };
    }
    parseClassSettingsPayload(change.payload);
    return { resourceType: change.resourceType, applied: true };
  }

  if (change.resourceType === 'class.roster') {
    if (change.deletedAt != null) {
      clearRoster({ persist: false });
      return { resourceType: change.resourceType, applied: true };
    }
    const parsed = parseClassRosterPayload(change.payload);
    replaceRoster(parsed.students, { persist: false });
    return { resourceType: change.resourceType, applied: true };
  }

  return { resourceType: change.resourceType, applied: false, reason: 'not-wave1' };
}
