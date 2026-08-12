import { describe, expect, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function load<T = unknown>(rel: string): Promise<T> {
  return import(pathToFileURL(path.join(root, rel)).href) as Promise<T>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('subject context controller', () => {
  it('guest chemistry→math changes workspace key', async () => {
    const { WorkspaceContextStore } = await load<{
      WorkspaceContextStore: new (opts: object) => {
        getContext: () => { workspaceId: string; subjectId: string };
        getGeneration: () => number;
      };
    }>('apps/web/src/workspace/workspace-context-store.ts');
    const { WorkspaceSwitchController } = await load<{
      WorkspaceSwitchController: new (store: object, hooks?: object) => {
        switch: (next: object, gen: number) => Promise<object>;
        trackAbortController: (c: AbortController) => void;
        abortInflightRequests: () => void;
      };
    }>('apps/web/src/workspace/workspace-switch-controller.ts');
    const { createSubjectContextController } = await load<{
      createSubjectContextController: (deps: object) => {
        activateSubject: (id: string) => Promise<{ ok: boolean }>;
        getActiveSubjectId: () => string | null;
      };
    }>('apps/web/src/account/subject-context-controller.js');

    const store = new WorkspaceContextStore({ deviceId: 'dev_1', initialSubjectId: 'chemistry' });
    const switcher = new WorkspaceSwitchController(store);
    const statusStore = { update: vi.fn() };

    const controller = createSubjectContextController({
      contextStore: store,
      switcher,
      switchWorkspace: (next: { generation: number }) => switcher.switch(next, next.generation),
      session: { getSession: () => null, isAuthenticated: () => false },
      client: {
        ensurePersonalWorkspace: vi.fn(),
        ensureClassWorkspace: vi.fn(),
        abortInflight: vi.fn(),
      },
      syncController: { cancel: vi.fn() },
      statusStore,
      deviceId: 'dev_1',
      hydrateWave1FromLocal: async () => {},
      refreshPendingCount: async () => {},
      refreshSettingsSection: () => {},
    });

    const chem = await controller.activateSubject('chemistry');
    expect(chem.ok).toBe(true);
    expect(store.getContext().workspaceId).toBe('guest.default.chemistry');

    const math = await controller.activateSubject('math');
    expect(math.ok).toBe(true);
    expect(store.getContext().workspaceId).toBe('guest.default.math');
    expect(controller.getActiveSubjectId()).toBe('math');
  });

  it('discards slower class switch when a faster one completes first', async () => {
    const { WorkspaceContextStore } = await load<{
      WorkspaceContextStore: new (opts: object) => {
        getContext: () => {
          workspaceId: string;
          classId: string | null;
          kind: string;
        };
        getGeneration: () => number;
      };
    }>('apps/web/src/workspace/workspace-context-store.ts');
    const { WorkspaceSwitchController } = await load<{
      WorkspaceSwitchController: new (store: object, hooks?: object) => {
        switch: (next: object, gen: number) => Promise<object>;
        trackAbortController: (c: AbortController) => void;
        abortInflightRequests: () => void;
      };
    }>('apps/web/src/workspace/workspace-switch-controller.ts');
    const { createSubjectContextController } = await load<{
      createSubjectContextController: (deps: object) => {
        activateSubject: (id: string) => Promise<{ ok: boolean }>;
        switchClass: (classId: string | null) => Promise<void>;
      };
    }>('apps/web/src/account/subject-context-controller.js');

    const store = new WorkspaceContextStore({ deviceId: 'dev_1', initialSubjectId: 'math' });
    const switcher = new WorkspaceSwitchController(store);

    const ensureClassWorkspace = vi.fn(async (classId: string) => {
      if (classId === 'cls_slow') {
        await delay(40);
        return { id: 'ws_slow', subjectId: 'math', classId: 'cls_slow' };
      }
      return { id: 'ws_fast', subjectId: 'math', classId: 'cls_fast' };
    });

    const ensurePersonalWorkspace = vi.fn(async () => ({
      id: 'ws_personal',
      subjectId: 'math',
    }));

    const controller = createSubjectContextController({
      contextStore: store,
      switcher,
      switchWorkspace: (next: { generation: number; workspaceId: string; classId: string | null }) =>
        switcher.switch(next, next.generation),
      session: {
        getSession: () => ({ accountId: 'acct_1' }),
        isAuthenticated: () => true,
      },
      client: {
        ensurePersonalWorkspace,
        ensureClassWorkspace,
        abortInflight: vi.fn(),
      },
      syncController: { cancel: vi.fn() },
      statusStore: { update: vi.fn() },
      deviceId: 'dev_1',
      hydrateWave1FromLocal: async () => {},
      refreshPendingCount: async () => {},
      refreshSettingsSection: () => {},
    });

    await controller.activateSubject('math');
    const slow = controller.switchClass('cls_slow');
    const fast = controller.switchClass('cls_fast');
    await fast;
    await slow;

    const ctx = store.getContext();
    expect(ctx.workspaceId).toBe('ws_fast');
    expect(ctx.classId).toBe('cls_fast');
  });

  it('rejects roster/settings writes after deactivateSubject', async () => {
    const { createSubjectContextController } = await load<{
      createSubjectContextController: (deps: object) => {
        activateSubject: (id: string) => Promise<{ ok: boolean }>;
        deactivateSubject: () => Promise<void>;
        assertWritable: () => void;
      };
    }>('apps/web/src/account/subject-context-controller.js');
    const { WorkspaceContextStore } = await load<{
      WorkspaceContextStore: new (opts: object) => object;
    }>('apps/web/src/workspace/workspace-context-store.ts');
    const { WorkspaceSwitchController } = await load<{
      WorkspaceSwitchController: new (store: object) => object;
    }>('apps/web/src/workspace/workspace-switch-controller.ts');

    const store = new WorkspaceContextStore({ deviceId: 'dev_1', initialSubjectId: 'chemistry' });
    const switcher = new WorkspaceSwitchController(store);

    const controller = createSubjectContextController({
      contextStore: store,
      switcher,
      switchWorkspace: async (next: object) => next,
      session: { getSession: () => null, isAuthenticated: () => false },
      client: {
        ensurePersonalWorkspace: vi.fn(),
        ensureClassWorkspace: vi.fn(),
        abortInflight: vi.fn(),
      },
      syncController: null,
      statusStore: { update: vi.fn() },
      deviceId: 'dev_1',
      hydrateWave1FromLocal: async () => {},
      refreshPendingCount: async () => {},
      refreshSettingsSection: () => {},
    });

    await controller.activateSubject('chemistry');
    await controller.deactivateSubject();

    assert.throws(() => controller.assertWritable(), /学科大厅中不可写入课堂资源/);
  });
});
