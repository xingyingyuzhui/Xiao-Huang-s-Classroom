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
   * @param {string} accountId
   * @param {string} displayName
   * @param {string|null} avatarUrl
   * @param {string} refreshToken
   */
  async store(accountId, displayName, avatarUrl, refreshToken) {
    if (!this.isAvailable()) {
      throw new Error('safeStorage encryption is not available — refusing to store credentials');
    }
    const refreshTokenEncrypted = Buffer.from(refreshToken, 'utf8');
    this.entries.set(accountId, { accountId, displayName, avatarUrl, refreshTokenEncrypted });
    this._persist();
  }

  /** @param {string} accountId */
  async retrieve(accountId) {
    const entry = this.entries.get(accountId);
    if (!entry) return null;
    return { refreshToken: entry.refreshTokenEncrypted.toString('utf8') };
  }

  /** @param {string} accountId */
  async remove(accountId) {
    this.entries.delete(accountId);
    this._persist();
  }

  listAccounts() {
    return [...this.entries.values()].map(({ accountId, displayName, avatarUrl }) => ({
      accountId,
      displayName,
      avatarUrl,
    }));
  }

  _persist() {
    const data = [...this.entries.values()].map(
      ({ accountId, displayName, avatarUrl, refreshTokenEncrypted }) => ({
        accountId,
        displayName,
        avatarUrl,
        refreshTokenEncrypted: refreshTokenEncrypted.toString('base64'),
      }),
    );
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
          refreshTokenEncrypted: Buffer.from(entry.refreshTokenEncrypted, 'base64'),
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
    await vault.store('acc-1', 'Alice', null, 'rt-secret-123');
    const result = await vault.retrieve('acc-1');
    assert.deepStrictEqual(result, { refreshToken: 'rt-secret-123' });
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
    await vault.store('acc-1', 'Alice', null, 'rt-1');
    await vault.remove('acc-1');
    const result = await vault.retrieve('acc-1');
    assert.strictEqual(result, null);
    assert.strictEqual(vault.listAccounts().length, 0);
  });

  test('listAccounts returns metadata only — no tokens', async () => {
    const dir = tmpDir();
    const vault = new MockAuthVault(dir);
    await vault.store('acc-1', 'Alice', 'https://img/a.png', 'secret-1');
    await vault.store('acc-2', 'Bob', null, 'secret-2');
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
      () => vault.store('acc-1', 'Alice', null, 'secret'),
      /not available/,
    );
    assert.strictEqual(vault.listAccounts().length, 0);
  });

  test('persistence: reload from disk', async () => {
    const dir = tmpDir();
    const vault1 = new MockAuthVault(dir);
    await vault1.store('acc-1', 'Alice', null, 'persisted-secret');

    const vault2 = new MockAuthVault(dir);
    const result = await vault2.retrieve('acc-1');
    assert.deepStrictEqual(result, { refreshToken: 'persisted-secret' });
  });

  test('store overwrites existing entry for same accountId', async () => {
    const dir = tmpDir();
    const vault = new MockAuthVault(dir);
    await vault.store('acc-1', 'Alice', null, 'old-token');
    await vault.store('acc-1', 'Alice Updated', 'https://new-avatar', 'new-token');
    assert.strictEqual(vault.listAccounts().length, 1);
    assert.strictEqual(vault.listAccounts()[0].displayName, 'Alice Updated');
    const result = await vault.retrieve('acc-1');
    assert.deepStrictEqual(result, { refreshToken: 'new-token' });
  });
});
