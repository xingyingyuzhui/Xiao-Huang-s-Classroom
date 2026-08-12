/**
 * Secure credential vault backed by Electron safeStorage.
 *
 * Refresh tokens stay in Main. Persisted cards require encryption;
 * one-shot sessions may live in memory only and never hit disk.
 */
import { safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export type VaultAccountMeta = {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  deviceId: string | null;
  lastUsedAt: string;
  persisted: boolean;
};

type VaultEntry = VaultAccountMeta & {
  refreshTokenEncrypted: Buffer | null;
  refreshTokenMemory: string | null;
};

type PersistedFileV1 = {
  version: 1;
  lastUsedAccountId: string | null;
  entries: Array<{
    accountId: string;
    displayName: string;
    avatarUrl: string | null;
    deviceId: string | null;
    lastUsedAt: string;
    refreshTokenEncrypted: string;
  }>;
};

export type StoreCredentialsInput = {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  refreshToken: string;
  deviceId: string | null;
  persist: boolean;
};

export class AuthVault {
  private entries = new Map<string, VaultEntry>();
  private lastUsedAccountId: string | null = null;
  private storagePath: string;

  constructor(userDataPath: string) {
    this.storagePath = path.join(userDataPath, 'auth-vault.json');
    this.load();
  }

  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  async store(input: StoreCredentialsInput): Promise<void> {
    if (input.persist && !this.isAvailable()) {
      throw new Error('CREDENTIAL_STORAGE_UNAVAILABLE');
    }

    const now = new Date().toISOString();
    const existing = this.entries.get(input.accountId);
    const lastUsedAt = now;
    let refreshTokenEncrypted: Buffer | null = null;
    let refreshTokenMemory: string | null = null;

    if (input.persist) {
      refreshTokenEncrypted = safeStorage.encryptString(input.refreshToken);
    } else if (this.isAvailable()) {
      refreshTokenEncrypted = safeStorage.encryptString(input.refreshToken);
    } else {
      refreshTokenMemory = input.refreshToken;
    }

    this.entries.set(input.accountId, {
      accountId: input.accountId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      deviceId: input.deviceId ?? existing?.deviceId ?? null,
      lastUsedAt,
      persisted: input.persist,
      refreshTokenEncrypted,
      refreshTokenMemory,
    });
    this.lastUsedAccountId = input.accountId;
    this.persist();
  }

  async retrieve(accountId: string): Promise<{ refreshToken: string; deviceId: string | null } | null> {
    const entry = this.entries.get(accountId);
    if (!entry) return null;
    try {
      if (entry.refreshTokenMemory) {
        return { refreshToken: entry.refreshTokenMemory, deviceId: entry.deviceId };
      }
      if (!entry.refreshTokenEncrypted) return null;
      const refreshToken = safeStorage.decryptString(entry.refreshTokenEncrypted);
      return { refreshToken, deviceId: entry.deviceId };
    } catch {
      await this.remove(accountId);
      return null;
    }
  }

  async remove(accountId: string): Promise<void> {
    this.entries.delete(accountId);
    if (this.lastUsedAccountId === accountId) {
      const remaining = this.listAccounts();
      this.lastUsedAccountId = remaining[0]?.accountId ?? null;
    }
    this.persist();
  }

  async clearAll(): Promise<void> {
    this.entries.clear();
    this.lastUsedAccountId = null;
    this.persist();
  }

  listAccounts(): VaultAccountMeta[] {
    return [...this.entries.values()]
      .filter((entry) => entry.persisted)
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
      .map(({ accountId, displayName, avatarUrl, deviceId, lastUsedAt, persisted }) => ({
        accountId,
        displayName,
        avatarUrl,
        deviceId,
        lastUsedAt,
        persisted,
      }));
  }

  getLastUsedAccountId(): string | null {
    if (this.lastUsedAccountId && this.entries.has(this.lastUsedAccountId)) {
      return this.lastUsedAccountId;
    }
    return this.listAccounts()[0]?.accountId ?? null;
  }

  private persist(): void {
    const data: PersistedFileV1 = {
      version: 1,
      lastUsedAccountId: this.lastUsedAccountId,
      entries: [...this.entries.values()]
        .filter((entry) => entry.persisted && entry.refreshTokenEncrypted)
        .map((entry) => ({
          accountId: entry.accountId,
          displayName: entry.displayName,
          avatarUrl: entry.avatarUrl,
          deviceId: entry.deviceId,
          lastUsedAt: entry.lastUsedAt,
          refreshTokenEncrypted: entry.refreshTokenEncrypted!.toString('base64'),
        })),
    };
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify(data), 'utf8');
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.storagePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const file = normalizePersisted(parsed);
      this.lastUsedAccountId = file.lastUsedAccountId;
      for (const entry of file.entries) {
        this.entries.set(entry.accountId, {
          accountId: entry.accountId,
          displayName: entry.displayName,
          avatarUrl: entry.avatarUrl,
          deviceId: entry.deviceId,
          lastUsedAt: entry.lastUsedAt,
          persisted: true,
          refreshTokenEncrypted: Buffer.from(entry.refreshTokenEncrypted, 'base64'),
          refreshTokenMemory: null,
        });
      }
    } catch {
      // No vault file yet or corrupted — start fresh
    }
  }
}

function normalizePersisted(raw: unknown): PersistedFileV1 {
  if (Array.isArray(raw)) {
    return {
      version: 1,
      lastUsedAccountId: raw[0]?.accountId ?? null,
      entries: raw.map((entry: Record<string, unknown>) => ({
        accountId: String(entry.accountId ?? ''),
        displayName: String(entry.displayName ?? ''),
        avatarUrl: typeof entry.avatarUrl === 'string' ? entry.avatarUrl : null,
        deviceId: typeof entry.deviceId === 'string' ? entry.deviceId : null,
        lastUsedAt:
          typeof entry.lastUsedAt === 'string' ? entry.lastUsedAt : new Date(0).toISOString(),
        refreshTokenEncrypted: String(entry.refreshTokenEncrypted ?? ''),
      })),
    };
  }
  const obj = raw as PersistedFileV1;
  return {
    version: 1,
    lastUsedAccountId: obj.lastUsedAccountId ?? null,
    entries: Array.isArray(obj.entries) ? obj.entries : [],
  };
}
