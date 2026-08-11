import { AppError } from '@xiaohuang/domain-core';
import {
  idbTransactionComplete,
  STORE_OUTBOX,
  STORE_RESOURCES,
} from '../shared/persistence/indexeddb/database.js';
import { OutboxRepository } from '../shared/persistence/indexeddb/outbox-repository.js';
import { ResourceRepository } from '../shared/persistence/indexeddb/resource-repository.js';
import type { ResourceRecord } from '../shared/persistence/indexeddb/resource-repository.js';

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
      });
    }

    await idbTransactionComplete(tx);
    return record;
  }
}
