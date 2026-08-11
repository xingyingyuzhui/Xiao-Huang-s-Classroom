import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installFakeIndexedDb } from '@xiaohuang/test-kit';
import root from '../helpers/repo-root.js';

async function load<T = unknown>(rel: string): Promise<T> {
  return import(pathToFileURL(path.join(root, rel)).href) as Promise<T>;
}

function sampleGraphDocument() {
  return {
    schemaVersion: 2 as const,
    functions: [
      {
        id: 'f1',
        name: 'quadratic',
        kind: 'preset' as const,
        preset: 'quadratic',
      },
    ],
    points: [],
    constructions: [],
  };
}

test('workspace scope isolation: resources and outbox stay within workspaceId', async () => {
  const fake = installFakeIndexedDb();
  try {
    const { openLocalDatabase } = await load<{ openLocalDatabase: Function }>(
      'apps/web/src/shared/persistence/indexeddb/database.ts',
    );
    const { guestWorkspaceId } = await load<{ guestWorkspaceId: (subjectId: string) => string }>(
      'apps/web/src/shared/persistence/indexeddb/workspace-keys.ts',
    );
    const { LocalResourceService } = await load<{ LocalResourceService: new (opts: object) => any }>(
      'apps/web/src/sync/local-resource-service.ts',
    );

    const db = await openLocalDatabase({ factory: fake.factory });
    const mathWorkspace = guestWorkspaceId('math');
    const chemWorkspace = guestWorkspaceId('chemistry');
    const service = new LocalResourceService({ db, generation: 0, now: () => 1_700_000_000_000 });

    await service.write({
      workspaceId: mathWorkspace,
      resourceType: 'math.graph-document',
      resourceId: 'default',
      schemaVersion: 2,
      revision: 1,
      payload: { ...sampleGraphDocument(), marker: 'math' },
      localOnly: true,
    });

    await service.write({
      workspaceId: chemWorkspace,
      resourceType: 'chem.lab-progress',
      resourceId: 'default',
      schemaVersion: 1,
      revision: 1,
      payload: { completed: ['lab-a'] },
      localOnly: true,
    });

    const mathResources = await service.resources.listByWorkspace(mathWorkspace);
    const chemResources = await service.resources.listByWorkspace(chemWorkspace);

    assert.equal(mathResources.length, 1);
    assert.equal(chemResources.length, 1);
    assert.equal(mathResources[0]?.workspaceId, mathWorkspace);
    assert.equal(chemResources[0]?.workspaceId, chemWorkspace);
    assert.notEqual(mathResources[0]?.scopedKey, chemResources[0]?.scopedKey);

    await service.write({
      workspaceId: mathWorkspace,
      resourceType: 'math.graph-document',
      resourceId: 'default',
      schemaVersion: 2,
      revision: 2,
      payload: { ...sampleGraphDocument(), marker: 'math-synced' },
      localOnly: false,
      operationId: 'op-math-1',
      baseRevision: 1,
    });

    const pending = await service.outbox.listPending(mathWorkspace);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.workspaceId, mathWorkspace);

    const chemPending = await service.outbox.listPending(chemWorkspace);
    assert.equal(chemPending.length, 0);

    db.close();
  } finally {
    fake.restore();
  }
});

test('generation discard: stale expectedGeneration rejects writes', async () => {
  const fake = installFakeIndexedDb();
  try {
    const { openLocalDatabase } = await load<{ openLocalDatabase: Function }>(
      'apps/web/src/shared/persistence/indexeddb/database.ts',
    );
    const { guestWorkspaceId } = await load<{ guestWorkspaceId: (subjectId: string) => string }>(
      'apps/web/src/shared/persistence/indexeddb/workspace-keys.ts',
    );
    const { LocalResourceService } = await load<{ LocalResourceService: new (opts: object) => any }>(
      'apps/web/src/sync/local-resource-service.ts',
    );
    const { errorCodeOf } = await load<{ errorCodeOf: (e: unknown) => string }>(
      'packages/domain-core/src/index.ts',
    );

    const db = await openLocalDatabase({ factory: fake.factory });
    const service = new LocalResourceService({ db, generation: 2 });

    await assert.rejects(
      () =>
        service.write(
          {
            workspaceId: guestWorkspaceId('math'),
            resourceType: 'math.graph-document',
            resourceId: 'default',
            schemaVersion: 2,
            revision: 1,
            payload: sampleGraphDocument(),
            localOnly: true,
          },
          1,
        ),
      (error: unknown) => {
        const code = (error as { code?: string }).code;
        assert.equal(code, 'PERSISTENCE_WRITE');
        assert.match(String((error as Error).message), /Stale workspace generation/);
        return true;
      },
    );

    const record = await service.resources.get(guestWorkspaceId('math'), 'math.graph-document', 'default');
    assert.equal(record, null);
    db.close();
  } finally {
    fake.restore();
  }
});

test('localOnly writes do not append outbox rows', async () => {
  const fake = installFakeIndexedDb();
  try {
    const { openLocalDatabase } = await load<{ openLocalDatabase: Function }>(
      'apps/web/src/shared/persistence/indexeddb/database.ts',
    );
    const { guestWorkspaceId } = await load<{ guestWorkspaceId: (subjectId: string) => string }>(
      'apps/web/src/shared/persistence/indexeddb/workspace-keys.ts',
    );
    const { LocalResourceService } = await load<{ LocalResourceService: new (opts: object) => any }>(
      'apps/web/src/sync/local-resource-service.ts',
    );

    const db = await openLocalDatabase({ factory: fake.factory });
    const service = new LocalResourceService({ db, generation: 0 });
    const workspaceId = guestWorkspaceId('math');

    await service.write({
      workspaceId,
      resourceType: 'math.graph-document',
      resourceId: 'default',
      schemaVersion: 2,
      revision: 0,
      payload: sampleGraphDocument(),
      localOnly: true,
    });

    const pending = await service.outbox.listPending(workspaceId);
    assert.equal(pending.length, 0);
    db.close();
  } finally {
    fake.restore();
  }
});

test('pending outbox survives database reopen', async () => {
  const fake = installFakeIndexedDb();
  try {
    const { openLocalDatabase } = await load<{ openLocalDatabase: Function }>(
      'apps/web/src/shared/persistence/indexeddb/database.ts',
    );
    const { guestWorkspaceId } = await load<{ guestWorkspaceId: (subjectId: string) => string }>(
      'apps/web/src/shared/persistence/indexeddb/workspace-keys.ts',
    );
    const { LocalResourceService } = await load<{ LocalResourceService: new (opts: object) => any }>(
      'apps/web/src/sync/local-resource-service.ts',
    );
    const { OutboxRepository } = await load<{ OutboxRepository: new (db: IDBDatabase) => any }>(
      'apps/web/src/shared/persistence/indexeddb/outbox-repository.ts',
    );

    const db = await openLocalDatabase({ factory: fake.factory });
    const workspaceId = guestWorkspaceId('math');
    const service = new LocalResourceService({ db, generation: 0 });

    await service.write({
      workspaceId,
      resourceType: 'math.graph-document',
      resourceId: 'default',
      schemaVersion: 2,
      revision: 1,
      payload: sampleGraphDocument(),
      localOnly: false,
      operationId: 'op-persist-1',
      baseRevision: 0,
    });

    db.close();

    const reopened = await openLocalDatabase({ factory: fake.factory });
    const outbox = new OutboxRepository(reopened);
    const pending = await outbox.listPending(workspaceId);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.operationId, 'op-persist-1');
    assert.equal(pending[0]?.status, 'pending');
    reopened.close();
  } finally {
    fake.restore();
  }
});
