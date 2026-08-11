import type { ConflictRecord, ConflictResolution, ConflictSnapshot } from './types.js';

export type RegisterConflictInput = {
  conflictId: string;
  resourceType: string;
  resourceId: string;
  snapshot: ConflictSnapshot;
  supportsDuplicateLocal: boolean;
};

export type RegisterConflictResult =
  | { registered: true; conflict: ConflictRecord }
  | { registered: false; reason: 'already-unresolved'; existing: ConflictRecord };

export type ResolveConflictResult =
  | { resolved: true; conflict: ConflictRecord }
  | { resolved: false; reason: 'not-found' | 'already-resolved' | 'unsupported-resolution' };

function conflictKey(resourceType: string, resourceId: string): string {
  return `${resourceType}\0${resourceId}`;
}

/** Keeps triple snapshots until explicitly resolved. */
export class ConflictRegistry {
  private readonly byId = new Map<string, ConflictRecord>();
  private readonly byResource = new Map<string, string>();

  list(): ConflictRecord[] {
    return [...this.byId.values()];
  }

  listUnresolved(): ConflictRecord[] {
    return this.list().filter((record) => record.resolvedAt === null);
  }

  get(conflictId: string): ConflictRecord | null {
    return this.byId.get(conflictId) ?? null;
  }

  getUnresolvedByResource(resourceType: string, resourceId: string): ConflictRecord | null {
    const conflictId = this.byResource.get(conflictKey(resourceType, resourceId));
    if (!conflictId) {
      return null;
    }
    const record = this.byId.get(conflictId);
    if (!record || record.resolvedAt !== null) {
      return null;
    }
    return record;
  }

  register(input: RegisterConflictInput): RegisterConflictResult {
    const existing = this.getUnresolvedByResource(input.resourceType, input.resourceId);
    if (existing) {
      return { registered: false, reason: 'already-unresolved', existing };
    }

    const conflict: ConflictRecord = {
      conflictId: input.conflictId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      snapshot: {
        local: input.snapshot.local,
        cloud: input.snapshot.cloud,
        base: input.snapshot.base,
      },
      supportsDuplicateLocal: input.supportsDuplicateLocal,
      resolvedAt: null,
      resolution: null,
    };

    this.byId.set(conflict.conflictId, conflict);
    this.byResource.set(conflictKey(conflict.resourceType, conflict.resourceId), conflict.conflictId);
    return { registered: true, conflict };
  }

  resolve(conflictId: string, resolution: ConflictResolution, resolvedAt: number): ResolveConflictResult {
    const conflict = this.byId.get(conflictId);
    if (!conflict) {
      return { resolved: false, reason: 'not-found' };
    }
    if (conflict.resolvedAt !== null) {
      return { resolved: false, reason: 'already-resolved' };
    }
    if (resolution === 'duplicateLocal' && !conflict.supportsDuplicateLocal) {
      return { resolved: false, reason: 'unsupported-resolution' };
    }

    const updated: ConflictRecord = {
      ...conflict,
      resolvedAt,
      resolution,
    };
    this.byId.set(conflictId, updated);
    this.byResource.delete(conflictKey(conflict.resourceType, conflict.resourceId));
    return { resolved: true, conflict: updated };
  }

  toSnapshot(): ConflictRecord[] {
    return this.list().map((record) => ({
      ...record,
      snapshot: {
        local: record.snapshot.local,
        cloud: record.snapshot.cloud,
        base: record.snapshot.base,
      },
    }));
  }

  static fromSnapshot(records: ConflictRecord[]): ConflictRegistry {
    const registry = new ConflictRegistry();
    for (const record of records) {
      registry.byId.set(record.conflictId, {
        ...record,
        snapshot: {
          local: record.snapshot.local,
          cloud: record.snapshot.cloud,
          base: record.snapshot.base,
        },
      });
      if (record.resolvedAt === null) {
        registry.byResource.set(conflictKey(record.resourceType, record.resourceId), record.conflictId);
      }
    }
    return registry;
  }
}
