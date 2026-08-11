import { describe, expect, it } from 'vitest';
import { SyncCursorTracker } from '../src/cursor.js';

describe('SyncCursorTracker', () => {
  it('never regresses sequence', () => {
    const tracker = new SyncCursorTracker({ token: 'c-10', sequence: 10 });
    expect(tracker.advance({ token: 'c-5', sequence: 5 })).toEqual({
      accepted: false,
      reason: 'regression',
    });
    expect(tracker.current()).toEqual({ token: 'c-10', sequence: 10 });
  });

  it('advances when sequence increases', () => {
    const tracker = new SyncCursorTracker({ token: 'c-10', sequence: 10 });
    expect(tracker.advance({ token: 'c-11', sequence: 11 })).toEqual({
      accepted: true,
      cursor: { token: 'c-11', sequence: 11 },
    });
  });

  it('rejects unchanged cursor', () => {
    const tracker = new SyncCursorTracker({ token: 'c-10', sequence: 10 });
    expect(tracker.advance({ token: 'c-10', sequence: 10 })).toEqual({
      accepted: false,
      reason: 'unchanged',
    });
  });

  it('allows same sequence with new token (tie-break refresh)', () => {
    const tracker = new SyncCursorTracker({ token: 'c-10', sequence: 10 });
    expect(tracker.advance({ token: 'c-10b', sequence: 10 })).toEqual({
      accepted: true,
      cursor: { token: 'c-10b', sequence: 10 },
    });
  });

  it('restores from snapshot without regression', () => {
    const tracker = SyncCursorTracker.fromSnapshot({ token: 'c-20', sequence: 20 });
    expect(tracker.advance({ token: 'c-19', sequence: 19 }).accepted).toBe(false);
    expect(tracker.current().sequence).toBe(20);
  });
});
