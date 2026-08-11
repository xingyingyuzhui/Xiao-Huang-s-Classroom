/** Public entry — explicit named exports (no bare export *). */
export { Outbox } from './outbox.js';
export type { OutboxAppendResult, OutboxSnapshot } from './outbox.js';
export { SyncCursorTracker } from './cursor.js';
export type { CursorAdvanceResult } from './cursor.js';
export { ConflictRegistry } from './conflict.js';
export type {
  RegisterConflictInput,
  RegisterConflictResult,
  ResolveConflictResult,
} from './conflict.js';
export { SyncSession } from './sync-session.js';
export type { StartSyncResult, HandlePushResult, HandlePullResult } from './sync-session.js';
export type {
  ConflictRecord,
  ConflictResolution,
  ConflictSnapshot,
  OutboxOperation,
  PullChange,
  PullResponse,
  PushOperationResult,
  PushResponse,
  SyncContext,
  SyncCursorValue,
  SyncSessionEvent,
  SyncSessionPhase,
  SyncSessionSnapshot,
  TombstoneRecord,
  WorkspaceKind,
} from './types.js';
