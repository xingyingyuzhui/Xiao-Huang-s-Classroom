import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createCloudApp } from '../src/app.js';
import { loadCloudConfig } from '../src/config.js';
import { migrateToLatest } from '../src/db/migrate.js';
import { ClassService } from '../src/classes/service.js';
import {
  startPgTestEnv,
  stopPgTestEnv,
  testCloudEnv,
  type PgTestEnv,
} from './helpers/pg-test-container.js';
import { loginTestAccount, seedTestAccount } from './helpers/auth-fixtures.js';
import { computeContentHash } from '../src/sync/hash.js';

function makeEnvelope(input: {
  workspaceId: string;
  resourceId: string;
  resourceType?: string;
  baseRevision?: number | null;
  revision?: number;
  payload?: unknown;
  deletedAt?: string | null;
  contentHash?: string;
}) {
  const payload = input.payload ?? { subjectSettings: {} };
  return {
    resourceType: input.resourceType ?? 'teacher.settings',
    resourceId: input.resourceId,
    workspaceId: input.workspaceId,
    schemaVersion: 1,
    revision: input.revision ?? 1,
    baseRevision: input.baseRevision ?? null,
    payload,
    contentHash: input.contentHash ?? computeContentHash(payload),
    deletedAt: input.deletedAt ?? null,
  };
}

