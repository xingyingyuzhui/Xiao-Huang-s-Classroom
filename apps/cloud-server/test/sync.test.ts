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
  const payload = input.payload ?? { functions: [] };
  return {
    resourceType: input.resourceType ?? 'math-graph-document',
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
              payload: { functions: [{ expr: 'x^2' }] },
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
    expect(pull.body.data.changes[0].payload).toEqual({ functions: [{ expr: 'x^2' }] });
    expect(pull.body.data.changes[0].revision).toBe(1);
    expect(pull.body.data.hasMore).toBe(false);
  });

  it('treats duplicate operations as idempotent applied', async () => {
    const envelope = makeEnvelope({
      workspaceId,
      resourceId: 'doc-sync-dup',
      payload: { note: 'first' },
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
    expect(conflict.body.data.conflicts[0].conflict.cloudPayload).toEqual({ functions: [] });
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
      payload: { note: 'first' },
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
              payload: { note: 'different' },
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
              resourceType: 'biology-note',
              payload: { n: 1 },
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
              resourceType: 'biology-note',
              baseRevision: 1,
              revision: 2,
              payload: { n: 2 },
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
    expect(matches[0].payload).toEqual({ n: 2 });
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
                resourceType: 'chemistry-note',
                payload: { page: index },
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
              resourceType: 'physics-lab',
              deletedAt,
              payload: {},
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
