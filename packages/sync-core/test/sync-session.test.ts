import { describe, expect, it } from 'vitest';
import { Outbox } from '../src/outbox.js';
import { SyncSession } from '../src/sync-session.js';
import type { SyncContext } from '../src/types.js';

function makeContext(overrides: Partial<SyncContext> = {}): SyncContext {
  return {
    accountId: 'acct-1',
    workspaceId: 'ws-1',
    subjectId: 'math',
    classId: null,
    kind: 'account',
    generation: 1,
    ...overrides,
  };
}

function makeSession(overrides: Partial<SyncContext> = {}): SyncSession {
  const session = new SyncSession({ context: makeContext(overrides) });
  session.setOnline(true);
  return session;
}

describe('SyncSession out-of-order responses', () => {
  it('ignores push response with stale generation', () => {
    const session = makeSession({ generation: 2 });
    session.startSync(100);
    session.bumpContextGeneration();

    const result = session.handlePushResponse({ generation: 2, results: [] }, 200);
    expect(result).toEqual({ handled: false, reason: 'stale-response' });
    expect(session.getPhase()).toBe('pushing');
    expect(session.drainEvents().some((event) => event.type === 'stale-response')).toBe(true);
  });

  it('ignores pull response with stale generation', () => {
    const session = makeSession({ generation: 3 });
    session.startSync(100);
    session.handlePushResponse({ generation: 3, results: [] }, 200);
    session.bumpContextGeneration();

    const result = session.handlePullResponse({
      generation: 3,
      cursor: { token: 'c-1', sequence: 1 },
      changes: [],
      hasMore: false,
    });
    expect(result).toEqual({ handled: false, reason: 'stale-response' });
    expect(session.getPhase()).toBe('pulling');
  });
});

describe('SyncSession cancel transitions', () => {
  it('cancels from pushing', () => {
    const session = makeSession();
    session.startSync(100);
    expect(session.cancel()).toBe('cancelled');
    expect(session.getPhase()).toBe('cancelled');
  });

  it('cancels from pulling', () => {
    const session = makeSession();
    session.startSync(100);
    session.handlePushResponse({ generation: 1, results: [] }, 200);
    expect(session.getPhase()).toBe('pulling');
    expect(session.cancel()).toBe('cancelled');
  });

  it('does not cancel from idle', () => {
    const session = makeSession();
    expect(session.cancel()).toBe('idle');
  });

  it('rejects in-flight response after cancel', () => {
    const session = makeSession();
    session.startSync(100);
    session.cancel();
    expect(session.handlePushResponse({ generation: 1, results: [] }, 200)).toEqual({
      handled: false,
      reason: 'wrong-phase',
    });
  });
});

describe('SyncSession network online', () => {
  it('updates online flag without auto push', () => {
    const session = new SyncSession({ context: makeContext() });
    session.setOnline(true);
    expect(session.isOnline()).toBe(true);
    expect(session.getPhase()).toBe('idle');

    session.setOnline(false);
    session.setOnline(true);
    expect(session.getPhase()).toBe('idle');
  });

  it('requires manual startSync even when online', () => {
    const session = new SyncSession({ context: makeContext() });
    session.setOnline(true);
    expect(session.startSync(100).started).toBe(true);
  });

  it('refuses to start while offline', () => {
    const session = new SyncSession({ context: makeContext() });
    expect(session.startSync(100)).toEqual({ started: false, reason: 'offline' });
    session.setOnline(true);
    session.setOnline(true);
    expect(session.startSync(100).started).toBe(true);
  });
});

describe('SyncSession restart recovery', () => {
  it('restores persisted session snapshot and continues sync', () => {
    const outbox = new Outbox();
    outbox.append({
      operationId: 'op-1',
      resourceType: 'graph',
      resourceId: 'res-1',
      payload: {},
      baseRevision: null,
      createdAt: 50,
      deletedAt: null,
    });

    const original = new SyncSession({ context: makeContext(), outbox });
    original.setOnline(true);
    original.startSync(100);
    original.handlePushResponse({ generation: 1, results: [] }, 200);

    const snapshot = original.toSnapshot();
    const outboxSnapshot = outbox.toSnapshot();
    const restoredOutbox = Outbox.fromSnapshot(outboxSnapshot);
    const restored = SyncSession.fromSnapshot(snapshot, restoredOutbox);

    expect(restored.getPhase()).toBe('pulling');
    expect(restored.getContext()).toEqual(snapshot.context);
    expect(restoredOutbox.listPending()).toHaveLength(1);

    const pull = restored.handlePullResponse({
      generation: 1,
      cursor: { token: 'c-2', sequence: 2 },
      changes: [],
      hasMore: false,
    });
    expect(pull).toEqual({ handled: true, phase: 'completed' });
    expect(restored.cursor.current()).toEqual({ token: 'c-2', sequence: 2 });
  });
});

