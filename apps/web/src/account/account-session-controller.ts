export type AccountSession = {
  accountId: string;
  displayName: string;
  accessToken: string;
  expiresAt: number;
  avatarUrl: string | null;
};

export type AccountSessionListener = (session: AccountSession | null) => void;

export class AccountSessionController {
  private session: AccountSession | null = null;
  private listeners = new Set<AccountSessionListener>();

  getSession(): AccountSession | null {
    return this.session;
  }

  setSession(session: AccountSession): void {
    this.session = session;
    this.notify();
  }

  clearSession(): void {
    this.session = null;
    this.notify();
  }

  isAuthenticated(): boolean {
    return this.session != null && this.session.expiresAt > Date.now();
  }

  getAccessToken(): string | null {
    if (!this.session) return null;
    if (this.session.expiresAt <= Date.now()) return null;
    return this.session.accessToken;
  }

  subscribe(listener: AccountSessionListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.session);
    }
  }
}
