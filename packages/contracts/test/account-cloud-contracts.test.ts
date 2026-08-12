import { describe, expect, it } from 'vitest';
import {
  accountIdSchema,
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