describe('sync push/pull', () => {
  let pgEnv: PgTestEnv;
  let agent: ReturnType<typeof request>;
  let userAToken: string;
  let userBToken: string;
  let userAAccountId: string;
  let workspaceId: string;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const migration = await migrateToLatest(pgEnv.pool);
    expect(migration.ok).toBe(true);

    const userA = await seedTestAccount(pgEnv.pool, {
      username: 'sync_user_a',
      password: 'password123',
      displayName: 'Sync User A',
    });
    userAAccountId = userA.accountId;
    await seedTestAccount(pgEnv.pool, {
      username: 'sync_user_b',
      password: 'password123',
      displayName: 'Sync User B',
      deviceId: 'dev_sync_user_b',
      deviceLabel: 'Sync User B Device',
    });

    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    const app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);

    const loginA = await loginTestAccount(agent, {
      username: 'sync_user_a',
      password: 'password123',
    });
    userAToken = loginA.accessToken;

    const loginB = await loginTestAccount(agent, {
      username: 'sync_user_b',
      password: 'password123',
      deviceId: 'dev_sync_user_b',
    });
    userBToken = loginB.accessToken;

    const classes = new ClassService(pgEnv.pool);
    const workspace = await classes.ensurePersonalWorkspace(userAAccountId, 'math');
    workspaceId = workspace.id;
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('pushes a resource and pulls it back', async () => {
    const push = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-sync-1',
            envelope: makeEnvelope({
              workspaceId,
              resourceId: 'doc-sync-1',
              payload: { subjectSettings: { chemistry: { theme: 'lab' } } },
            }),
          },
        ],
      });
    expect(push.status).toBe(200);
    expect(push.body.success).toBe(true);
    expect(push.body.data.applied).toEqual(['op-sync-1']);
    expect(push.body.data.conflicts).toEqual([]);
    expect(push.body.data.rejected).toEqual([]);

    const pull = await agent
      .get('/api/cloud/v1/sync/pull')
      .query({ workspaceId })
      .set('Authorization', `Bearer ${userAToken}`);
    expect(pull.status).toBe(200);
    expect(pull.body.data.changes).toHaveLength(1);
    expect(pull.body.data.changes[0].resourceId).toBe('doc-sync-1');
    expect(pull.body.data.changes[0].payload).toEqual({
      subjectSettings: { chemistry: { theme: 'lab' } },
    });
    expect(pull.body.data.changes[0].revision).toBe(1);
    expect(pull.body.data.hasMore).toBe(false);
  });

  it('treats duplicate operations as idempotent applied', async () => {
    const envelope = makeEnvelope({
      workspaceId,
      resourceId: 'doc-sync-dup',
      payload: { subjectSettings: { note: 'first' } },
    });
    const first = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [{ operationId: 'op-sync-dup', envelope }],
      });
    expect(first.status).toBe(200);
    expect(first.body.data.applied).toEqual(['op-sync-dup']);

    const second = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [{ operationId: 'op-sync-dup', envelope }],
      });
    expect(second.status).toBe(200);
    expect(second.body.data.applied).toEqual(['op-sync-dup']);
    expect(second.body.data.conflicts).toEqual([]);
    expect(second.body.data.rejected).toEqual([]);

    const pull = await agent
      .get('/api/cloud/v1/sync/pull')
      .query({ workspaceId, cursor: '0' })
      .set('Authorization', `Bearer ${userAToken}`);
    const dupChanges = pull.body.data.changes.filter(
      (change: { resourceId: string }) => change.resourceId === 'doc-sync-dup',
    );
    expect(dupChanges).toHaveLength(1);
  });

  it('rejects unknown resource types', async () => {
    const payload = { note: 'x' };
    const push = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-unknown-type',
            envelope: {
              resourceType: 'math-graph-document',
              resourceId: 'doc-unknown',
              workspaceId,
              schemaVersion: 1,
              revision: 1,
              baseRevision: null,
              payload,
              contentHash: computeContentHash(payload),
              deletedAt: null,
            },
          },
        ],
      });
    expect(push.status).toBe(200);
    expect(push.body.data.applied).toEqual([]);
    expect(push.body.data.rejected[0].code).toBe('SYNC_UNKNOWN_RESOURCE');
  });

  it('rejects invalid payload for registered type', async () => {
    const payload = { students: 'not-an-array' };
    const push = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-bad-roster',
            envelope: {
              resourceType: 'class.roster',
              resourceId: 'roster-bad',
              workspaceId,
              schemaVersion: 1,
              revision: 1,
              baseRevision: null,
              payload,
              contentHash: computeContentHash(payload),
              deletedAt: null,
            },
          },
        ],
      });
    expect(push.status).toBe(200);
    expect(push.body.data.rejected[0].code).toBe('VALIDATION_SCHEMA');
  });

  it('rejects null-base create when resource already exists', async () => {
    const resourceId = 'doc-sync-null-overwrite';
    const create = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-null-overwrite-create',
            envelope: makeEnvelope({ workspaceId, resourceId, baseRevision: null }),
          },
        ],
      });
    expect(create.body.data.applied).toEqual(['op-null-overwrite-create']);

    const overwrite = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-null-overwrite-attempt',
            envelope: makeEnvelope({
              workspaceId,
              resourceId,
              baseRevision: null,
              payload: { hijack: true },
            }),
          },
        ],
      });
    expect(overwrite.body.data.applied).toEqual([]);
    expect(overwrite.body.data.conflicts).toHaveLength(1);
    expect(overwrite.body.data.conflicts[0].operationId).toBe('op-null-overwrite-attempt');
  });

  it('returns conflict when baseRevision does not match server revision', async () => {
    const resourceId = 'doc-sync-conflict';
    const create = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-sync-conflict-create',
            envelope: makeEnvelope({ workspaceId, resourceId, baseRevision: null }),
          },
        ],
      });
    expect(create.status).toBe(200);
    expect(create.body.data.applied).toEqual(['op-sync-conflict-create']);

    const conflict = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-sync-conflict-update',
            envelope: makeEnvelope({
              workspaceId,
              resourceId,
              baseRevision: 99,
              revision: 2,
              payload: { stale: true },
            }),
          },
        ],
      });
    expect(conflict.status).toBe(200);
    expect(conflict.body.data.applied).toEqual([]);
    expect(conflict.body.data.conflicts).toHaveLength(1);
    expect(conflict.body.data.conflicts[0].operationId).toBe('op-sync-conflict-update');
    expect(conflict.body.data.conflicts[0].conflict.cloudSummary).toBe('revision:1');
    expect(conflict.body.data.conflicts[0].conflict.cloudRevision).toBe(1);
    expect(conflict.body.data.conflicts[0].conflict.cloudPayload).toEqual({ subjectSettings: {} });
  });

  it('rejects content hash mismatch', async () => {
    const push = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-sync-hash-mismatch',
            envelope: makeEnvelope({
              workspaceId,
              resourceId: 'doc-hash-mismatch',
              payload: { note: 'tampered' },
              contentHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
            }),
          },
        ],
      });
    expect(push.status).toBe(200);
    expect(push.body.data.applied).toEqual([]);
    expect(push.body.data.rejected).toHaveLength(1);
    expect(push.body.data.rejected[0].operationId).toBe('op-sync-hash-mismatch');
    expect(push.body.data.rejected[0].code).toBe('SYNC_HASH_MISMATCH');
  });

  it('rejects duplicate operationId with a different payload', async () => {
    const firstEnvelope = makeEnvelope({
      workspaceId,
      resourceId: 'doc-op-payload',
      payload: { subjectSettings: { note: 'first' } },
    });
    const first = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [{ operationId: 'op-sync-payload-mismatch', envelope: firstEnvelope }],
      });
    expect(first.status).toBe(200);
    expect(first.body.data.applied).toEqual(['op-sync-payload-mismatch']);

    const second = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-sync-payload-mismatch',
            envelope: makeEnvelope({
              workspaceId,
              resourceId: 'doc-op-payload',
              payload: { subjectSettings: { note: 'different' } },
            }),
          },
        ],
      });
    expect(second.status).toBe(200);
    expect(second.body.data.applied).toEqual([]);
    expect(second.body.data.rejected).toHaveLength(1);
    expect(second.body.data.rejected[0].code).toBe('SYNC_OPERATION_PAYLOAD_MISMATCH');
  });

  it('pull de-dupes the same resource within a cursor page', async () => {
    const dedupeWorkspace = (
      await new ClassService(pgEnv.pool).ensurePersonalWorkspace(userAAccountId, 'biology')
    ).id;
    const resourceId = 'doc-dedupe';
    const first = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId: dedupeWorkspace,
        operations: [
          {
            operationId: 'op-dedupe-1',
            envelope: makeEnvelope({
              workspaceId: dedupeWorkspace,
              resourceId,
              resourceType: 'class.roster',
              payload: { students: [{ id: 's1', name: 'A' }] },
            }),
          },
        ],
      });
    expect(first.body.data.applied).toEqual(['op-dedupe-1']);

    const second = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId: dedupeWorkspace,
        operations: [
          {
            operationId: 'op-dedupe-2',
            envelope: makeEnvelope({
              workspaceId: dedupeWorkspace,
              resourceId,
              resourceType: 'class.roster',
              baseRevision: 1,
              revision: 2,
              payload: { students: [{ id: 's1', name: 'B' }] },
            }),
          },
        ],
      });
    expect(second.body.data.applied).toEqual(['op-dedupe-2']);

    const pull = await agent
      .get('/api/cloud/v1/sync/pull')
      .query({ workspaceId: dedupeWorkspace })
      .set('Authorization', `Bearer ${userAToken}`);
    const matches = pull.body.data.changes.filter(
      (change: { resourceId: string }) => change.resourceId === resourceId,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].payload).toEqual({ students: [{ id: 's1', name: 'B' }] });
    expect(matches[0].revision).toBe(2);
  });

  it('rejects a stale cursor', async () => {
    const pull = await agent
      .get('/api/cloud/v1/sync/pull')
      .query({ workspaceId, cursor: 'not-a-cursor' })
      .set('Authorization', `Bearer ${userAToken}`);
    expect(pull.status).toBeGreaterThanOrEqual(400);
    expect(pull.body.error.code).toBe('SYNC_CURSOR_STALE');
  });

  it('isolates sync data across tenants', async () => {
    const pullAttempt = await agent
      .get('/api/cloud/v1/sync/pull')
      .query({ workspaceId })
      .set('Authorization', `Bearer ${userBToken}`);
    expect(pullAttempt.status).toBe(403);
    expect(pullAttempt.body.error.code).toBe('FORBIDDEN_WORKSPACE');

    const pushAttempt = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-sync-cross-tenant',
            envelope: makeEnvelope({ workspaceId, resourceId: 'doc-stolen' }),
          },
        ],
      });
    expect(pushAttempt.status).toBe(403);
    expect(pushAttempt.body.error.code).toBe('FORBIDDEN_WORKSPACE');
  });

  it('paginates pull results with cursor and hasMore', async () => {
    const paginationWorkspace = (
      await new ClassService(pgEnv.pool).ensurePersonalWorkspace(userAAccountId, 'chemistry')
    ).id;

    for (let index = 1; index <= 3; index += 1) {
      const push = await agent
        .post('/api/cloud/v1/sync/push')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          workspaceId: paginationWorkspace,
          operations: [
            {
              operationId: `op-sync-page-${index}`,
              envelope: makeEnvelope({
                workspaceId: paginationWorkspace,
                resourceId: `doc-page-${index}`,
                resourceType: 'class.settings',
                payload: { className: `Page ${index}` },
              }),
            },
          ],
        });
      expect(push.status).toBe(200);
      expect(push.body.data.applied).toEqual([`op-sync-page-${index}`]);
    }

    const firstPage = await agent
      .get('/api/cloud/v1/sync/pull')
      .query({ workspaceId: paginationWorkspace, limit: 2 })
      .set('Authorization', `Bearer ${userAToken}`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.changes).toHaveLength(2);
    expect(firstPage.body.data.hasMore).toBe(true);

    const secondPage = await agent
      .get('/api/cloud/v1/sync/pull')
      .query({
        workspaceId: paginationWorkspace,
        cursor: firstPage.body.data.cursor,
        limit: 2,
      })
      .set('Authorization', `Bearer ${userAToken}`);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.changes).toHaveLength(1);
    expect(secondPage.body.data.hasMore).toBe(false);
  });

  it('allows only one concurrent update at the same base revision', async () => {
    const resourceId = 'doc-sync-race-update';
    const create = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-race-update-create',
            envelope: makeEnvelope({ workspaceId, resourceId, baseRevision: null }),
          },
        ],
      });
    expect(create.body.data.applied).toEqual(['op-race-update-create']);

    const [first, second] = await Promise.all([
      agent
        .post('/api/cloud/v1/sync/push')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          workspaceId,
          operations: [
            {
              operationId: 'op-race-update-a',
              envelope: makeEnvelope({
                workspaceId,
                resourceId,
                baseRevision: 1,
                revision: 2,
                payload: { subjectSettings: { from: 'a' } },
              }),
            },
          ],
        }),
      agent
        .post('/api/cloud/v1/sync/push')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          workspaceId,
          operations: [
            {
              operationId: 'op-race-update-b',
              envelope: makeEnvelope({
                workspaceId,
                resourceId,
                baseRevision: 1,
                revision: 2,
                payload: { subjectSettings: { from: 'b' } },
              }),
            },
          ],
        }),
    ]);

    const appliedCount =
      (first.body.data.applied?.length ?? 0) + (second.body.data.applied?.length ?? 0);
    const conflictCount =
      (first.body.data.conflicts?.length ?? 0) + (second.body.data.conflicts?.length ?? 0);
    expect(appliedCount).toBe(1);
    expect(conflictCount).toBe(1);
  });

  it('treats concurrent duplicate operationId retries as idempotent', async () => {
    const resourceId = 'doc-sync-race-opid';
    const envelope = makeEnvelope({
      workspaceId,
      resourceId,
      payload: { subjectSettings: { note: 'race' } },
    });
    const [first, second] = await Promise.all([
      agent
        .post('/api/cloud/v1/sync/push')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          workspaceId,
          operations: [{ operationId: 'op-race-opid', envelope }],
        }),
      agent
        .post('/api/cloud/v1/sync/push')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          workspaceId,
          operations: [{ operationId: 'op-race-opid', envelope }],
        }),
    ]);

    expect(first.body.data.applied).toEqual(['op-race-opid']);
    expect(second.body.data.applied).toEqual(['op-race-opid']);
    expect(first.body.data.conflicts).toEqual([]);
    expect(second.body.data.conflicts).toEqual([]);

    const pull = await agent
      .get('/api/cloud/v1/sync/pull')
      .query({ workspaceId })
      .set('Authorization', `Bearer ${userAToken}`);
    const matches = pull.body.data.changes.filter(
      (change: { resourceId: string }) => change.resourceId === resourceId,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].revision).toBe(1);
  });

  it('does not append change log entries for conflicts', async () => {
    const resourceId = 'doc-sync-no-changelog-on-conflict';
    const create = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-no-changelog-create',
            envelope: makeEnvelope({ workspaceId, resourceId, baseRevision: null }),
          },
        ],
      });
    expect(create.body.data.applied).toEqual(['op-no-changelog-create']);

    const beforePull = await agent
      .get('/api/cloud/v1/sync/pull')
      .query({ workspaceId })
      .set('Authorization', `Bearer ${userAToken}`);
    const beforeCount = beforePull.body.data.changes.filter(
      (change: { resourceId: string }) => change.resourceId === resourceId,
    ).length;

    const conflict = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId,
        operations: [
          {
            operationId: 'op-no-changelog-conflict',
            envelope: makeEnvelope({
              workspaceId,
              resourceId,
              baseRevision: 99,
              revision: 2,
              payload: { stale: true },
            }),
          },
        ],
      });
    expect(conflict.body.data.conflicts).toHaveLength(1);

    const afterPull = await agent
      .get('/api/cloud/v1/sync/pull')
      .query({ workspaceId })
      .set('Authorization', `Bearer ${userAToken}`);
    const afterCount = afterPull.body.data.changes.filter(
      (change: { resourceId: string }) => change.resourceId === resourceId,
    ).length;
    expect(afterCount).toBe(beforeCount);
  });

  it('allows only one concurrent create for the same resource', async () => {
    const resourceId = 'doc-sync-race-create';
    const [first, second] = await Promise.all([
      agent
        .post('/api/cloud/v1/sync/push')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          workspaceId,
          operations: [
            {
              operationId: 'op-race-create-a',
              envelope: makeEnvelope({
                workspaceId,
                resourceId,
                payload: { subjectSettings: { from: 'a' } },
              }),
            },
          ],
        }),
      agent
        .post('/api/cloud/v1/sync/push')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          workspaceId,
          operations: [
            {
              operationId: 'op-race-create-b',
              envelope: makeEnvelope({
                workspaceId,
                resourceId,
                payload: { subjectSettings: { from: 'b' } },
              }),
            },
          ],
        }),
    ]);

    const appliedCount =
      (first.body.data.applied?.length ?? 0) + (second.body.data.applied?.length ?? 0);
    const conflictCount =
      (first.body.data.conflicts?.length ?? 0) + (second.body.data.conflicts?.length ?? 0);
    expect(appliedCount).toBe(1);
    expect(conflictCount).toBe(1);
  });

  it('pulls tombstoned resources with deletedAt set', async () => {
    const tombstoneWorkspace = (
      await new ClassService(pgEnv.pool).ensurePersonalWorkspace(userAAccountId, 'physics')
    ).id;
    const deletedAt = new Date().toISOString();

    const push = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId: tombstoneWorkspace,
        operations: [
          {
            operationId: 'op-sync-tombstone',
            envelope: makeEnvelope({
              workspaceId: tombstoneWorkspace,
              resourceId: 'doc-tombstone',
              resourceType: 'class.roster',
              deletedAt,
              payload: { students: [] },
            }),
          },
        ],
      });
    expect(push.status).toBe(200);
    expect(push.body.data.applied).toEqual(['op-sync-tombstone']);

    const pull = await agent
      .get('/api/cloud/v1/sync/pull')
      .query({ workspaceId: tombstoneWorkspace })
      .set('Authorization', `Bearer ${userAToken}`);
    expect(pull.status).toBe(200);
    const tombstone = pull.body.data.changes.find(
      (change: { resourceId: string }) => change.resourceId === 'doc-tombstone',
    );
    expect(tombstone).toBeTruthy();
    expect(tombstone.deletedAt).toBe(deletedAt);
  });
});
