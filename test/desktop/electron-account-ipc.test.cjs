// @ts-check
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const CORE_PATH = path.join(root, 'apps/desktop/dist/account-ipc-core.js');

/** @type {typeof import('../../apps/desktop/src/account-ipc-core.ts')} */
let coreMod;

before(() => {
  assert.ok(fs.existsSync(CORE_PATH), 'desktop build 须产出 dist/account-ipc-core.js（turbo test 会先 build）');
  coreMod = require(CORE_PATH);
});

function jsonResponse(status, body, headers = {}) {
  const headerMap = new Map(Object.entries({ 'content-type': 'application/json', ...headers }));
  return /** @type {Response} */ ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => headerMap.get(String(name).toLowerCase()) ?? null,
      getSetCookie: () => {
        const cookie = headerMap.get('set-cookie');
        return cookie ? [cookie] : [];
      },
    },
    json: async () => body,
  });
}

function makeVault(available = true) {
  /** @type {Map<string, any>} */
  const entries = new Map();
  let lastUsed = /** @type {string | null} */ (null);
  return {
    available,
    entries,
    isAvailable: () => available,
    async store(input) {
      if (input.persist && !available) {
        throw new Error('CREDENTIAL_STORAGE_UNAVAILABLE');
      }
      entries.set(input.accountId, { ...input, lastUsedAt: new Date().toISOString() });
      lastUsed = input.accountId;
    },
    async retrieve(accountId) {
      const entry = entries.get(accountId);
      if (!entry) return null;
      return { refreshToken: entry.refreshToken, deviceId: entry.deviceId };
    },
    async remove(accountId) {
      entries.delete(accountId);
      if (lastUsed === accountId) lastUsed = [...entries.keys()][0] ?? null;
    },
    listAccounts() {
      return [...entries.values()]
        .filter((entry) => entry.persist)
        .map((entry) => ({
          accountId: entry.accountId,
          displayName: entry.displayName,
          avatarUrl: entry.avatarUrl,
          deviceId: entry.deviceId,
          lastUsedAt: entry.lastUsedAt,
          persisted: true,
        }));
    },
    getLastUsedAccountId() {
      return lastUsed;
    },
  };
}

const SESSION = {
  accountId: 'acct-1',
  sessionId: 'sess-1',
  deviceId: 'dev-1',
  accessTokenExpiresAt: '2026-08-12T12:00:00.000Z',
};

function loginFetch() {
  return async (url, init) => {
    const href = String(url);
    if (href.endsWith('/auth/login')) {
      assert.equal(init.redirect, 'error');
      const body = JSON.parse(String(init.body));
      assert.equal(body.cloudOrigin, undefined);
      return jsonResponse(
        200,
        { success: true, data: { session: SESSION, accessToken: 'atk-1' }, requestId: 'r1' },
        { 'set-cookie': 'xh_refresh=rt-secret-1; Path=/api/cloud/v1/auth; HttpOnly' },
      );
    }
    if (href.endsWith('/account')) {
      return jsonResponse(200, {
        success: true,
        data: { displayName: 'Alice', avatarUrl: null },
        requestId: 'r2',
      });
    }
    if (href.endsWith('/auth/refresh')) {
      assert.match(String(init.headers.Cookie || init.headers.cookie || ''), /rt-secret/);
      return jsonResponse(
        200,
        {
          success: true,
          data: {
            session: { ...SESSION, accessTokenExpiresAt: '2026-08-12T13:00:00.000Z' },
            accessToken: 'atk-2',
          },
          requestId: 'r3',
        },
        { 'set-cookie': 'xh_refresh=rt-secret-2; Path=/api/cloud/v1/auth; HttpOnly' },
      );
    }
    if (href.endsWith('/auth/logout') || href.includes('/devices/')) {
      return jsonResponse(200, { success: true, data: { ok: true }, requestId: 'r4' });
    }
    return jsonResponse(404, { success: false, error: { code: 'INTERNAL_UNKNOWN', message: 'no' } });
  };
}

