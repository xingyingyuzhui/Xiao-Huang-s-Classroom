import type { ConflictRecord, ConflictResolution } from '@xiaohuang/sync-core';

export class ConflictStore {
  private conflicts = new Map<string, ConflictRecord>();

  add(conflict: ConflictRecord): void {
    this.conflicts.set(conflict.conflictId, conflict);
  }

  resolve(conflictId: string, resolution: ConflictResolution): ConflictRecord | null {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict || conflict.resolution != null) return null;
    const resolved: ConflictRecord = {
      ...conflict,
      resolution,
      resolvedAt: Date.now(),
    };
    this.conflicts.set(conflictId, resolved);
    return resolved;
  }

  listUnresolved(): ConflictRecord[] {
    return [...this.conflicts.values()].filter((c) => c.resolution == null);
  }

  get(conflictId: string): ConflictRecord | undefined {
    return this.conflicts.get(conflictId);
  }

  clear(): void {
    this.conflicts.clear();
  }
}
