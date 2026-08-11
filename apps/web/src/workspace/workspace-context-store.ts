import { workspaceContextSchema, type WorkspaceContext } from '@xiaohuang/contracts';
import { AppError } from '@xiaohuang/domain-core';
import { guestWorkspaceKey } from './workspace-key.js';

export type WorkspaceContextListener = (context: WorkspaceContext) => void;

export type WorkspaceContextStoreOptions = {
  deviceId: string;
  initialSubjectId?: string;
};

export function createGuestContext(
  deviceId: string,
  subjectId: string,
  generation = 0,
): WorkspaceContext {
  return workspaceContextSchema.parse({
    mode: 'guest',
    accountId: null,
    classId: null,
    subjectId,
    workspaceId: guestWorkspaceKey(subjectId),
    kind: 'guest',
    deviceId,
    generation,
  });
}

/**
 * In-memory owner for the active account/class/subject workspace context.
 */
export class WorkspaceContextStore {
  private context: WorkspaceContext;
  private readonly listeners = new Set<WorkspaceContextListener>();

  constructor(options: WorkspaceContextStoreOptions) {
    this.context = createGuestContext(
      options.deviceId,
      options.initialSubjectId ?? 'chemistry',
    );
  }

  getContext(): WorkspaceContext {
    return this.context;
  }

  getGeneration(): number {
    return this.context.generation;
  }

  subscribe(listener: WorkspaceContextListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setContext(next: WorkspaceContext): void {
    this.context = workspaceContextSchema.parse(next);
    for (const listener of this.listeners) {
      listener(this.context);
    }
  }

  bumpGeneration(): number {
    const nextGeneration = this.context.generation + 1;
    this.context = workspaceContextSchema.parse({
      ...this.context,
      generation: nextGeneration,
    });
    return nextGeneration;
  }

  assertGeneration(expectedGeneration: number): void {
    if (this.context.generation !== expectedGeneration) {
      throw new AppError(
        'FORBIDDEN_WORKSPACE',
        `Stale workspace generation: expected ${expectedGeneration}, current ${this.context.generation}`,
      );
    }
  }
}
