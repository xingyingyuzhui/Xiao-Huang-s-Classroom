export type AccountSession = {
  accountId: string;
  displayName: string;
  accessToken: string;
  expiresAt: number;
  avatarUrl: string | null;
};

export type AccountSessionListener = (session: AccountSession | null) => void;

export type AccountSessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const SESSION_STORAGE_KEY = 'xh-account-session';

function readStoredSession(storage: AccountSessionStorage): AccountSession | null {
  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccountSession>;
    if (
      typeof parsed.accountId !== 'string' ||
      typeof parsed.displayName !== 'string' ||
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }
    if (parsed.expiresAt <= Date.now()) {
      storage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return {
      accountId: parsed.accountId,
      displayName: parsed.displayName,
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
      avatarUrl: parsed.avatarUrl ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * In-memory session with optional tab-scoped persistence (sessionStorage).
 * Access tokens must not go into localStorage.
 */
export class AccountSessionController {
  private session: AccountSession | null = null;
  private listeners = new Set<AccountSessionListener>();

  constructor(private readonly storage: AccountSessionStorage | null = null) {
    if (this.storage) {
      this.session = readStoredSession(this.storage);
    }
  }

  getSession(): AccountSession | null {
    return this.session;
  }

  setSession(session: AccountSession): void {
    this.session = session;
    try {
      this.storage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      /* quota / private mode */
    }
    this.notify();
  }

  clearSession(): void {
    this.session = null;
    try {
      this.storage?.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.notify();
  }

  isAuthenticated(): boolean {
    return this.session != null && this.session.expiresAt > Date.now();
  }

  getAccessToken(): string | null {
    if (!this.session) return null;
    if (this.session.expiresAt <= Date.now()) {
      this.clearSession();
      return null;
    }
    return this.session.accessToken;
  }

  subscribe(listener: AccountSessionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.session);
    }
  }
}
