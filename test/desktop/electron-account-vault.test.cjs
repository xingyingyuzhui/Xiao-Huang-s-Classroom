// @ts-check
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

/**
 * AuthVault uses Electron's safeStorage which isn't available in plain Node.
 * We test the data-structure / serialization logic by shimming the electron
 * module before requiring the compiled vault (or by reimplementing the
 * testable core here with identity encrypt/decrypt).
 */

class MockAuthVault {
  /** @type {Map<string, {accountId:string, displayName:string, avatarUrl:string|null, refreshTokenEncrypted:Buffer}>} */
  entries = new Map();
  storagePath;
  encryptionAvailable;

  /**
   * @param {string} userDataPath
   * @param {boolean} [encryptionAvailable]
   */
  constructor(userDataPath, encryptionAvailable = true) {
    this.storagePath = path.join(userDataPath, 'auth-vault.json');
    this.encryptionAvailable = encryptionAvailable;
    this._load();
  }

  isAvailable() {
    return this.encryptionAvailable;
  }

  /**
   * @param {{
   *   accountId: string,
   *   displayName: string,
   *   avatarUrl: string|null,
   *   refreshToken: string,
   *   deviceId?: string|null,
   *   persist: boolean,
   * }} input
   */
  async store(input) {
    if (input.persist && !this.isAvailable()) {
      throw new Error('CREDENTIAL_STORAGE_UNAVAILABLE');
    }
    const refreshTokenEncrypted = Buffer.from(input.refreshToken, 'utf8');
    this.entries.set(input.accountId, {
      accountId: input.accountId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      deviceId: input.deviceId ?? null,
      lastUsedAt: new Date().toISOString(),
      persisted: input.persist,
      refreshTokenEncrypted: input.persist || this.isAvailable() ? refreshTokenEncrypted : null,
      refreshTokenMemory: input.persist || this.isAvailable() ? null : input.refreshToken,
    });
    if (input.persist) this._persist();
  }

  /** @param {string} accountId */
  async retrieve(accountId) {
    const entry = this.entries.get(accountId);
    if (!entry) return null;
    if (entry.refreshTokenMemory) {
      return { refreshToken: entry.refreshTokenMemory, deviceId: entry.deviceId ?? null };
    }
    if (!entry.refreshTokenEncrypted) return null;
    return {
      refreshToken: entry.refreshTokenEncrypted.toString('utf8'),
      deviceId: entry.deviceId ?? null,
    };
  }

  /** @param {string} accountId */
  async remove(accountId) {
    this.entries.delete(accountId);
    this._persist();
  }

  listAccounts() {
    return [...this.entries.values()]
      .filter((entry) => entry.persisted)
      .map(({ accountId, displayName, avatarUrl }) => ({
        accountId,
        displayName,
        avatarUrl,
      }));
  }

  _persist() {
    const data = [...this.entries.values()]
      .filter((entry) => entry.persisted && entry.refreshTokenEncrypted)
      .map(({ accountId, displayName, avatarUrl, refreshTokenEncrypted }) => ({
        accountId,
        displayName,
        avatarUrl,
        refreshTokenEncrypted: refreshTokenEncrypted.toString('base64'),
      }));
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify(data), 'utf8');
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.storagePath, 'utf8');
      const data = JSON.parse(raw);
      for (const entry of data) {
        this.entries.set(entry.accountId, {
          ...entry,
          persisted: true,
          refreshTokenEncrypted: Buffer.from(entry.refreshTokenEncrypted, 'base64'),
          refreshTokenMemory: null,
        });
      }
    } catch {
      // fresh start
    }
  }
}

