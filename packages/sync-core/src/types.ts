/** Pure sync domain types — no DOM/DB/fetch. */

export type SyncSessionPhase =
  | 'idle'
  | 'pushing'
  | 'conflict'
  | 'pulling'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkspaceKind = 'guest' | 'account' | 'class' | 'subject';

export type SyncContext = {
  accountId: string;
  workspaceId: string;
  subjectId: string;
  classId: string | null;
  kind: WorkspaceKind;
  /** Monotonic generation; bump invalidates in-flight results. */
  generation: number;
};

export type OutboxOperation = {
  operationId: string;
  resourceType: string;
  resourceId: string;
  payload: unknown;
  baseRevision: number | null;
  createdAt: number;
  /** Non-null marks a tombstone delete intent. */
  deletedAt: number | null;
};

export type TombstoneRecord = {
  resourceType: string;
  resourceId: string;
  operationId: string;
  deletedAt: number;
  serverAckedAt: number | null;
};

export type ConflictResolution = 'keepLocal' | 'keepCloud' | 'duplicateLocal';

export type ConflictSnapshot = {
  local: unknown;
  cloud: unknown;
  base: unknown | null;
};

export type ConflictRecord = {
  conflictId: string;
  resourceType: string;
  resourceId: string;
  snapshot: ConflictSnapshot;
  supportsDuplicateLocal: boolean;
  resolvedAt: number | null;
  resolution: ConflictResolution | null;
};

export type SyncCursorValue = {
  /** Opaque server cursor token. */
  token: string;
  /** Monotonic server change sequence. */
  sequence: number;
};

export type PushOperationResult =
  | { status: 'applied'; operationId: string }
  | { status: 'rejected'; operationId: string; reason: string }
  | { status: 'conflict'; operationId: string; conflict: ConflictRecord };

export type PushResponse = {
  generation: number;
  results: PushOperationResult[];
};

export type PullChange = {
  resourceType: string;
  resourceId: string;
  revision: number;
  payload: unknown;
  deletedAt: number | null;
};

export type PullResponse = {
  generation: number;
  cursor: SyncCursorValue;
  changes: PullChange[];
  hasMore: boolean;
};

export type SyncSessionSnapshot = {
  phase: SyncSessionPhase;
  context: SyncContext;
  online: boolean;
  /** Generation captured when the current in-flight request started. */
  requestGeneration: number | null;
  cursor: SyncCursorValue;
  conflicts: ConflictRecord[];
  lastError: string | null;
  startedAt: number | null;
  completedAt: number | null;
};

export type SyncSessionEvent =
  | { type: 'phase'; phase: SyncSessionPhase }
  | { type: 'online'; online: boolean }
  | { type: 'conflict-added'; conflict: ConflictRecord }
  | { type: 'conflict-resolved'; conflictId: string; resolution: ConflictResolution }
  | { type: 'cursor-advanced'; cursor: SyncCursorValue }
  | { type: 'stale-response'; expectedGeneration: number; receivedGeneration: number }
  | { type: 'error'; message: string };
