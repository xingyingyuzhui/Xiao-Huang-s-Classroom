export type NetworkStatusListener = (online: boolean) => void;

export class NetworkMonitor {
  private online: boolean;
  private listeners = new Set<NetworkStatusListener>();

  constructor() {
    this.online = typeof navigator !== 'undefined' && navigator.onLine !== undefined
      ? navigator.onLine
      : true;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.setOnline(true));
      window.addEventListener('offline', () => this.setOnline(false));
    }
  }

  isOnline(): boolean { return this.online; }

  subscribe(listener: NetworkStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    for (const listener of this.listeners) listener(online);
  }

  dispose(): void {
    this.listeners.clear();
  }
}
