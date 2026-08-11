import type { SyncSessionPhase } from '@xiaohuang/sync-core';

export type SyncStatus = {
  phase: SyncSessionPhase;
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  online: boolean;
};

export type SyncStatusListener = (status: SyncStatus) => void;

function defaultStatus(): SyncStatus {
  return {
    phase: 'idle',
    pendingCount: 0,
    conflictCount: 0,
    lastSyncedAt: null,
    lastError: null,
    online: false,
  };
}

export class SyncStatusStore {
  private status: SyncStatus;
  private listeners = new Set<SyncStatusListener>();

  constructor() {
    this.status = defaultStatus();
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  update(partial: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...partial };
    for (const listener of this.listeners) {
      listener(this.status);
    }
  }

  subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
