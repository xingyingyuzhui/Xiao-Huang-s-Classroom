import { describe, expect, it } from 'vitest';
import {
  accountIdSchema,
  accountProfilePatchSchema,
  authLoginRequestSchema,
  authSessionSchema,
  syncEntityEnvelopeSchema,
  syncPushResponseSchema,
  syncPullResponseSchema,
  workspaceContextSchema,
  aiCredentialMetadataSchema,
  aiCredentialUpsertSchema,
  subjectSettingsSchema,
  operationIdSchema,
  teacherSettingsPayloadSchema,
  classRosterPayloadSchema,
} from '../src/index.js';

describe('account cloud branded IDs', () => {
  it('accepts safe ids and rejects empty', () => {
    expect(accountIdSchema.safeParse('acct-1').success).toBe(true);
    expect(accountIdSchema.safeParse('').success).toBe(false);
    expect(accountIdSchema.safeParse('a'.repeat(200)).success).toBe(false);
  });

  it('operationId is required on sync operations', () => {
    expect(operationIdSchema.safeParse('op-123').success).toBe(true);
  });

  it('wave1 registry rejects unknown types and validates roster payload', async () => {
    const {
      getSyncResourceRegistration,
      listSyncResourceTypes,
      measurePayloadBytes,
    } = await import('../src/sync-resource-registry.js');
    expect(listSyncResourceTypes()).toEqual([
      'teacher.settings',
      'class.settings',
      'class.roster',
    ]);
    expect(getSyncResourceRegistration('math-graph-document')).toBeUndefined();
    const roster = getSyncResourceRegistration('class.roster');
    expect(roster?.payloadSchema.safeParse({ students: [] }).success).toBe(true);
    expect(roster?.payloadSchema.safeParse({ students: 'bad' }).success).toBe(false);
    expect(measurePayloadBytes({ a: 1 })).toBeGreaterThan(0);
  });

  it('push conflict schema requires cloud snapshot fields', () => {
    const ok = syncPushResponseSchema.safeParse({
      applied: [],
      rejected: [],
      conflicts: [
        {
          operationId: 'op-1',
          conflict: {
            resourceType: 'teacher.settings',
            resourceId: 'default',
            localSummary: 'revision:1',
            cloudSummary: 'revision:2',
            baseSummary: null,
            cloudRevision: 2,
            cloudSchemaVersion: 1,
            cloudPayload: {},
            cloudDeletedAt: null,
          },
        },
      ],
      requestId: 'req',
    });
    expect(ok.success).toBe(true);

    const missingCloud = syncPushResponseSchema.safeParse({
      applied: [],
      rejected: [],
      conflicts: [
        {
          operationId: 'op-1',
          conflict: {
            resourceType: 'teacher.settings',
            resourceId: 'default',
            localSummary: 'revision:1',
            cloudSummary: 'revision:2',
            baseSummary: null,
          },
        },
      ],
      requestId: 'req',
    });
    expect(missingCloud.success).toBe(false);
  });

  it('profile patch requires at least one field', () => {
    expect(accountProfilePatchSchema.safeParse({}).success).toBe(false);
    expect(accountProfilePatchSchema.safeParse({ displayName: 'Alice' }).success).toBe(true);
  });
});

describe('auth contracts', () => {
  it('login schema caps string lengths', () => {
    const ok = authLoginRequestSchema.safeParse({
      username: 'teacher',
      password: 'password123',
      deviceLabel: 'Web',
      deviceId: 'dev_web_stable_01',
    });
    expect(ok.success).toBe(true);

    const withoutDevice = authLoginRequestSchema.safeParse({
      username: 'teacher',
      password: 'password123',
      deviceLabel: 'Web',
    });
    expect(withoutDevice.success).toBe(true);

    const bad = authLoginRequestSchema.safeParse({
      username: 'te@cher!',
      password: 'short',
      deviceLabel: 'x'.repeat(40),
    });
    expect(bad.success).toBe(false);
  });

  it('session schema has no refresh token field', () => {
    const keys = Object.keys(authSessionSchema.shape);
    expect(keys).not.toContain('refreshToken');
    expect(keys).not.toContain('apiKey');
  });
});