describe('SyncSession conflict flow', () => {
  it('enters conflict phase and blocks new sync until resolved', () => {
    const session = makeSession();
    session.startSync(100);
    session.handlePushResponse(
      {
        generation: 1,
        results: [
          {
            status: 'conflict',
            operationId: 'op-1',
            conflict: {
              conflictId: 'c-1',
              resourceType: 'graph',
              resourceId: 'res-1',
              snapshot: { local: 1, cloud: 2, base: 0 },
              supportsDuplicateLocal: false,
              resolvedAt: null,
              resolution: null,
            },
          },
        ],
      },
      200,
    );

    expect(session.getPhase()).toBe('conflict');
    expect(session.startSync(300)).toEqual({ started: false, reason: 'not-idle' });

    session.resolveConflict('c-1', 'keepLocal', 400);
    expect(session.getPhase()).toBe('idle');
  });

  it('blocks startSync from idle when unresolved conflicts remain', () => {
    const session = makeSession();
    session.conflicts.register({
      conflictId: 'c-1',
      resourceType: 'graph',
      resourceId: 'res-1',
      snapshot: { local: 1, cloud: 2, base: 0 },
      supportsDuplicateLocal: false,
    });
    expect(session.startSync(100)).toEqual({ started: false, reason: 'unresolved-conflicts' });
  });

  it('does not overwrite unresolved conflict when push returns duplicate resource conflict', () => {
    const session = makeSession();
    session.startSync(100);
    session.handlePushResponse(
      {
        generation: 1,
        results: [
          {
            status: 'conflict',
            operationId: 'op-1',
            conflict: {
              conflictId: 'c-1',
              resourceType: 'graph',
              resourceId: 'res-1',
              snapshot: { local: 'keep-me', cloud: 'cloud', base: 'base' },
              supportsDuplicateLocal: false,
              resolvedAt: null,
              resolution: null,
            },
          },
          {
            status: 'conflict',
            operationId: 'op-2',
            conflict: {
              conflictId: 'c-2',
              resourceType: 'graph',
              resourceId: 'res-1',
              snapshot: { local: 'new', cloud: 'new-cloud', base: 'new-base' },
              supportsDuplicateLocal: true,
              resolvedAt: null,
              resolution: null,
            },
          },
        ],
      },
      200,
    );

    expect(session.conflicts.listUnresolved()).toHaveLength(1);
    expect(session.conflicts.get('c-1')?.snapshot.local).toBe('keep-me');
    expect(session.conflicts.get('c-2')).toBeNull();
  });
});

describe('SyncSession full happy path', () => {
  it('idle → pushing → pulling → completed', () => {
    const session = makeSession();
    expect(session.startSync(100)).toEqual({ started: true, phase: 'pushing' });

    expect(session.handlePushResponse({ generation: 1, results: [] }, 200)).toEqual({
      handled: true,
      phase: 'pulling',
    });

    expect(
      session.handlePullResponse({
        generation: 1,
        cursor: { token: 'c-4', sequence: 4 },
        changes: [],
        hasMore: true,
      }),
    ).toEqual({ handled: true, phase: 'pulling' });

    expect(
      session.handlePullResponse({
        generation: 1,
        cursor: { token: 'c-5', sequence: 5 },
        changes: [],
        hasMore: false,
      }),
    ).toEqual({ handled: true, phase: 'completed' });

    expect(session.cursor.current().sequence).toBe(5);
  });
});

describe('SyncSession push result statuses', () => {
  it('applies and skips rejected operations then pulls', () => {
    const outbox = new Outbox();
    outbox.append({
      operationId: 'op-ok',
      resourceType: 'graph',
      resourceId: 'res-1',
      payload: {},
      baseRevision: null,
      createdAt: 1,
      deletedAt: null,
    });
    const session = new SyncSession({ context: makeContext(), outbox, online: true });
    session.startSync(100);
    expect(
      session.handlePushResponse(
        {
          generation: 1,
          results: [
            { status: 'applied', operationId: 'op-ok' },
            { status: 'rejected', operationId: 'op-bad', reason: 'schema' },
          ],
        },
        200,
      ),
    ).toEqual({ handled: true, phase: 'pulling' });
    expect(outbox.hasApplied('op-ok')).toBe(true);
  });

  it('rejects pull when not pulling and updates context generation', () => {
    const session = makeSession();
    expect(
      session.handlePullResponse({
        generation: 1,
        cursor: { token: 'c', sequence: 1 },
        changes: [],
        hasMore: false,
      }),
    ).toEqual({ handled: false, reason: 'wrong-phase' });
    expect(session.handlePushResponse({ generation: 1, results: [] }, 1)).toEqual({
      handled: false,
      reason: 'wrong-phase',
    });

    session.startSync(100);
    session.updateContext(makeContext({ generation: 1, classId: 'cls-1' }));
    session.bumpContextGeneration();
    expect(session.getContext().generation).toBe(2);
  });
});

describe('SyncSession fail and reset', () => {
  it('ignores fail from idle and resets after a live failure', () => {
    const session = makeSession();
    expect(session.fail('nope', 1)).toBe('idle');
    expect(session.resolveConflict('missing', 'keepLocal', 1)).toBeNull();

    session.startSync(100);
    expect(session.fail('push exploded', 200)).toBe('failed');
    expect(session.getPhase()).toBe('failed');
    session.resetToIdle();
    expect(session.getPhase()).toBe('idle');
    expect(session.toSnapshot().lastError).toBeNull();
  });
});