describe('AuthVault (mock)', () => {
  /** @returns {string} */
  function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
  }

  test('store and retrieve round-trip', async () => {
    const dir = tmpDir();
    const vault = new MockAuthVault(dir);
    await vault.store({
      accountId: 'acc-1',
      displayName: 'Alice',
      avatarUrl: null,
      refreshToken: 'rt-secret-123',
      persist: true,
    });
    const result = await vault.retrieve('acc-1');
    assert.deepStrictEqual(result, { refreshToken: 'rt-secret-123', deviceId: null });
  });

  test('retrieve returns null for unknown account', async () => {
    const dir = tmpDir();
    const vault = new MockAuthVault(dir);
    const result = await vault.retrieve('nonexistent');
    assert.strictEqual(result, null);
  });

  test('remove entry', async () => {
    const dir = tmpDir();
    const vault = new MockAuthVault(dir);
    await vault.store({
      accountId: 'acc-1',
      displayName: 'Alice',
      avatarUrl: null,
      refreshToken: 'rt-1',
      persist: true,
    });
    await vault.remove('acc-1');
    const result = await vault.retrieve('acc-1');
    assert.strictEqual(result, null);
    assert.strictEqual(vault.listAccounts().length, 0);
  });

  test('listAccounts returns metadata only — no tokens', async () => {
    const dir = tmpDir();
    const vault = new MockAuthVault(dir);
    await vault.store({
      accountId: 'acc-1',
      displayName: 'Alice',
      avatarUrl: 'https://img/a.png',
      refreshToken: 'secret-1',
      persist: true,
    });
    await vault.store({
      accountId: 'acc-2',
      displayName: 'Bob',
      avatarUrl: null,
      refreshToken: 'secret-2',
      persist: true,
    });
    const list = vault.listAccounts();
    assert.strictEqual(list.length, 2);
    for (const entry of list) {
      assert.ok('accountId' in entry);
      assert.ok('displayName' in entry);
      assert.ok('avatarUrl' in entry);
      assert.ok(!('refreshToken' in entry), 'must not expose refreshToken');
      assert.ok(!('refreshTokenEncrypted' in entry), 'must not expose encrypted token');
    }
  });

  test('refuse to store when encryption unavailable', async () => {
    const dir = tmpDir();
    const vault = new MockAuthVault(dir, false);
    await assert.rejects(
      () =>
        vault.store({
          accountId: 'acc-1',
          displayName: 'Alice',
          avatarUrl: null,
          refreshToken: 'secret',
          persist: true,
        }),
      /CREDENTIAL_STORAGE_UNAVAILABLE/,
    );
    assert.strictEqual(vault.listAccounts().length, 0);
  });

  test('persistence: reload from disk', async () => {
    const dir = tmpDir();
    const vault1 = new MockAuthVault(dir);
    await vault1.store({
      accountId: 'acc-1',
      displayName: 'Alice',
      avatarUrl: null,
      refreshToken: 'persisted-secret',
      persist: true,
    });

    const vault2 = new MockAuthVault(dir);
    const result = await vault2.retrieve('acc-1');
    assert.deepStrictEqual(result, { refreshToken: 'persisted-secret', deviceId: null });
  });

  test('store overwrites existing entry for same accountId', async () => {
    const dir = tmpDir();
    const vault = new MockAuthVault(dir);
    await vault.store({
      accountId: 'acc-1',
      displayName: 'Alice',
      avatarUrl: null,
      refreshToken: 'old-token',
      persist: true,
    });
    await vault.store({
      accountId: 'acc-1',
      displayName: 'Alice Updated',
      avatarUrl: 'https://new-avatar',
      refreshToken: 'new-token',
      persist: true,
    });
    assert.strictEqual(vault.listAccounts().length, 1);
    assert.strictEqual(vault.listAccounts()[0].displayName, 'Alice Updated');
    const result = await vault.retrieve('acc-1');
    assert.deepStrictEqual(result, { refreshToken: 'new-token', deviceId: null });
  });

  test('one-shot login is memory-only and omitted from remembered cards', async () => {
    const dir = tmpDir();
    const vault = new MockAuthVault(dir, false);
    await vault.store({
      accountId: 'acc-1',
      displayName: 'Alice',
      avatarUrl: null,
      refreshToken: 'ephemeral-secret',
      persist: false,
    });
    assert.strictEqual(vault.listAccounts().length, 0);
    const result = await vault.retrieve('acc-1');
    assert.deepStrictEqual(result, { refreshToken: 'ephemeral-secret', deviceId: null });
    assert.equal(fs.existsSync(path.join(dir, 'auth-vault.json')), false);
  });
});