describe('workspace scope', () => {
  it('requires explicit accountId classId subjectId workspaceId kind', () => {
    const ok = workspaceContextSchema.safeParse({
      mode: 'authenticated',
      accountId: 'acct-1',
      classId: null,
      subjectId: 'math',
      workspaceId: 'ws-personal-math',
      kind: 'personal',
      deviceId: 'dev-1',
      generation: 0,
    });
    expect(ok.success).toBe(true);
  });
});

describe('sync contracts', () => {
  it('SyncEntityEnvelope carries revision and contentHash', () => {
    const ok = syncEntityEnvelopeSchema.safeParse({
      resourceType: 'math-graph-document',
      resourceId: 'doc-1',
      workspaceId: 'ws-1',
      schemaVersion: 2,
      revision: 3,
      baseRevision: 2,
      payload: { functions: [] },
      contentHash: 'sha256:abcd1234',
      deletedAt: null,
    });
    expect(ok.success).toBe(true);
  });

  it('SyncPushResponse splits applied/rejected/conflicts', () => {
    const ok = syncPushResponseSchema.safeParse({
      applied: ['op-1'],
      rejected: [{ operationId: 'op-2', code: 'SYNC_PAYLOAD_TOO_LARGE', message: 'too big' }],
      conflicts: [
        {
          operationId: 'op-3',
          conflict: {
            resourceType: 'math-graph-document',
            resourceId: 'doc-1',
            localSummary: 'local v3',
            cloudSummary: 'cloud v4',
            baseSummary: 'base v2',
            cloudRevision: 4,
            cloudSchemaVersion: 1,
            cloudPayload: { functions: [] },
            cloudDeletedAt: null,
          },
        },
      ],
      requestId: 'req-1',
    });
    expect(ok.success).toBe(true);
  });

  it('SyncPullResponse uses cursor not client timestamp', () => {
    const ok = syncPullResponseSchema.safeParse({
      cursor: 'cursor-abc',
      sequence: 42,
      changes: [],
      hasMore: false,
      requestId: 'req-2',
    });
    expect(ok.success).toBe(true);
    expect(ok.success && 'clientTime' in (ok.data as object)).toBe(false);
  });
});

describe('AI credential metadata', () => {
  it('metadata never exposes key plaintext', () => {
    const keys = Object.keys(aiCredentialMetadataSchema.shape);
    expect(keys).not.toContain('apiKey');
    expect(keys).toContain('last4');
  });

  it('upsert allows key on write only', () => {
    expect(
      aiCredentialUpsertSchema.safeParse({
        provider: 'openai-compatible',
        model: 'gpt-4o-mini',
        apiKey: 'sk-test-key-12345678',
      }).success,
    ).toBe(true);
  });
});

describe('wave1 resource payloads', () => {
  it('teacher.settings accepts theme and nested subject map', () => {
    const ok = teacherSettingsPayloadSchema.safeParse({
      theme: { id: 'blackboard' },
      subjectSettings: { chemistry: { brand: { title: '化学' } } },
    });
    expect(ok.success).toBe(true);
  });

  it('class.roster requires id and name', () => {
    expect(
      classRosterPayloadSchema.safeParse({
        students: [{ id: 'stu_1', name: '小黄' }],
      }).success,
    ).toBe(true);
    expect(
      classRosterPayloadSchema.safeParse({
        students: [{ id: 'stu_1' }],
      }).success,
    ).toBe(false);
  });
});

describe('subject settings tightened', () => {
  it('rejects nested objects and apiKey in settings', () => {
    expect(
      subjectSettingsSchema.safeParse({
        chemistry: { theme: 'dark', zoom: 1.1 },
      }).success,
    ).toBe(true);
    expect(
      subjectSettingsSchema.safeParse({
        chemistry: { apiKey: 'secret' },
      }).success,
    ).toBe(false);
  });
});

describe('domain-core error codes', () => {
  it('includes AUTH SYNC CONFLICT QUOTA CREDENTIAL codes', async () => {
    const { ErrorCode } = await import('@xiaohuang/domain-core');
    for (const code of [
      'AUTH_INVALID_CREDENTIALS',
      'SYNC_CONFLICT',
      'CONFLICT_UNRESOLVED',
      'QUOTA_DAILY_EXCEEDED',
      'CREDENTIAL_NOT_CONFIGURED',
    ]) {
      expect((ErrorCode as readonly string[]).includes(code)).toBe(true);
    }
  });
});
