import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function load<T = unknown>(rel: string): Promise<T> {
  return import(pathToFileURL(path.join(root, rel)).href) as Promise<T>;
}

test('workspace context store starts in guest mode with explicit scope', async () => {
  const { WorkspaceContextStore } = await load<{ WorkspaceContextStore: new (opts: object) => any }>(
    'apps/web/src/workspace/workspace-context-store.ts',
  );

  const store = new WorkspaceContextStore({ deviceId: 'dev_test_001', initialSubjectId: 'math' });
  const context = store.getContext();

  assert.equal(context.mode, 'guest');
  assert.equal(context.accountId, null);
  assert.equal(context.classId, null);
  assert.equal(context.subjectId, 'math');
  assert.equal(context.kind, 'guest');
  assert.equal(context.deviceId, 'dev_test_001');
  assert.equal(context.workspaceId, 'guest.default.math');
});

test('workspace keys distinguish guest, personal, and class namespaces', async () => {
  const keys = await load<{
    guestWorkspaceKey: (subjectId: string) => string;
    personalWorkspaceKey: (accountId: string, subjectId: string) => string;
    classWorkspaceKey: (accountId: string, classId: string, subjectId: string) => string;
    resolveWorkspaceKey: (input: object) => string;
  }>('apps/web/src/workspace/workspace-key.ts');

  assert.equal(keys.guestWorkspaceKey('math'), 'guest.default.math');
  assert.equal(keys.personalWorkspaceKey('acct_a', 'math'), 'personal.acct_a.math');
  assert.equal(
    keys.classWorkspaceKey('acct_a', 'cls_b', 'math'),
    'class.acct_a.cls_b.math',
  );
  assert.equal(
    keys.resolveWorkspaceKey({
      mode: 'authenticated',
      accountId: 'acct_a',
      classId: 'cls_b',
      subjectId: 'math',
      workspaceId: 'ws_cloud',
    }),
    'class.acct_a.cls_b.math',
  );
});

test('workspace switch increments generation and runs flush/abort/clear hooks', async () => {
  const { WorkspaceContextStore } = await load<{ WorkspaceContextStore: new (opts: object) => any }>(
    'apps/web/src/workspace/workspace-context-store.ts',
  );
  const { WorkspaceSwitchController } = await load<{
    WorkspaceSwitchController: new (store: object, hooks: object) => any;
  }>('apps/web/src/workspace/workspace-switch-controller.ts');

  const store = new WorkspaceContextStore({ deviceId: 'dev_test_002', initialSubjectId: 'chemistry' });
  const events: string[] = [];
  const controller = new WorkspaceSwitchController(store, {
    flushLocal: async () => {
      events.push('flush');
    },
    abortNetwork: () => {
      events.push('abort');
    },
    clearCache: () => {
      events.push('clear');
    },
    onSwitched: () => {
      events.push('switched');
    },
  });

  const previousGeneration = store.getGeneration();
  const next = {
    ...store.getContext(),
    mode: 'authenticated' as const,
    accountId: 'acct_teacher',
    kind: 'personal' as const,
    workspaceId: 'ws_personal_chem',
  };

  const switched = await controller.switch(next, previousGeneration);
  assert.equal(switched.generation, previousGeneration + 1);
  assert.equal(store.getContext().accountId, 'acct_teacher');
  assert.deepEqual(events, ['flush', 'abort', 'clear', 'switched']);
});

test('stale generation rejects switch and inflight callbacks', async () => {
  const { WorkspaceContextStore } = await load<{ WorkspaceContextStore: new (opts: object) => any }>(
    'apps/web/src/workspace/workspace-context-store.ts',
  );
  const { WorkspaceSwitchController } = await load<{
    WorkspaceSwitchController: new (store: object, hooks: object) => any;
  }>('apps/web/src/workspace/workspace-switch-controller.ts');

  const store = new WorkspaceContextStore({ deviceId: 'dev_test_003', initialSubjectId: 'math' });
  const controller = new WorkspaceSwitchController(store);

  await assert.rejects(
    () =>
      controller.switch(
        {
          ...store.getContext(),
          mode: 'authenticated',
          accountId: 'acct_a',
          kind: 'personal',
          workspaceId: 'ws_a',
        },
        99,
      ),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'FORBIDDEN_WORKSPACE');
      return true;
    },
  );

  store.bumpGeneration();
  assert.throws(() => controller.discardIfStale(0), /Workspace context is stale/);
});

test('switch notifies subscribers with the latest context', async () => {
  const { WorkspaceContextStore } = await load<{ WorkspaceContextStore: new (opts: object) => any }>(
    'apps/web/src/workspace/workspace-context-store.ts',
  );
  const { WorkspaceSwitchController } = await load<{
    WorkspaceSwitchController: new (store: object, hooks: object) => any;
  }>('apps/web/src/workspace/workspace-switch-controller.ts');

  const store = new WorkspaceContextStore({ deviceId: 'dev_test_004', initialSubjectId: 'physics' });
  const controller = new WorkspaceSwitchController(store);
  const seen: string[] = [];
  store.subscribe((ctx: { workspaceId: string; generation: number }) => {
    seen.push(`${ctx.workspaceId}:${ctx.generation}`);
  });

  const previousGeneration = store.getGeneration();
  await controller.switch(
    {
      ...store.getContext(),
      mode: 'authenticated',
      accountId: 'acct_p',
      classId: 'cls_p',
      kind: 'class',
      workspaceId: 'ws_class_physics',
    },
    previousGeneration,
  );

  assert.equal(seen.at(-1), 'ws_class_physics:1');
});
