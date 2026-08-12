import { AppError } from '@xiaohuang/domain-core';
import type { ConflictResolution } from '@xiaohuang/sync-core';
import {
  idbTransactionComplete,
  STORE_OUTBOX,
  STORE_RESOURCES,
} from '../shared/persistence/indexeddb/idb-primitives.js';
import { OutboxRepository } from '../shared/persistence/indexeddb/outbox-repository.js';
import { ResourceRepository } from '../shared/persistence/indexeddb/resource-repository.js';
import type { ResourceRecord } from '../shared/persistence/indexeddb/resource-repository.js';
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
      this.outbox.appendInTransaction(tx, {
        operationId: input.operationId,
        workspaceId: input.workspaceId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        payload: input.payload,
        baseRevision: input.baseRevision ?? null,
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
   * Persist a conflict resolution into IndexedDB + outbox.
   * keepLocal: new op based on latest cloud revision.
   * keepCloud: replace local resource with cloud snapshot and ack the old op.
   * duplicateLocal: only when the adapter supports it.
   */
  async applyConflictResolution(input: {
    conflict: StoredConflict;
    resolution: ConflictResolution;
    createOperationId: () => string;
    now?: number;
  }): Promise<void> {
    const { conflict, resolution } = input;
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

    if (resolution === 'keepCloud') {
      await this.replaceResource({
        workspaceId: conflict.workspaceId,
        resourceType: conflict.resourceType,
        resourceId: conflict.resourceId,
        schemaVersion,
        revision: cloud.revision ?? 0,
        payload: cloud.payload,
        localOnly: false,
        deletedAt: cloud.deletedAt ?? null,
        now: timestamp,
      });
      if (conflict.operationId) {
        await this.outbox.markApplied(conflict.operationId, timestamp);
      }
      return;
    }

    if (resolution === 'keepLocal') {
      if (conflict.operationId) {
        await this.outbox.updateStatuses([
          { operationId: conflict.operationId, status: 'applied', appliedAt: timestamp },
        ]);
      }
      await this.write(
        {
          workspaceId: conflict.workspaceId,
          resourceType: conflict.resourceType,
          resourceId: conflict.resourceId,
          schemaVersion,
          revision: (cloud.revision ?? 0) + 1,
          payload: local.payload,
          localOnly: false,
          operationId: input.createOperationId(),
          baseRevision: cloud.revision,
          deletedAt: local.deletedAt ?? null,
          now: timestamp,
        },
        this.generation,
      );
      return;
    }

    const duplicateId = `${conflict.resourceId}~dup-${timestamp.toString(36)}`;
    await this.replaceResource({
      workspaceId: conflict.workspaceId,
      resourceType: conflict.resourceType,
      resourceId: conflict.resourceId,
      schemaVersion,
      revision: cloud.revision ?? 0,
      payload: cloud.payload,
      localOnly: false,
      deletedAt: cloud.deletedAt ?? null,
      now: timestamp,
    });
    if (conflict.operationId) {
      await this.outbox.markApplied(conflict.operationId, timestamp);
    }
    await this.write(
      {
        workspaceId: conflict.workspaceId,
        resourceType: conflict.resourceType,
        resourceId: duplicateId,
        schemaVersion,
        revision: 0,
        payload: local.payload,
        localOnly: false,
        operationId: input.createOperationId(),
        baseRevision: null,
        deletedAt: local.deletedAt ?? null,
        now: timestamp,
      },
      this.generation,
    );
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
