import { AppError } from '@xiaohuang/domain-core';
import type { ConflictResolution } from '@xiaohuang/sync-core';
import {
  idbTransactionComplete,
  STORE_META,
  STORE_OUTBOX,
  STORE_RESOURCES,
} from '../shared/persistence/indexeddb/idb-primitives.js';
import {
  appendOutboxInTransaction,
  OutboxRepository,
  patchOutboxInTransaction,
  type OutboxEntry,
} from '../shared/persistence/indexeddb/outbox-repository.js';
import { ResourceRepository } from '../shared/persistence/indexeddb/resource-repository.js';
import type { ResourceRecord } from '../shared/persistence/indexeddb/resource-repository.js';
import {
  readConflictMeta,
  resolveConflictRecords,
  writeConflictMetaInTransaction,
} from './conflict-store.js';
import type { ConflictSideSnapshot, StoredConflict } from './conflict-store.js';

export type LocalResourceWriteInput = {
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  schemaVersion: number;
  revision: number;
  payload: unknown;
  localOnly: boolean;
  operationId?: string;
  baseRevision?: number | null;
  basePayload?: unknown | null;
  deletedAt?: number | null;
  now?: number;
};

export type LocalResourceServiceOptions = {
  db: IDBDatabase;
  generation?: number;
  now?: () => number;
};

/**
 * Coordinates scoped resource writes with durable outbox entries.
 * Business resource + outbox append share one IndexedDB transaction.
 */
export class LocalResourceService {
  private generation: number;
  private readonly db: IDBDatabase;
  private readonly now: () => number;
  readonly resources: ResourceRepository;
  readonly outbox: OutboxRepository;

  constructor(options: LocalResourceServiceOptions) {
    this.generation = options.generation ?? 0;
    this.db = options.db;
    this.now = options.now ?? (() => Date.now());
    this.resources = new ResourceRepository(options.db);
    this.outbox = new OutboxRepository(options.db);
  }

  getGeneration(): number {
    return this.generation;
  }

  setGeneration(generation: number): void {
    this.generation = generation;
  }

  assertGeneration(expectedGeneration: number): void {
    if (this.generation !== expectedGeneration) {
      throw new AppError(
        'PERSISTENCE_WRITE',
        `Stale workspace generation: expected ${expectedGeneration}, current ${this.generation}`,
        'local-resource-service',
      );
    }
  }

  async write(input: LocalResourceWriteInput, expectedGeneration?: number): Promise<ResourceRecord> {
    if (expectedGeneration !== undefined) {
      this.assertGeneration(expectedGeneration);
    }

    const timestamp = input.now ?? this.now();

    if (!input.localOnly && !input.operationId) {
      throw new AppError(
        'VALIDATION_SCHEMA',
        'Syncable writes require operationId',
        'local-resource-service',
      );
    }

    const tx = this.db.transaction([STORE_RESOURCES, STORE_OUTBOX], 'readwrite');

    const record = this.resources.putInTransaction(tx, {
      workspaceId: input.workspaceId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      schemaVersion: input.schemaVersion,
      revision: input.revision,
      payload: input.payload,
      localOnly: input.localOnly,
      updatedAt: timestamp,
      deletedAt: input.deletedAt ?? null,
    });

    if (!input.localOnly && input.operationId) {
      appendOutboxInTransaction(tx, {
        operationId: input.operationId,
        workspaceId: input.workspaceId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        payload: input.payload,
        baseRevision: input.baseRevision ?? null,
        basePayload: input.basePayload ?? null,
        createdAt: timestamp,
        deletedAt: input.deletedAt ?? null,
        schemaVersion: input.schemaVersion,
      });
    }

    await idbTransactionComplete(tx);
    return record;
  }

  /** Replace a local resource without appending an outbox operation (keepCloud / pull). */
  async replaceResource(input: Omit<LocalResourceWriteInput, 'operationId' | 'baseRevision'>): Promise<ResourceRecord> {
    const timestamp = input.now ?? this.now();
    const tx = this.db.transaction([STORE_RESOURCES], 'readwrite');
    const record = this.resources.putInTransaction(tx, {
      workspaceId: input.workspaceId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      schemaVersion: input.schemaVersion,
      revision: input.revision,
      payload: input.payload,
      localOnly: input.localOnly,
      updatedAt: timestamp,
      deletedAt: input.deletedAt ?? null,
    });
    await idbTransactionComplete(tx);
    return record;
  }

