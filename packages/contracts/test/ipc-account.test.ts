import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_IPC_CHANNELS,
  accountIpcLoginInputSchema,
  accountIpcSessionDataSchema,
  ipcChannelSchema,
  ipcFail,
  ipcOk,
  ipcRequestSchema,
  isAccountIpcChannel,
  isAllowedIpcSenderOrigin,
  parseAccountIpcData,
  parseAccountIpcPayload,
  parseTrustedCloudOrigin,
  payloadHasForbiddenOriginField,
} from '../src/ipc.js';

describe('account IPC allowlist', () => {
  it('lists every account/cloud channel', () => {
    for (const channel of ACCOUNT_IPC_CHANNELS) {
      expect(ipcChannelSchema.options).toContain(channel);
    }
    expect(ACCOUNT_IPC_CHANNELS).toEqual([
      'account:list-saved',
      'account:login',
      'account:remove-card',
      'account:refresh-session',
      'account:logout',
      'account:capabilities',
      'account:restore-session',
      'account:revoke-remote',
    ]);
  });

  it('rejects unregistered channels', () => {
    expect(ipcRequestSchema.safeParse({ channel: 'account:store-refresh', payload: {} }).success).toBe(
      false,
    );
    expect(ipcRequestSchema.safeParse({ channel: 'shell:exec', payload: {} }).success).toBe(false);
    expect(isAccountIpcChannel('account:login')).toBe(true);
    expect(isAccountIpcChannel('shell:exec')).toBe(false);
  });
});

describe('account IPC payload schemas', () => {
  it('accepts a valid login payload', () => {
    const parsed = parseAccountIpcPayload('account:login', {
      username: 'teacher01',
      password: 'password123',
      deviceLabel: 'Desktop',
      deviceId: 'dev_desktop_01',
      rememberMe: true,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects renderer-supplied cloudOrigin / baseUrl', () => {
    const withOrigin = parseAccountIpcPayload('account:login', {
      username: 'teacher01',
      password: 'password123',
      deviceLabel: 'Desktop',
      cloudOrigin: 'https://evil.example',
    });
    expect(withOrigin.success).toBe(false);

    const withBase = parseAccountIpcPayload('account:refresh-session', {
      accountId: 'acct-1',
      deviceId: 'dev-1',
      baseUrl: 'https://evil.example',
    });
    expect(withBase.success).toBe(false);

    expect(payloadHasForbiddenOriginField({ cloudOrigin: 'https://x' })).toBe(true);
    expect(payloadHasForbiddenOriginField({ username: 'a' })).toBe(false);
  });

  it('rejects extra keys on empty payloads', () => {
    expect(parseAccountIpcPayload('account:list-saved', { cloudOrigin: 'https://x' }).success).toBe(
      false,
    );
    expect(parseAccountIpcPayload('account:list-saved', undefined).success).toBe(true);
    expect(parseAccountIpcPayload('account:capabilities', {}).success).toBe(true);
  });

  it('rejects invalid login strings', () => {
    expect(
      accountIpcLoginInputSchema.safeParse({
        username: 't',
        password: 'short',
        deviceLabel: 'Desktop',
      }).success,
    ).toBe(false);
  });

  it('session data schema strips refresh tokens by rejection', () => {
    const ok = parseAccountIpcData('account:login', {
      accountId: 'acct-1',
      displayName: 'Alice',
      avatarUrl: null,
      accessToken: 'tok_short',
      expiresAt: '2026-08-12T02:00:00.000Z',
      deviceId: 'dev-1',
      sessionId: 'sess-1',
      remembered: true,
    });
    expect(ok.success).toBe(true);

    const leaked = accountIpcSessionDataSchema.safeParse({
      accountId: 'acct-1',
      displayName: 'Alice',
      avatarUrl: null,
      accessToken: 'tok_short',
      expiresAt: '2026-08-12T02:00:00.000Z',
      deviceId: 'dev-1',
      sessionId: 'sess-1',
      remembered: true,
      refreshToken: 'rt-secret',
    });
    expect(leaked.success).toBe(false);
  });
});

describe('IPC sender origin', () => {
  it('allows file:// and the expected app origin', () => {
    expect(isAllowedIpcSenderOrigin('file://', ['file://'])).toBe(true);
    expect(isAllowedIpcSenderOrigin('file://', ['http://127.0.0.1:7788'])).toBe(false);
    expect(isAllowedIpcSenderOrigin('http://127.0.0.1:7788', ['http://127.0.0.1:7788'])).toBe(true);
    expect(isAllowedIpcSenderOrigin('http://127.0.0.1:7788/', ['http://127.0.0.1:7788'])).toBe(true);
  });

  it('rejects arbitrary renderer origins', () => {
    expect(isAllowedIpcSenderOrigin('https://evil.example', ['http://127.0.0.1:7788'])).toBe(false);
    expect(isAllowedIpcSenderOrigin('chrome-extension://abc', ['http://127.0.0.1:7788'])).toBe(false);
    expect(isAllowedIpcSenderOrigin('', ['http://127.0.0.1:7788'])).toBe(false);
    expect(isAllowedIpcSenderOrigin(undefined, ['http://127.0.0.1:7788'])).toBe(false);
    expect(isAllowedIpcSenderOrigin('null', ['http://127.0.0.1:7788'])).toBe(false);
    expect(isAllowedIpcSenderOrigin('null', ['file://'])).toBe(true);
  });
});

describe('trusted cloud origin', () => {
  it('allows loopback http only when unpackaged', () => {
    expect(parseTrustedCloudOrigin('http://127.0.0.1:3000', { packaged: false }).ok).toBe(true);
    expect(parseTrustedCloudOrigin('http://127.0.0.1:3000', { packaged: true }).ok).toBe(false);
    expect(parseTrustedCloudOrigin('http://evil.example', { packaged: false }).ok).toBe(false);
  });

  it('requires https in packaged mode and strips credentials', () => {
    expect(parseTrustedCloudOrigin('https://cloud.example.com', { packaged: true })).toEqual({
      ok: true,
      origin: 'https://cloud.example.com',
    });
    expect(parseTrustedCloudOrigin('https://user:pass@cloud.example.com', { packaged: true }).ok).toBe(
      false,
    );
    expect(parseTrustedCloudOrigin('not-a-url', { packaged: true }).ok).toBe(false);
    expect(parseTrustedCloudOrigin('   ', { packaged: false }).ok).toBe(false);
    expect(parseTrustedCloudOrigin('http://localhost:3000', { packaged: false }).ok).toBe(true);
  });
});

describe('ipcFail sanitization', () => {
  it('never returns stacks and caps message length', () => {
    const result = ipcFail('INTERNAL_UNKNOWN', `boom\n${'x'.repeat(500)}\n    at Error (main.ts:1:1)`);
    expect(result.success).toBe(false);
    expect(result.error.message.length).toBeLessThanOrEqual(240);
    expect(result.error.message).not.toMatch(/at Error/);
    expect(JSON.stringify(result)).not.toContain('stack');
  });

  it('fills empty code/message and wraps ok payloads', () => {
    const failed = ipcFail('', '   ');
    expect(failed.success).toBe(false);
    expect(failed.error.code).toBe('INTERNAL_UNKNOWN');
    expect(failed.error.message).toBe('请求失败');
    expect(ipcOk({ ok: true })).toEqual({ success: true, data: { ok: true } });
  });
});
