import { describe, it, expect } from 'vitest';
import { ResourceRegistry } from '../../apps/web/src/sync/resource-registry.js';
import { teacherSettingsAdapter, classSettingsAdapter } from '../../apps/web/src/sync/adapters/settings-adapter.js';
import { studentRosterAdapter } from '../../apps/web/src/sync/adapters/roster-adapter.js';
import { registerWave1Adapters } from '../../apps/web/src/sync/adapters/index.js';
import { computePayloadHashSync } from '../../apps/web/src/sync/adapters/hash.js';

describe('Wave 1 resource adapters', () => {
  it('teacherSettingsAdapter has correct resourceType and schemaVersion', () => {
    expect(teacherSettingsAdapter.resourceType).toBe('teacher.settings');
    expect(teacherSettingsAdapter.schemaVersion).toBe(1);
  });

  it('classSettingsAdapter summarize includes class name', () => {
    expect(classSettingsAdapter.summarize({ className: '高一3班' })).toBe('班级设置: 高一3班');
    expect(classSettingsAdapter.summarize({})).toBe('班级设置');
  });

  it('studentRosterAdapter summarize shows student count', () => {
    const payload = { students: [{ name: 'A' }, { name: 'B' }] };
    expect(studentRosterAdapter.summarize(payload)).toBe('学生名单 (2人)');
    expect(studentRosterAdapter.summarize({})).toBe('学生名单 (0人)');
  });

  it('studentRosterAdapter supportsDuplicateLocal is true', () => {
    expect(studentRosterAdapter.supportsDuplicateLocal).toBe(true);
  });

  it('computePayloadHashSync produces stable deterministic hash', () => {
    const payload = { a: 1, b: 'hello' };
    const h1 = computePayloadHashSync(payload);
    const h2 = computePayloadHashSync(payload);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{8}$/);
  });

  it('computePayloadHashSync produces different hash for different payloads', () => {
    expect(computePayloadHashSync({ x: 1 })).not.toBe(computePayloadHashSync({ x: 2 }));
  });

  it('registerWave1Adapters registers all 3 types', () => {
    const registry = new ResourceRegistry();
    registerWave1Adapters(registry);
    expect(registry.has('teacher.settings')).toBe(true);
    expect(registry.has('class.settings')).toBe(true);
    expect(registry.has('class.roster')).toBe(true);
    expect(registry.listRegistered()).toHaveLength(3);
  });
});