  /**
   * Resolve a sync conflict atomically across resources, outbox, and conflict meta.
   */
  async resolveConflictAtomically(input: {
    conflict: StoredConflict;
    resolution: ConflictResolution;
    nextOperationId: string;
    now?: number;
  }): Promise<void> {
    const { conflict, resolution, nextOperationId } = input;
    const timestamp = input.now ?? this.now();
    const local = asSide(conflict.snapshot.local);
    const cloud = asSide(conflict.snapshot.cloud);
    const schemaVersion = local.schemaVersion ?? cloud.schemaVersion ?? 1;

    if (resolution === 'duplicateLocal' && !conflict.supportsDuplicateLocal) {
      throw new AppError(
        'VALIDATION_SCHEMA',
        'This resource type does not support keeping both copies',
        'local-resource-service',
      );
    }

    if (conflict.resolution != null) {
      return;
    }

    let oldOutbox: OutboxEntry | null = null;
    if (conflict.operationId) {
      oldOutbox = await this.outbox.get(conflict.operationId);
      if (!oldOutbox) {
        throw new AppError(
          'PERSISTENCE_WRITE',
          `Outbox operation not found: ${conflict.operationId}`,
          'outbox',
        );
      }
    }

    const existingConflicts = await readConflictMeta(this.db);
    const alreadyResolved = existingConflicts.find(
      (entry) => entry.conflictId === conflict.conflictId && entry.resolution != null,
    );
    if (alreadyResolved) {
      return;
    }

    const tx = this.db.transaction([STORE_RESOURCES, STORE_OUTBOX, STORE_META], 'readwrite');

    if (resolution === 'keepCloud') {
      this.resources.putInTransaction(tx, {
        workspaceId: conflict.workspaceId,
        resourceType: conflict.resourceType,
        resourceId: conflict.resourceId,
        schemaVersion,
        revision: cloud.revision ?? 0,
        payload: cloud.payload,
        localOnly: false,
        updatedAt: timestamp,
        deletedAt: cloud.deletedAt ?? null,
      });
      if (oldOutbox) {
        patchOutboxInTransaction(
          tx,
          conflict.operationId,
          { operationId: conflict.operationId, status: 'applied', appliedAt: timestamp },
          oldOutbox,
        );
      }
    } else if (resolution === 'keepLocal') {
      this.resources.putInTransaction(tx, {
        workspaceId: conflict.workspaceId,
        resourceType: conflict.resourceType,
        resourceId: conflict.resourceId,
        schemaVersion,
        revision: (cloud.revision ?? 0) + 1,
        payload: local.payload,
        localOnly: false,
        updatedAt: timestamp,
        deletedAt: local.deletedAt ?? null,
      });
      if (oldOutbox) {
        patchOutboxInTransaction(
          tx,
          conflict.operationId,
          { operationId: conflict.operationId, status: 'applied', appliedAt: timestamp },
          oldOutbox,
        );
      }
      appendOutboxInTransaction(tx, {
        operationId: nextOperationId,
        workspaceId: conflict.workspaceId,
        resourceType: conflict.resourceType,
        resourceId: conflict.resourceId,
        payload: local.payload,
        baseRevision: cloud.revision ?? null,
        basePayload: cloud.payload ?? null,
        createdAt: timestamp,
        deletedAt: local.deletedAt ?? null,
        schemaVersion,
      });
    } else {
      this.resources.putInTransaction(tx, {
        workspaceId: conflict.workspaceId,
        resourceType: conflict.resourceType,
        resourceId: conflict.resourceId,
        schemaVersion,
        revision: cloud.revision ?? 0,
        payload: cloud.payload,
        localOnly: false,
        updatedAt: timestamp,
        deletedAt: cloud.deletedAt ?? null,
      });
      if (oldOutbox) {
        patchOutboxInTransaction(
          tx,
          conflict.operationId,
          { operationId: conflict.operationId, status: 'applied', appliedAt: timestamp },
          oldOutbox,
        );
      }
      const duplicateId = `${conflict.resourceId}~dup-${timestamp.toString(36)}`;
      this.resources.putInTransaction(tx, {
        workspaceId: conflict.workspaceId,
        resourceType: conflict.resourceType,
        resourceId: duplicateId,
        schemaVersion,
        revision: 0,
        payload: local.payload,
        localOnly: false,
        updatedAt: timestamp,
        deletedAt: local.deletedAt ?? null,
      });
      appendOutboxInTransaction(tx, {
        operationId: nextOperationId,
        workspaceId: conflict.workspaceId,
        resourceType: conflict.resourceType,
        resourceId: duplicateId,
        payload: local.payload,
        baseRevision: null,
        basePayload: null,
        createdAt: timestamp,
        deletedAt: local.deletedAt ?? null,
        schemaVersion,
      });
    }

    writeConflictMetaInTransaction(
      tx,
      resolveConflictRecords(existingConflicts, conflict.conflictId, resolution, timestamp),
    );

    await idbTransactionComplete(tx);
  }

  /** @deprecated Use resolveConflictAtomically */
  async applyConflictResolution(input: {
    conflict: StoredConflict;
    resolution: ConflictResolution;
    createOperationId: () => string;
    now?: number;
  }): Promise<void> {
    await this.resolveConflictAtomically({
      conflict: input.conflict,
      resolution: input.resolution,
      nextOperationId: input.createOperationId(),
      now: input.now,
    });
  }
}

function asSide(value: unknown): ConflictSideSnapshot {
  if (value && typeof value === 'object' && 'payload' in (value as object)) {
    const side = value as ConflictSideSnapshot;
    return {
      payload: side.payload,
      revision: side.revision ?? null,
      schemaVersion: side.schemaVersion ?? null,
      deletedAt: side.deletedAt ?? null,
      ...(side.summary != null ? { summary: side.summary } : {}),
    };
  }
  return {
    payload: value,
    revision: null,
    schemaVersion: null,
  };
}
