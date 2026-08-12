import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { AppError } from '@xiaohuang/domain-core';
import { createCloudApp } from '../src/app.js';
import { loadCloudConfig } from '../src/config.js';
import { migrateToLatest } from '../src/db/migrate.js';
import { ClassService } from '../src/classes/service.js';
import { SyncService } from '../src/sync/service.js';
import { withTenantTransaction } from '../src/db/tenant.js';
import { WorkspaceRepository } from '../src/db/repositories/workspace.js';
import { computeContentHash } from '../src/sync/hash.js';
import {
  startPgTestEnv,
  stopPgTestEnv,
  testCloudEnv,
  type PgTestEnv,
} from './helpers/pg-test-container.js';
import { loginTestAccount, seedTestAccount } from './helpers/auth-fixtures.js';

describe('account / class / workspace isolation', () => {
  let pgEnv: PgTestEnv;
  let agent: ReturnType<typeof request>;
  let userAToken: string;
  let userBToken: string;
  let userAAccountId: string;
  let userBAccountId: string;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const migration = await migrateToLatest(pgEnv.pool);
    expect(migration.ok).toBe(true);
    if (migration.ok) {
      expect(migration.applied).toContain(22);
      expect(migration.applied).toContain(23);
      expect(migration.applied.indexOf(22)).toBeLessThan(migration.applied.indexOf(23));
    }

    const userA = await seedTestAccount(pgEnv.pool, {
      username: 'iso_user_a',
      password: 'password123',
      displayName: 'Iso User A',
    });
    userAAccountId = userA.accountId;
    const userB = await seedTestAccount(pgEnv.pool, {
      username: 'iso_user_b',
      password: 'password123',
      displayName: 'Iso User B',
      deviceId: 'dev_iso_user_b',
      deviceLabel: 'Iso User B Device',
    });
    userBAccountId = userB.accountId;

    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    const app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);

    const loginA = await loginTestAccount(agent, {
      username: 'iso_user_a',
      password: 'password123',
    });
    userAToken = loginA.accessToken;

    const loginB = await loginTestAccount(agent, {
      username: 'iso_user_b',
      password: 'password123',
      deviceId: 'dev_iso_user_b',
    });
    userBToken = loginB.accessToken;
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('two accounts cannot read each other classes or workspaces', async () => {
    const created = await agent
      .post('/api/cloud/v1/classes')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: 'A-only class' });
    expect(created.status).toBe(201);
    const classId = created.body.data.id as string;

    const ws = await agent
      .post('/api/cloud/v1/workspaces/class')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ classId, subjectId: 'math' });
    expect(ws.status).toBe(200);
    const workspaceId = ws.body.data.id as string;

    const listB = await agent
      .get('/api/cloud/v1/classes')
      .set('Authorization', `Bearer ${userBToken}`);
    expect(listB.status).toBe(200);
    expect(listB.body.data.some((row: { id: string }) => row.id === classId)).toBe(false);

    const stealClass = await agent
      .post('/api/cloud/v1/workspaces/class')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ classId, subjectId: 'math' });
    expect(stealClass.status).toBe(404);
    expect(stealClass.body.error.code).toBe('CLASS_NOT_FOUND');

    const stealSync = await agent
      .get('/api/cloud/v1/sync/pull')
      .query({ workspaceId })
      .set('Authorization', `Bearer ${userBToken}`);
    expect(stealSync.status).toBe(403);
    expect(stealSync.body.error.code).toBe('FORBIDDEN_WORKSPACE');

    const hidden = await withTenantTransaction(pgEnv.pool, userBAccountId, async (client) => {
      const workspaces = new WorkspaceRepository(client);
      return workspaces.findById(workspaceId);
    });
    expect(hidden).toBeNull();
  });

  it('deleted class workspace cannot sync', async () => {
    const service = new ClassService(pgEnv.pool);
    const created = await service.createClass(userAAccountId, 'Trash sync class');
    const workspace = await service.ensureClassWorkspace(userAAccountId, created.id, 'math');

    await service.deleteClass(userAAccountId, created.id);

    const sync = new SyncService(pgEnv.pool);
    const payload = { note: 'should-not-apply' };
    await expect(
      sync.push(userAAccountId, workspace.id, [
        {
          operationId: 'op-trashed-ws',
          envelope: {
            resourceType: 'math-graph-document',
            resourceId: 'doc-trashed',
            workspaceId: workspace.id,
            schemaVersion: 1,
            revision: 1,
            baseRevision: null,
            payload,
            contentHash: computeContentHash(payload),
            deletedAt: null,
          },
        },
      ]),
    ).rejects.toSatisfy((error: unknown) => {
      return error instanceof AppError && error.code === 'FORBIDDEN_WORKSPACE';
    });

    await expect(sync.pull(userAAccountId, workspace.id, null)).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && error.code === 'FORBIDDEN_WORKSPACE',
    );

    const viaHttp = await agent
      .post('/api/cloud/v1/sync/push')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        workspaceId: workspace.id,
        operations: [
          {
            operationId: 'op-trashed-ws-http',
            envelope: {
              resourceType: 'math-graph-document',
              resourceId: 'doc-trashed-http',
              workspaceId: workspace.id,
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
    expect(viaHttp.status).toBe(403);
    expect(viaHttp.body.error.code).toBe('FORBIDDEN_WORKSPACE');
  });

  it('normal user cannot call /admin/cleanup', async () => {
    const unauth = await agent.post('/api/cloud/v1/admin/cleanup');
    expect(unauth.status).toBe(401);

    const asUser = await agent
      .post('/api/cloud/v1/admin/cleanup')
      .set('Authorization', `Bearer ${userAToken}`);
    expect([403, 404]).toContain(asUser.status);
    if (asUser.status === 403) {
      expect(asUser.body.error.code).toBe('FORBIDDEN_TENANT');
    }
  });

  it('rejects class workspace with mismatched account_id', async () => {
    const classA = await new ClassService(pgEnv.pool).createClass(userAAccountId, 'FK class');
    await expect(
      pgEnv.pool.query(
        `INSERT INTO workspaces (workspace_id, account_id, class_id, subject_id, kind)
         VALUES ('ws_mismatch_iso', $1, $2, 'math', 'class')`,
        [userBAccountId, classA.id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
