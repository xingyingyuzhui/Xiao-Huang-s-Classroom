import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  classRosterPayloadSchema,
  classSettingsPayloadSchema,
  teacherSettingsPayloadSchema,
} from '@xiaohuang/contracts';
import {
  applyWave1Change,
  parseClassRosterPayload,
  parseTeacherSettingsPayload,
  stripSecretsFromSettings,
} from '../../apps/web/src/sync/apply-wave1.js';
import {
  addRosterStudent,
  clearRoster,
  getRosterStudents,
  importRosterNames,
  replaceRoster,
  setRosterPersistHandler,
} from '../../apps/web/src/sync/roster-store.js';
import { teacherSettingsAdapter, classSettingsAdapter } from '../../apps/web/src/sync/adapters/settings-adapter.js';
import { studentRosterAdapter } from '../../apps/web/src/sync/adapters/roster-adapter.js';

describe('Wave 1 payload schemas', () => {
  it('accepts teacher settings without secrets', () => {
    const parsed = teacherSettingsPayloadSchema.parse({
      theme: { id: 'reagent' },
      subjectSettings: { chemistry: { defaultPage: 'periodic' } },
    });
    expect(parsed.theme?.id).toBe('reagent');
  });

  it('accepts class settings and roster bounds', () => {
    expect(classSettingsPayloadSchema.parse({ className: '高一3班' }).className).toBe('高一3班');
    expect(classRosterPayloadSchema.parse({ students: [{ id: 'stu_1', name: '小黄' }] }).students).toHaveLength(
      1,
    );
    expect(classRosterPayloadSchema.safeParse({ students: [{ id: '', name: '' }] }).success).toBe(false);
  });
});

describe('stripSecretsFromSettings', () => {
  it('removes apiKey and tokens recursively', () => {
    const cleaned = stripSecretsFromSettings({
      theme: { id: 'default' },
      subjectSettings: {
        chemistry: {
          ai: { model: 'deepseek-v4-flash', apiKey: 'sk-secret', apiBase: 'https://api.example' },
          brand: { title: '化学' },
        },
      },
      refreshToken: 'nope',
    }) as {
      subjectSettings: { chemistry: { ai: Record<string, unknown> } };
      refreshToken?: string;
    };
    expect(cleaned.refreshToken).toBeUndefined();
    expect(cleaned.subjectSettings.chemistry.ai.apiKey).toBeUndefined();
    expect(cleaned.subjectSettings.chemistry.ai.model).toBe('deepseek-v4-flash');
  });

  it('parseTeacherSettingsPayload drops secrets before schema parse', () => {
    const parsed = parseTeacherSettingsPayload({
      theme: { id: 'pixel' },
      subjectSettings: { math: { ai: { apiKey: 'sk-hidden', model: 'x' } } },
    });
    const mathAi = (parsed.subjectSettings as { math?: { ai?: Record<string, unknown> } })?.math?.ai;
    expect(mathAi?.apiKey).toBeUndefined();
    expect(mathAi?.model).toBe('x');
  });
});

describe('Wave 1 adapters parse', () => {
  it('teacher/class/roster adapters expose parse', () => {
    expect(teacherSettingsAdapter.parse?.({ theme: { id: 'default' } })).toMatchObject({
      theme: { id: 'default' },
    });
    expect(classSettingsAdapter.parse?.({ className: '二班' })).toMatchObject({ className: '二班' });
    expect(studentRosterAdapter.parse?.({ students: [{ id: 'a', name: 'A' }] })).toMatchObject({
      students: [{ id: 'a', name: 'A' }],
    });
  });
});

describe('roster store', () => {
  beforeEach(() => {
    setRosterPersistHandler(null);
    clearRoster({ persist: false });
  });

  afterEach(() => {
    setRosterPersistHandler(null);
    clearRoster({ persist: false });
  });

  it('adds updates imports and replace without calling lab API', async () => {
    await addRosterStudent('甲');
    await addRosterStudent('乙');
    expect(getRosterStudents().map((row) => row.name)).toEqual(['甲', '乙']);
    const first = getRosterStudents()[0];
    await importRosterNames(['丙'], 'append');
    expect(getRosterStudents()).toHaveLength(3);
    await importRosterNames(['丁'], 'replace');
    expect(getRosterStudents().map((row) => row.name)).toEqual(['丁']);
    replaceRoster([{ id: first.id, name: '甲改' }], { persist: false });
    expect(getRosterStudents()[0]?.name).toBe('甲改');
  });

  it('persist handler receives the latest snapshot', async () => {
    const snapshots: unknown[] = [];
    setRosterPersistHandler(async (students) => {
      snapshots.push(students.map((row) => row.name));
    });
    await addRosterStudent('同步生');
    expect(snapshots).toEqual([['同步生']]);
  });
});

describe('applyWave1Change roster', () => {
  beforeEach(() => {
    setRosterPersistHandler(null);
    clearRoster({ persist: false });
  });

  it('replaces live roster from a pulled snapshot without persisting again', () => {
    let persistCalls = 0;
    setRosterPersistHandler(async () => {
      persistCalls += 1;
    });
    const result = applyWave1Change({
      resourceType: 'class.roster',
      resourceId: 'default',
      payload: { students: [{ id: 'stu_cloud', name: '云端生' }] },
      deletedAt: null,
    });
    expect(result.applied).toBe(true);
    expect(getRosterStudents()).toEqual([{ id: 'stu_cloud', name: '云端生' }]);
    expect(persistCalls).toBe(0);
  });

  it('clears roster on tombstone', () => {
    replaceRoster([{ id: 'stu_1', name: '本地' }], { persist: false });
    applyWave1Change({
      resourceType: 'class.roster',
      resourceId: 'default',
      payload: { students: [{ id: 'stu_1', name: '本地' }] },
      deletedAt: Date.now(),
    });
    expect(getRosterStudents()).toEqual([]);
  });

  it('parses roster payload strictly', () => {
    expect(() => parseClassRosterPayload({ students: [{ id: 'x' }] })).toThrow();
  });
});
