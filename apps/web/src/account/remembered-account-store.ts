export type RememberedAccount = {
  accountId: string;
  displayName: string;
  avatarUrl: string | null;
  lastUsedAt: number;
};

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class RememberedAccountStore {
  private static STORAGE_KEY = 'xiaohuang:remembered-accounts';
  private storage: StorageBackend;

  constructor(storage: StorageBackend = localStorage) {
    this.storage = storage;
  }

  list(): RememberedAccount[] {
    const raw = this.storage.getItem(RememberedAccountStore.STORAGE_KEY);
    if (!raw) return [];
    try {
      const accounts = JSON.parse(raw) as RememberedAccount[];
      return accounts.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    } catch {
      return [];
    }
  }

  remember(account: RememberedAccount): void {
    const accounts = this.list().filter(a => a.accountId !== account.accountId);
    accounts.unshift(account);
    this.storage.setItem(
      RememberedAccountStore.STORAGE_KEY,
      JSON.stringify(accounts),
    );
  }

  forget(accountId: string): void {
    const accounts = this.list().filter(a => a.accountId !== accountId);
    this.storage.setItem(
      RememberedAccountStore.STORAGE_KEY,
      JSON.stringify(accounts),
    );
  }

  getLastUsed(): RememberedAccount | null {
    const accounts = this.list();
    return accounts.length > 0 ? accounts[0] : null;
  }
}
