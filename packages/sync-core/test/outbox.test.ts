import { describe, expect, it } from 'vitest';
import { Outbox } from '../src/outbox.js';
import type { OutboxOperation } from '../src/types.js';

function makeOperation(overrides: Partial<OutboxOperation> = {}): OutboxOperation {
  return {
    operationId: 'op-1',
    resourceType: 'graph',
    resourceId: 'res-1',
    payload: { title: 'demo' },
    baseRevision: 1,
    createdAt: 100,
    deletedAt: null,
    ...overrides,
  };
}

describe('Outbox duplicate operation idempotency', () => {
  it('rejects duplicate pending operationId', () => {
    const outbox = new Outbox();
    expect(outbox.append(makeOperation())).toEqual({ accepted: true });
    expect(outbox.append(makeOperation())).toEqual({
      accepted: false,
      reason: 'duplicate-operation',
    });
    expect(outbox.listPending()).toHaveLength(1);
  });

  it('rejects re-append after markApplied', () => {
    const outbox = new Outbox();
    outbox.append(makeOperation());
    outbox.markApplied('op-1', 200);
    expect(outbox.append(makeOperation())).toEqual({
      accepted: false,
      reason: 'duplicate-operation',
    });
    expect(outbox.hasApplied('op-1')).toBe(true);
  });

  it('markApplied is idempotent for already-applied operationId', () => {
    const outbox = new Outbox();
    outbox.append(makeOperation());
    outbox.markApplied('op-1', 200);
    expect(() => outbox.markApplied('op-1', 300)).not.toThrow();
    expect(() => outbox.markApplied('op-missing', 300)).toThrow(/not pending/);
  });
});

describe('Outbox tombstone retention', () => {
  it('cannot physically delete tombstone before server ack', () => {
    const outbox = new Outbox();
    outbox.append(
      makeOperation({
        deletedAt: 150,
      }),
    );

    expect(outbox.canPhysicallyDeleteTombstone('graph', 'res-1', 1_000, 10_000)).toBe(false);
    expect(outbox.purgeTombstone('graph', 'res-1', 1_000, 10_000)).toBe(false);
    expect(outbox.getTombstone('graph', 'res-1')).not.toBeNull();
    expect(outbox.canPhysicallyDeleteTombstone('graph', 'missing', 1_000, 10_000)).toBe(false);
  });

  it('cannot physically delete tombstone before retention elapses after ack', () => {
    const outbox = new Outbox();
    outbox.append(makeOperation({ deletedAt: 150 }));
    outbox.markApplied('op-1', 500);

    expect(outbox.canPhysicallyDeleteTombstone('graph', 'res-1', 1_000, 1_200)).toBe(false);
    expect(outbox.purgeTombstone('graph', 'res-1', 1_000, 1_200)).toBe(false);
  });

  it('does not ack a replaced tombstone for an older delete', () => {
    const outbox = new Outbox();
    outbox.append(makeOperation({ operationId: 'op-old', deletedAt: 100 }));
    outbox.append(makeOperation({ operationId: 'op-new', deletedAt: 200 }));
    outbox.markApplied('op-old', 300);
    expect(outbox.getTombstone('graph', 'res-1')?.serverAckedAt).toBeNull();
    outbox.markApplied('op-new', 400);
    expect(outbox.getTombstone('graph', 'res-1')?.serverAckedAt).toBe(400);
  });

  it('allows physical delete after server ack and retention', () => {
    const outbox = new Outbox();
    outbox.append(makeOperation({ deletedAt: 150 }));
    outbox.markApplied('op-1', 500);

    expect(outbox.canPhysicallyDeleteTombstone('graph', 'res-1', 1_000, 1_501)).toBe(true);
    expect(outbox.purgeTombstone('graph', 'res-1', 1_000, 1_501)).toBe(true);
    expect(outbox.getTombstone('graph', 'res-1')).toBeNull();
  });
});

describe('Outbox snapshot recovery', () => {
  it('restores pending, applied, and tombstones', () => {
    const outbox = new Outbox();
    outbox.append(makeOperation({ operationId: 'op-1' }));
    outbox.append(
      makeOperation({
        operationId: 'op-2',
        resourceId: 'res-2',
        deletedAt: 120,
      }),
    );
    outbox.markApplied('op-1', 300);

    const restored = Outbox.fromSnapshot(outbox.toSnapshot());
    expect(restored.listPending()).toHaveLength(1);
    expect(restored.hasApplied('op-1')).toBe(true);
    expect(restored.getTombstone('graph', 'res-2')?.serverAckedAt).toBeNull();
  });
});
