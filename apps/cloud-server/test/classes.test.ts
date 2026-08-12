import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createCloudApp } from '../src/app.js';
import { loadCloudConfig } from '../src/config.js';
import { migrateToLatest } from '../src/db/migrate.js';
import { ClassService } from '../src/classes/service.js';
import { withTenantTransaction } from '../src/db/tenant.js';
import { WorkspaceRepository } from '../src/db/repositories/workspace.js';
import {
  startPgTestEnv,
  stopPgTestEnv,
  testCloudEnv,
  type PgTestEnv,
} from './helpers/pg-test-container.js';
import { loginTestAccount, seedTestAccount } from './helpers/auth-fixtures.js';

describe('classes and workspaces', () => {
  let pgEnv: PgTestEnv;
  let agent: ReturnType<typeof request>;
  let userAToken: string;
  let userBToken: string;
  let userAAccountId: string;

  beforeAll(async () => {
    pgEnv = await startPgTestEnv();
    const migration = await migrateToLatest(pgEnv.pool);
    expect(migration.ok).toBe(true);

    const userA = await seedTestAccount(pgEnv.pool, {
      username: 'class_user_a',
      password: 'password123',
      displayName: 'Class User A',
    });
    userAAccountId = userA.accountId;
    await seedTestAccount(pgEnv.pool, {
      username: 'class_user_b',
      password: 'password123',
      displayName: 'Class User B',
      deviceId: 'dev_class_user_b',
      deviceLabel: 'Class User B Device',
    });

    const config = loadCloudConfig(testCloudEnv(pgEnv.databaseUrl));
    const app = createCloudApp({ config, pool: pgEnv.pool });
    agent = request.agent(app);

    const loginA = await loginTestAccount(agent, {
      username: 'class_user_a',
      password: 'password123',
    });
    userAToken = loginA.accessToken;

    const loginB = await loginTestAccount(agent, {
      username: 'class_user_b',
      password: 'password123',
      deviceId: 'dev_class_user_b',
    });
    userBToken = loginB.accessToken;
  }, 120_000);

  afterAll(async () => {
    await stopPgTestEnv(pgEnv);
  });

  it('creates, lists, patches, copies, trashes, and restores classes', async () => {
    const created = await agent
      .post('/api/cloud/v1/classes')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: '高一(1)班' });
    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe('高一(1)班');
    const classId = created.body.data.id as string;

    const listed = await agent
      .get('/api/cloud/v1/classes')
      .set('Authorization', `Bearer ${userAToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((row: { id: string }) => row.id === classId)).toBe(true);

    const patched = await agent
      .patch(`/api/cloud/v1/classes/${classId}`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: '高一(2)班', archived: true });
    expect(patched.status).toBe(200);
    expect(patched.body.data.name).toBe('高一(2)班');
    expect(patched.body.data.archived).toBe(true);

    const copied = await agent
      .post(`/api/cloud/v1/classes/${classId}/copy`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: '复制班级' });
    expect(copied.status).toBe(201);
    expect(copied.body.data.name).toBe('复制班级');
    expect(copied.body.data.id).not.toBe(classId);

    const deleted = await agent
      .delete(`/api/cloud/v1/classes/${classId}`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.deletedAt).toBeTruthy();

    const activeAfterDelete = await agent
      .get('/api/cloud/v1/classes')
      .set('Authorization', `Bearer ${userAToken}`);
    expect(activeAfterDelete.body.data.some((row: { id: string }) => row.id === classId)).toBe(
      false,
    );

    const trash = await agent
      .get('/api/cloud/v1/trash/classes')
      .set('Authorization', `Bearer ${userAToken}`);
    expect(trash.status).toBe(200);
    expect(trash.body.data.some((row: { id: string }) => row.id === classId)).toBe(true);

    const restored = await agent
      .post(`/api/cloud/v1/classes/${classId}/restore`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(restored.status).toBe(200);
    expect(restored.body.data.deletedAt).toBeNull();

    const activeAfterRestore = await agent
      .get('/api/cloud/v1/classes')
      .set('Authorization', `Bearer ${userAToken}`);
    expect(activeAfterRestore.body.data.some((row: { id: string }) => row.id === classId)).toBe(
      true,
    );
  });

  it('rejects cross-tenant class IDOR', async () => {
    const created = await agent
      .post('/api/cloud/v1/classes')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ name: 'User B Class' });
    expect(created.status).toBe(201);
    const classId = created.body.data.id as string;

    const patchAttempt = await agent
      .patch(`/api/cloud/v1/classes/${classId}`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: 'Stolen Class' });
    expect(patchAttempt.status).toBe(404);
    expect(patchAttempt.body.error.code).toBe('CLASS_NOT_FOUND');

    const deleteAttempt = await agent
      .delete(`/api/cloud/v1/classes/${classId}`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(deleteAttempt.status).toBe(404);
    expect(deleteAttempt.body.error.code).toBe('CLASS_NOT_FOUND');
  });

  it('lazy-creates a single personal workspace per account/subject', async () => {
    const service = new ClassService(pgEnv.pool);
    const [first, second] = await Promise.all([
      service.ensurePersonalWorkspace(userAAccountId, 'math'),
      service.ensurePersonalWorkspace(userAAccountId, 'math'),
    ]);
    expect(first.id).toBe(second.id);
    expect(first.kind).toBe('personal');
    expect(first.classId).toBeNull();
    expect(first.subjectId).toBe('math');
  });

  it('isolates tenant data via RLS and repository filters', async () => {
    const service = new ClassService(pgEnv.pool);
    await service.ensurePersonalWorkspace(userAAccountId, 'chemistry');

    const visibleToB = await withTenantTransaction(pgEnv.pool, userAAccountId, async (client) => {
      const workspaces = new WorkspaceRepository(client);
      return workspaces.findPersonal({ accountId: userAAccountId, subjectId: 'chemistry' });
    });

    const hiddenFromB = await withTenantTransaction(
      pgEnv.pool,
      'acct_nonexistent_tenant',
      async (client) => {
        const workspaces = new WorkspaceRepository(client);
        return workspaces.findPersonal({ accountId: userAAccountId, subjectId: 'chemistry' });
      },
    );

    expect(visibleToB?.workspace_id).toBeTruthy();
    expect(hiddenFromB).toBeNull();
  });

  it('tombstones class workspaces when class is deleted and restores them', async () => {
    const service = new ClassService(pgEnv.pool);
    const created = await service.createClass(userAAccountId, 'Workspace Tombstone Class');
    const classId = created.id;

    await withTenantTransaction(pgEnv.pool, userAAccountId, async (client) => {
      const workspaces = new WorkspaceRepository(client);
      await workspaces.ensureClassWorkspace({
        accountId: userAAccountId,
        classId,
        subjectId: 'math',
        mode: 'authenticated',
        generation: 0,
      });
    });

    await service.deleteClass(userAAccountId, classId);

    const trashedWorkspaces = await withTenantTransaction(
      pgEnv.pool,
      userAAccountId,
      async (client) => {
        const result = await client.query<{ deleted_at: Date | null }>(
          `SELECT deleted_at FROM workspaces WHERE class_id = $1`,
          [classId],
        );
        return result.rows;
      },
    );
    expect(trashedWorkspaces.every((row) => row.deleted_at !== null)).toBe(true);

    await service.restoreClass(userAAccountId, classId);

    const restoredWorkspaces = await withTenantTransaction(
      pgEnv.pool,
      userAAccountId,
      async (client) => {
        const result = await client.query<{ deleted_at: Date | null }>(
          `SELECT deleted_at FROM workspaces WHERE class_id = $1`,
          [classId],
        );
        return result.rows;
      },
    );
    expect(restoredWorkspaces.every((row) => row.deleted_at === null)).toBe(true);
  });
});
