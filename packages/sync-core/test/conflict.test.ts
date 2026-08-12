import { describe, expect, it } from 'vitest';
import { ConflictRegistry } from '../src/conflict.js';

describe('ConflictRegistry', () => {
  it('does not overwrite unresolved state for the same resource', () => {
    const registry = new ConflictRegistry();
    const first = registry.register({
      conflictId: 'c-1',
      resourceType: 'graph',
      resourceId: 'res-1',
      snapshot: { local: { v: 1 }, cloud: { v: 2 }, base: { v: 0 } },
      supportsDuplicateLocal: false,
    });
    const second = registry.register({
      conflictId: 'c-2',
      resourceType: 'graph',
      resourceId: 'res-1',
      snapshot: { local: { v: 9 }, cloud: { v: 8 }, base: { v: 7 } },
      supportsDuplicateLocal: true,
    });

    expect(first.registered).toBe(true);
    if (!first.registered) throw new Error('expected registered');
    expect(second).toEqual({
      registered: false,
      reason: 'already-unresolved',
      existing: first.conflict,
    });
    expect(registry.listUnresolved()).toHaveLength(1);
    expect(registry.get('c-1')?.snapshot.local).toEqual({ v: 1 });
  });

  it('keeps triple snapshot until resolved', () => {
    const registry = new ConflictRegistry();
    registry.register({
      conflictId: 'c-1',
      resourceType: 'graph',
      resourceId: 'res-1',
      snapshot: { local: 'L', cloud: 'C', base: 'B' },
      supportsDuplicateLocal: true,
    });

    const resolved = registry.resolve('c-1', 'duplicateLocal', 100);
    expect(resolved.resolved).toBe(true);
    if (resolved.resolved) {
      expect(resolved.conflict.snapshot).toEqual({ local: 'L', cloud: 'C', base: 'B' });
      expect(resolved.conflict.resolution).toBe('duplicateLocal');
    }
  });

  it('rejects duplicateLocal when unsupported', () => {
    const registry = new ConflictRegistry();
    registry.register({
      conflictId: 'c-1',
      resourceType: 'graph',
      resourceId: 'res-1',
      snapshot: { local: 'L', cloud: 'C', base: 'B' },
      supportsDuplicateLocal: false,
    });

    expect(registry.resolve('c-1', 'duplicateLocal', 100)).toEqual({
      resolved: false,
      reason: 'unsupported-resolution',
    });
  });

  it('resolves lookup and snapshot restore edges', () => {
    const registry = new ConflictRegistry();
    expect(registry.resolve('missing', 'keepLocal', 1)).toEqual({
      resolved: false,
      reason: 'not-found',
    });
    expect(registry.getUnresolvedByResource('graph', 'res-1')).toBeNull();

    registry.register({
      conflictId: 'c-1',
      resourceType: 'graph',
      resourceId: 'res-1',
      snapshot: { local: 'L', cloud: 'C', base: 'B' },
      supportsDuplicateLocal: true,
    });
    expect(registry.getUnresolvedByResource('graph', 'res-1')?.conflictId).toBe('c-1');
    expect(registry.resolve('c-1', 'keepCloud', 50).resolved).toBe(true);
    expect(registry.resolve('c-1', 'keepLocal', 60)).toEqual({
      resolved: false,
      reason: 'already-resolved',
    });
    expect(registry.getUnresolvedByResource('graph', 'res-1')).toBeNull();

    const restored = ConflictRegistry.fromSnapshot([
      {
        conflictId: 'c-open',
        resourceType: 'settings',
        resourceId: 'default',
        snapshot: { local: 1, cloud: 2, base: null },
        supportsDuplicateLocal: false,
        resolvedAt: null,
        resolution: null,
      },
      {
        conflictId: 'c-done',
        resourceType: 'roster',
        resourceId: 'default',
        snapshot: { local: 3, cloud: 4, base: 2 },
        supportsDuplicateLocal: true,
        resolvedAt: 9,
        resolution: 'keepLocal',
      },
    ]);
    expect(restored.list()).toHaveLength(2);
    expect(restored.listUnresolved()).toHaveLength(1);
    expect(restored.getUnresolvedByResource('settings', 'default')?.conflictId).toBe('c-open');
    expect(restored.getUnresolvedByResource('roster', 'default')).toBeNull();
  });
});