describe('account IPC core', () => {
  test('login returns access token only and stores refresh in vault', async () => {
    const vault = makeVault(true);
    const core = coreMod.createAccountIpcCore({
      vault,
      cloudOrigin: 'http://127.0.0.1:3000',
      fetchFn: loginFetch(),
    });
    const result = await core.dispatch('account:login', {
      username: 'teacher01',
      password: 'password123',
      deviceLabel: 'Desktop',
      deviceId: 'dev-1',
      rememberMe: true,
    });
    assert.equal(result.success, true);
    assert.equal(result.data.accessToken, 'atk-1');
    assert.equal(result.data.refreshToken, undefined);
    assert.equal(JSON.stringify(result).includes('rt-secret'), false);
    assert.equal(vault.entries.get('acct-1').refreshToken, 'rt-secret-1');
    assert.equal(vault.listAccounts().length, 1);
  });

  test('remember-me refused when vault encryption unavailable; one-shot still works', async () => {
    const vault = makeVault(false);
    const core = coreMod.createAccountIpcCore({
      vault,
      cloudOrigin: 'http://127.0.0.1:3000',
      fetchFn: loginFetch(),
    });
    const remembered = await core.dispatch('account:login', {
      username: 'teacher01',
      password: 'password123',
      deviceLabel: 'Desktop',
      deviceId: 'dev-1',
      rememberMe: true,
    });
    assert.equal(remembered.success, false);
    assert.equal(remembered.error.code, 'AUTH_FEATURE_DISABLED');
    assert.equal(vault.entries.size, 0);

    const oneShot = await core.dispatch('account:login', {
      username: 'teacher01',
      password: 'password123',
      deviceLabel: 'Desktop',
      deviceId: 'dev-1',
      rememberMe: false,
    });
    assert.equal(oneShot.success, true);
    assert.equal(oneShot.data.remembered, false);
    assert.equal(vault.listAccounts().length, 0);
    assert.equal(vault.entries.get('acct-1').persist, false);
  });

  test('schema reject and renderer cloudOrigin are stable IPC errors without stacks', async () => {
    const vault = makeVault(true);
    const core = coreMod.createAccountIpcCore({
      vault,
      cloudOrigin: 'http://127.0.0.1:3000',
      fetchFn: loginFetch(),
    });
    const invalid = await core.dispatch('account:login', { username: 'x' });
    assert.equal(invalid.success, false);
    assert.equal(invalid.error.code, 'IPC_INVALID_PAYLOAD');
    assert.equal(JSON.stringify(invalid).includes('stack'), false);

    const hijack = await core.dispatch('account:login', {
      username: 'teacher01',
      password: 'password123',
      deviceLabel: 'Desktop',
      cloudOrigin: 'https://evil.example',
    });
    assert.equal(hijack.success, false);
    assert.equal(hijack.error.code, 'IPC_DENIED');
  });

  test('logout / remove-card / remote revoke delete local vault creds', async () => {
    const vault = makeVault(true);
    const core = coreMod.createAccountIpcCore({
      vault,
      cloudOrigin: 'http://127.0.0.1:3000',
      fetchFn: loginFetch(),
    });
    await core.dispatch('account:login', {
      username: 'teacher01',
      password: 'password123',
      deviceLabel: 'Desktop',
      deviceId: 'dev-1',
    });
    assert.equal(vault.entries.size, 1);

    const logout = await core.dispatch('account:logout', { accountId: 'acct-1', deviceId: 'dev-1' });
    assert.equal(logout.success, true);
    assert.equal(vault.entries.size, 0);

    await core.dispatch('account:login', {
      username: 'teacher01',
      password: 'password123',
      deviceLabel: 'Desktop',
      deviceId: 'dev-1',
    });
    const removed = await core.dispatch('account:remove-card', { accountId: 'acct-1' });
    assert.equal(removed.success, true);
    assert.equal(vault.entries.size, 0);

    await core.dispatch('account:login', {
      username: 'teacher01',
      password: 'password123',
      deviceLabel: 'Desktop',
      deviceId: 'dev-1',
    });
    const revoked = await core.dispatch('account:revoke-remote', {
      accountId: 'acct-1',
      sessionId: 'sess-1',
    });
    assert.equal(revoked.success, true);
    assert.equal(vault.entries.size, 0);
  });

  test('startup restore refreshes last saved session', async () => {
    const vault = makeVault(true);
    await vault.store({
      accountId: 'acct-1',
      displayName: 'Alice',
      avatarUrl: null,
      refreshToken: 'rt-secret-1',
      deviceId: 'dev-1',
      persist: true,
    });
    const core = coreMod.createAccountIpcCore({
      vault,
      cloudOrigin: 'http://127.0.0.1:3000',
      fetchFn: loginFetch(),
    });
    const restored = await core.restoreLastSession();
    assert.equal(restored.success, true);
    assert.equal(restored.data.restored, true);
    assert.equal(restored.data.accessToken, 'atk-2');
    assert.equal(JSON.stringify(restored).includes('rt-secret'), false);
  });

  test('origin helper used by Main rejects arbitrary senders', () => {
    const { isAllowedIpcSenderOrigin } = require('@xiaohuang/contracts');
    assert.equal(isAllowedIpcSenderOrigin('https://phish.test', ['http://127.0.0.1:7788']), false);
    assert.equal(isAllowedIpcSenderOrigin('http://127.0.0.1:7788', ['http://127.0.0.1:7788']), true);
  });
});
