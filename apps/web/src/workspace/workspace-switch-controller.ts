import type { WorkspaceContext } from '@xiaohuang/contracts';
import { AppError } from '@xiaohuang/domain-core';
import type { WorkspaceContextStore } from './workspace-context-store.js';

export type WorkspaceSwitchHooks = {
  flushLocal?: () => Promise<void>;
  abortNetwork?: () => void;
  clearCache?: () => void;
  onSwitched?: (context: WorkspaceContext) => void;
};

export class WorkspaceSwitchController {
  private readonly inflight = new Set<AbortController>();

  constructor(
    private readonly store: WorkspaceContextStore,
    private readonly hooks: WorkspaceSwitchHooks = {},
  ) {}

  trackAbortController(controller: AbortController): void {
    this.inflight.add(controller);
  }

  abortInflightRequests(): void {
    for (const controller of this.inflight) {
      controller.abort();
    }
    this.inflight.clear();
    this.hooks.abortNetwork?.();
  }

  discardIfStale(generation: number): void {
    if (this.store.getGeneration() !== generation) {
      throw new AppError('FORBIDDEN_WORKSPACE', 'Workspace context is stale');
    }
  }

  async switch(next: WorkspaceContext, previousGeneration: number): Promise<WorkspaceContext> {
    this.store.assertGeneration(previousGeneration);

    if (this.hooks.flushLocal) {
      await this.hooks.flushLocal();
    }

    this.abortInflightRequests();
    const generation = this.store.bumpGeneration();

    this.hooks.clearCache?.();

    const context: WorkspaceContext = {
      ...next,
      generation,
    };

    this.store.setContext(context);
    this.hooks.onSwitched?.(context);
    return context;
  }
}
