import type { SyncCursorValue } from './types.js';

export type CursorAdvanceResult =
  | { accepted: true; cursor: SyncCursorValue }
  | { accepted: false; reason: 'regression' | 'unchanged' };

/** Monotonic sync cursor — never regresses sequence. */
export class SyncCursorTracker {
  private cursor: SyncCursorValue;

  constructor(initial: SyncCursorValue = { token: '', sequence: 0 }) {
    this.cursor = { ...initial };
  }

  current(): SyncCursorValue {
    return { ...this.cursor };
  }

  advance(next: SyncCursorValue): CursorAdvanceResult {
    if (next.sequence < this.cursor.sequence) {
      return { accepted: false, reason: 'regression' };
    }
    if (next.sequence === this.cursor.sequence && next.token === this.cursor.token) {
      return { accepted: false, reason: 'unchanged' };
    }
    this.cursor = { token: next.token, sequence: next.sequence };
    return { accepted: true, cursor: this.current() };
  }

  toSnapshot(): SyncCursorValue {
    return this.current();
  }

  static fromSnapshot(snapshot: SyncCursorValue): SyncCursorTracker {
    return new SyncCursorTracker(snapshot);
  }
}
