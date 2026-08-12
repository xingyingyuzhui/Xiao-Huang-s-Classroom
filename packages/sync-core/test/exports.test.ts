import { describe, expect, it } from 'vitest';
import { ConflictRegistry, Outbox, SyncCursorTracker, SyncSession } from '../src/index.js';

describe('sync-core public exports', () => {
  it('constructs the session stack from the package entry', () => {
    const session = new SyncSession({
      context: {
        accountId: 'acct-1',
        workspaceId: 'ws-1',
        subjectId: 'math',
        classId: null,
        kind: 'account',
        generation: 1,
      },
      outbox: new Outbox(),
      cursor: new SyncCursorTracker(),
      conflicts: new ConflictRegistry(),
    });
    session.setOnline(true);
    expect(session.startSync(1).started).toBe(true);
    expect(session.getPhase()).toBe('pushing');
  });
});
