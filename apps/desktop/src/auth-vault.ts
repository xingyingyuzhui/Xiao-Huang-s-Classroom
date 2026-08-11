/**
 * Secure credential vault backed by Electron safeStorage.
 *
 * Refresh tokens are encrypted in memory and on disk; the renderer
 * process never receives them — only short-lived access tokens.
 */
import { safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export type VaultEntry = {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  refreshTokenEncrypted: Buffer;
};

type PersistedEntry = {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  refreshTokenEncrypted: string; // base64
};

export class AuthVault {
  private entries = new Map<string, VaultEntry>();
  private storagePath: string;

  constructor(userDataPath: string) {
    this.storagePath = path.join(userDataPath, 'auth-vault.json');
    this.load();
  }

  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  async store(
    accountId: string,
    displayName: string,
    avatarUrl: string | null,
    refreshToken: string,
  ): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('safeStorage encryption is not available — refusing to store credentials');
    }
    const refreshTokenEncrypted = safeStorage.encryptString(refreshToken);
    this.entries.set(accountId, { accountId, displayName, avatarUrl, refreshTokenEncrypted });
    this.persist();
  }

  async retrieve(accountId: string): Promise<{ refreshToken: string } | null> {
    const entry = this.entries.get(accountId);
    if (!entry) return null;
    const refreshToken = safeStorage.decryptString(entry.refreshTokenEncrypted);
    return { refreshToken };
  }

  async remove(accountId: string): Promise<void> {
    this.entries.delete(accountId);
    this.persist();
  }

  listAccounts(): Array<{ accountId: string; displayName: string; avatarUrl: string | null }> {
    return [...this.entries.values()].map(({ accountId, displayName, avatarUrl }) => ({
      accountId,
      displayName,
      avatarUrl,
    }));
  }

  private persist(): void {
    const data: PersistedEntry[] = [...this.entries.values()].map(
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

  private load(): void {
    try {
      const raw = fs.readFileSync(this.storagePath, 'utf8');
      const data: PersistedEntry[] = JSON.parse(raw);
      for (const entry of data) {
        this.entries.set(entry.accountId, {
          ...entry,
          refreshTokenEncrypted: Buffer.from(entry.refreshTokenEncrypted, 'base64'),
        });
      }
    } catch {
      // No vault file yet or corrupted — start fresh
    }
  }
}
