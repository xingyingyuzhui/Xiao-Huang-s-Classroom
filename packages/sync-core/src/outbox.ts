import type { OutboxOperation, TombstoneRecord } from './types.js';

export type OutboxAppendResult =
  | { accepted: true }
  | { accepted: false; reason: 'duplicate-operation' };

export type OutboxSnapshot = {
  pending: OutboxOperation[];
  appliedOperationIds: string[];
  tombstones: TombstoneRecord[];
};

function tombstoneKey(resourceType: string, resourceId: string): string {
  return `${resourceType}\0${resourceId}`;
}

/** Durable outbox with operation idempotency and tombstone retention. */
export class Outbox {
  private readonly pending = new Map<string, OutboxOperation>();
  private readonly appliedOperationIds = new Set<string>();
  private readonly tombstones = new Map<string, TombstoneRecord>();

  append(operation: OutboxOperation): OutboxAppendResult {
    if (this.appliedOperationIds.has(operation.operationId)) {
      return { accepted: false, reason: 'duplicate-operation' };
    }
    if (this.pending.has(operation.operationId)) {
      return { accepted: false, reason: 'duplicate-operation' };
    }

    this.pending.set(operation.operationId, operation);

    if (operation.deletedAt !== null) {
      const key = tombstoneKey(operation.resourceType, operation.resourceId);
      this.tombstones.set(key, {
        resourceType: operation.resourceType,
        resourceId: operation.resourceId,
        operationId: operation.operationId,
        deletedAt: operation.deletedAt,
        serverAckedAt: null,
      });
    }

    return { accepted: true };
  }

  listPending(): OutboxOperation[] {
    return [...this.pending.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  markApplied(operationId: string, ackedAt: number): void {
    const operation = this.pending.get(operationId);
    if (!operation) {
      if (this.appliedOperationIds.has(operationId)) {
        return;
      }
      throw new Error(`Outbox operation not pending: ${operationId}`);
    }

    this.pending.delete(operationId);
    this.appliedOperationIds.add(operationId);

    if (operation.deletedAt !== null) {
      const key = tombstoneKey(operation.resourceType, operation.resourceId);
      const tombstone = this.tombstones.get(key);
      if (tombstone && tombstone.operationId === operationId) {
        tombstone.serverAckedAt = ackedAt;
      }
    }
  }

  hasApplied(operationId: string): boolean {
    return this.appliedOperationIds.has(operationId);
  }

  getTombstone(resourceType: string, resourceId: string): TombstoneRecord | null {
    return this.tombstones.get(tombstoneKey(resourceType, resourceId)) ?? null;
  }

  /** Tombstones require server ack plus retention before physical deletion. */
  canPhysicallyDeleteTombstone(
    resourceType: string,
    resourceId: string,
    retentionMs: number,
    now: number,
  ): boolean {
    const tombstone = this.getTombstone(resourceType, resourceId);
    if (!tombstone) {
      return false;
    }
    if (tombstone.serverAckedAt === null) {
      return false;
    }
    return now >= tombstone.serverAckedAt + retentionMs;
  }

  purgeTombstone(resourceType: string, resourceId: string, retentionMs: number, now: number): boolean {
    if (!this.canPhysicallyDeleteTombstone(resourceType, resourceId, retentionMs, now)) {
      return false;
    }
    this.tombstones.delete(tombstoneKey(resourceType, resourceId));
    return true;
  }

  toSnapshot(): OutboxSnapshot {
    return {
      pending: this.listPending(),
      appliedOperationIds: [...this.appliedOperationIds],
      tombstones: [...this.tombstones.values()],
    };
  }

  static fromSnapshot(snapshot: OutboxSnapshot): Outbox {
    const outbox = new Outbox();
    for (const operationId of snapshot.appliedOperationIds) {
      outbox.appliedOperationIds.add(operationId);
    }
    for (const operation of snapshot.pending) {
      outbox.pending.set(operation.operationId, operation);
    }
    for (const tombstone of snapshot.tombstones) {
      outbox.tombstones.set(tombstoneKey(tombstone.resourceType, tombstone.resourceId), { ...tombstone });
    }
    return outbox;
  }
}
