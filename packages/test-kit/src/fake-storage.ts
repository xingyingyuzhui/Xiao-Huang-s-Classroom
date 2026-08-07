/** Fake localStorage：内存实现，支持快照/重置。 */
export interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  keys(): string[];
  snapshot(): Record<string, string>;
}

export function createFakeStorage(initial: Record<string, string> = {}): FakeStorage {
  let data: Record<string, string> = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? (data[key] ?? null) : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    clear() {
      data = {};
    },
    keys() {
      return Object.keys(data);
    },
    snapshot() {
      return { ...data };
    },
  };
}
