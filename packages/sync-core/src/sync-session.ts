import { ConflictRegistry } from './conflict.js';
import { SyncCursorTracker } from './cursor.js';
import { Outbox } from './outbox.js';
import type {
  ConflictRecord,
  ConflictResolution,
  PullResponse,
  PushResponse,
  SyncContext,
  SyncSessionEvent,
  SyncSessionPhase,
  SyncSessionSnapshot,
} from './types.js';

export type StartSyncResult =
  | { started: true; phase: 'pushing' }
  | { started: false; reason: 'not-idle' | 'offline' | 'unresolved-conflicts' };

export type HandlePushResult =
  | { handled: true; phase: SyncSessionPhase }
  | { handled: false; reason: 'stale-response' | 'wrong-phase' | 'cancelled' };

export type HandlePullResult =
  | { handled: true; phase: SyncSessionPhase }
  | { handled: false; reason: 'stale-response' | 'wrong-phase' | 'cancelled' };

const ACTIVE_PHASES: ReadonlySet<SyncSessionPhase> = new Set(['pushing', 'pulling', 'conflict']);

/** Manual sync state machine — network online never auto-starts push. */
export class SyncSession {
  private phase: SyncSessionPhase = 'idle';
  private context: SyncContext;
  private online = false;
  private requestGeneration: number | null = null;
  private cancelRequested = false;
  private lastError: string | null = null;
  private startedAt: number | null = null;
  private completedAt: number | null = null;
  private readonly events: SyncSessionEvent[] = [];
  readonly outbox: Outbox;
  readonly conflicts: ConflictRegistry;
  readonly cursor: SyncCursorTracker;

  constructor(options: {
    context: SyncContext;
    outbox?: Outbox;
    conflicts?: ConflictRegistry;
    cursor?: SyncCursorTracker;
    online?: boolean;
  }) {
    this.context = { ...options.context };
    this.outbox = options.outbox ?? new Outbox();
    this.conflicts = options.conflicts ?? new ConflictRegistry();
    this.cursor = options.cursor ?? new SyncCursorTracker();
    this.online = options.online ?? false;
  }

  getPhase(): SyncSessionPhase {
    return this.phase;
  }

  getContext(): SyncContext {
    return { ...this.context };
  }

  isOnline(): boolean {
    return this.online;
  }

  drainEvents(): SyncSessionEvent[] {
    const drained = [...this.events];
    this.events.length = 0;
    return drained;
  }

  /** Network recovery only updates connectivity — never triggers push. */
  setOnline(online: boolean): void {
    if (this.online === online) {
      return;
    }
    this.online = online;
    this.events.push({ type: 'online', online });
  }

  /** Context generation bump invalidates in-flight request results. */
  updateContext(next: SyncContext): void {
    const generationChanged =
      next.generation !== this.context.generation ||
      next.accountId !== this.context.accountId ||
      next.workspaceId !== this.context.workspaceId ||
      next.subjectId !== this.context.subjectId ||
      next.classId !== this.context.classId ||
      next.kind !== this.context.kind;

    this.context = { ...next };

    if (generationChanged && this.requestGeneration !== null) {
      this.requestGeneration = null;
    }
  }

  bumpContextGeneration(): void {
    this.updateContext({
      ...this.context,
      generation: this.context.generation + 1,
    });
  }

  startSync(now: number): StartSyncResult {
    if (this.phase !== 'idle') {
      return { started: false, reason: 'not-idle' };
    }
    if (!this.online) {
      return { started: false, reason: 'offline' };
    }
    if (this.conflicts.listUnresolved().length > 0) {
      return { started: false, reason: 'unresolved-conflicts' };
    }

    this.phase = 'pushing';
    this.requestGeneration = this.context.generation;
    this.cancelRequested = false;
    this.lastError = null;
    this.startedAt = now;
    this.completedAt = null;
    this.events.push({ type: 'phase', phase: this.phase });
    return { started: true, phase: 'pushing' };
  }

  cancel(): SyncSessionPhase {
    if (!ACTIVE_PHASES.has(this.phase)) {
      return this.phase;
    }
    this.cancelRequested = true;
    this.phase = 'cancelled';
    this.requestGeneration = null;
    this.completedAt = Date.now();
    this.events.push({ type: 'phase', phase: this.phase });
    return this.phase;
  }

  handlePushResponse(response: PushResponse, ackedAt: number): HandlePushResult {
    if (this.phase !== 'pushing') {
      return { handled: false, reason: 'wrong-phase' };
    }
    if (this.cancelRequested) {
      return { handled: false, reason: 'cancelled' };
    }
    if (!this.isFreshResponse(response.generation)) {
      this.events.push({
        type: 'stale-response',
        expectedGeneration: this.requestGeneration ?? this.context.generation,
        receivedGeneration: response.generation,
      });
      return { handled: false, reason: 'stale-response' };
    }

    let sawConflict = false;

    for (const result of response.results) {
      if (result.status === 'applied') {
        this.outbox.markApplied(result.operationId, ackedAt);
        continue;
      }
      if (result.status === 'rejected') {
        continue;
      }
      const registered = this.conflicts.register({
        conflictId: result.conflict.conflictId,
        resourceType: result.conflict.resourceType,
        resourceId: result.conflict.resourceId,
        snapshot: result.conflict.snapshot,
        supportsDuplicateLocal: result.conflict.supportsDuplicateLocal,
      });
      if (registered.registered) {
        sawConflict = true;
        this.events.push({ type: 'conflict-added', conflict: registered.conflict });
      }
    }

    if (sawConflict) {
      this.phase = 'conflict';
      this.requestGeneration = null;
      this.events.push({ type: 'phase', phase: this.phase });
      return { handled: true, phase: this.phase };
    }

    this.phase = 'pulling';
    this.events.push({ type: 'phase', phase: this.phase });
    return { handled: true, phase: this.phase };
  }

  handlePullResponse(response: PullResponse): HandlePullResult {
    if (this.phase !== 'pulling') {
      return { handled: false, reason: 'wrong-phase' };
    }
    if (this.cancelRequested) {
      return { handled: false, reason: 'cancelled' };
    }
    if (!this.isFreshResponse(response.generation)) {
      this.events.push({
        type: 'stale-response',
        expectedGeneration: this.requestGeneration ?? this.context.generation,
        receivedGeneration: response.generation,
      });
      return { handled: false, reason: 'stale-response' };
    }

    const advanced = this.cursor.advance(response.cursor);
    if (advanced.accepted) {
      this.events.push({ type: 'cursor-advanced', cursor: advanced.cursor });
    }

    if (response.hasMore) {
      return { handled: true, phase: this.phase };
    }

    this.phase = 'completed';
    this.requestGeneration = null;
    this.completedAt = Date.now();
    this.events.push({ type: 'phase', phase: this.phase });
    return { handled: true, phase: this.phase };
  }

  resolveConflict(
    conflictId: string,
    resolution: ConflictResolution,
    resolvedAt: number,
  ): ConflictRecord | null {
    const result = this.conflicts.resolve(conflictId, resolution, resolvedAt);
    if (!result.resolved) {
      return null;
    }
    this.events.push({
      type: 'conflict-resolved',
      conflictId,
      resolution,
    });

    if (this.phase === 'conflict' && this.conflicts.listUnresolved().length === 0) {
      this.phase = 'idle';
      this.events.push({ type: 'phase', phase: this.phase });
    }

    return result.conflict;
  }

  fail(message: string, failedAt: number): SyncSessionPhase {
    if (!ACTIVE_PHASES.has(this.phase)) {
      return this.phase;
    }
    this.phase = 'failed';
    this.lastError = message;
    this.requestGeneration = null;
    this.completedAt = failedAt;
    this.events.push({ type: 'error', message });
    this.events.push({ type: 'phase', phase: this.phase });
    return this.phase;
  }

  resetToIdle(): void {
    this.phase = 'idle';
    this.requestGeneration = null;
    this.cancelRequested = false;
    this.lastError = null;
    this.startedAt = null;
    this.completedAt = null;
    this.events.push({ type: 'phase', phase: this.phase });
  }

  toSnapshot(): SyncSessionSnapshot {
    return {
      phase: this.phase,
      context: this.getContext(),
      online: this.online,
      requestGeneration: this.requestGeneration,
      cursor: this.cursor.toSnapshot(),
      conflicts: this.conflicts.toSnapshot(),
      lastError: this.lastError,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
    };
  }

  static fromSnapshot(snapshot: SyncSessionSnapshot, outbox: Outbox): SyncSession {
    const session = new SyncSession({
      context: snapshot.context,
      outbox,
      conflicts: ConflictRegistry.fromSnapshot(snapshot.conflicts),
      cursor: SyncCursorTracker.fromSnapshot(snapshot.cursor),
      online: snapshot.online,
    });
    session.phase = snapshot.phase;
    session.requestGeneration = snapshot.requestGeneration;
    session.lastError = snapshot.lastError;
    session.startedAt = snapshot.startedAt;
    session.completedAt = snapshot.completedAt;
    return session;
  }

  private isFreshResponse(receivedGeneration: number): boolean {
    if (this.requestGeneration === null) {
      return false;
    }
    return receivedGeneration === this.requestGeneration;
  }
}
