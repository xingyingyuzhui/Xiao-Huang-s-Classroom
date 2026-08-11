/**
 * Minimal in-memory IndexedDB for node tests.
 * Exposes an IDBFactory-compatible surface without full DOM typing.
 */

type StoreMode = 'readonly' | 'readwrite' | 'versionchange';

interface StoreSchema {
  keyPath: string;
  indexes: Map<string, string>;
}

interface DbRecord {
  version: number;
  stores: Map<string, Map<IDBValidKey, unknown>>;
  schemas: Map<string, StoreSchema>;
}

type DatabaseRegistry = Map<string, DbRecord>;

function extractKey(value: unknown, keyPath: string): IDBValidKey {
  if (!value || typeof value !== 'object') {
    throw new DOMException('Invalid record for keyPath', 'DataError');
  }
  const key = (value as Record<string, unknown>)[keyPath];
  if (key === undefined || key === null) {
    throw new DOMException(`Missing keyPath ${keyPath}`, 'DataError');
  }
  return key as IDBValidKey;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

class FakeRequest<T> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: ((this: FakeRequest<T>, ev: Event) => void) | null = null;
  onerror: ((this: FakeRequest<T>, ev: Event) => void) | null = null;

  constructor(
    private readonly tx: FakeTransaction,
    private readonly run: () => T,
  ) {
    setTimeout(() => this.execute(), 0);
  }

  private execute(): void {
    if (this.tx.isDone()) return;
    try {
      this.result = this.run();
      this.tx.trackRequest();
      this.onsuccess?.call(this, new Event('success'));
    } catch (error) {
      this.tx.abort(error);
    }
  }
}

class FakeIndex {
  constructor(
    readonly name: string,
    private readonly keyPath: string,
    private readonly store: FakeObjectStore,
  ) {}

  getAll(query?: IDBValidKey | IDBKeyRange | null): FakeRequest<unknown[]> {
    return this.store.getAllByIndex(this.name, this.keyPath, query);
  }
}

class FakeObjectStore {
  readonly name: string;
  keyPath: string | string[] | null;
  transaction: FakeTransaction;

  constructor(
    name: string,
    private readonly schema: StoreSchema,
    tx: FakeTransaction,
    private readonly data: Map<IDBValidKey, unknown>,
  ) {
    this.name = name;
    this.keyPath = schema.keyPath;
    this.transaction = tx;
  }

  clear(): FakeRequest<undefined> {
    return new FakeRequest(this.transaction, () => {
      this.data.clear();
      return undefined;
    });
  }

  count(): FakeRequest<number> {
    return new FakeRequest(this.transaction, () => this.data.size);
  }

  createIndex(name: string, keyPath: string | string[]): FakeIndex {
    if (this.transaction.mode !== 'versionchange') {
      throw new DOMException('createIndex only allowed during upgrade', 'InvalidStateError');
    }
    const path = Array.isArray(keyPath) ? keyPath.join('.') : keyPath;
    this.schema.indexes.set(name, path);
    return new FakeIndex(name, path, this);
  }

  delete(key: IDBValidKey): FakeRequest<undefined> {
    return new FakeRequest(this.transaction, () => {
      this.data.delete(key);
      return undefined;
    });
  }

  get(key: IDBValidKey): FakeRequest<unknown> {
    return new FakeRequest(this.transaction, () => {
      const value = this.data.get(key);
      return value === undefined ? undefined : clone(value);
    });
  }

  getAll(query?: IDBValidKey | IDBKeyRange | null): FakeRequest<unknown[]> {
    return this.getAllByIndex(null, null, query);
  }

  getAllByIndex(
    _indexName: string | null,
    indexKeyPath: string | null,
    query?: IDBValidKey | IDBKeyRange | null,
  ): FakeRequest<unknown[]> {
    return new FakeRequest(this.transaction, () => {
      let values = [...this.data.values()].map((value) => clone(value));
      if (indexKeyPath) {
        values = values.filter((value) => {
          const indexed = (value as Record<string, unknown>)[indexKeyPath];
          if (query === undefined || query === null) return true;
          return indexed === query;
        });
      }
      return values;
    });
  }

  index(name: string): FakeIndex {
    const keyPath = this.schema.indexes.get(name);
    if (!keyPath) {
      throw new DOMException(`Index ${name} not found`, 'NotFoundError');
    }
    return new FakeIndex(name, keyPath, this);
  }

  put(value: unknown, key?: IDBValidKey): FakeRequest<IDBValidKey> {
    return new FakeRequest(this.transaction, () => {
      const recordKey =
        key ??
        (typeof this.keyPath === 'string'
          ? extractKey(value, this.keyPath)
          : (() => {
              throw new DOMException('Composite keyPath not supported', 'DataError');
            })());
      this.data.set(recordKey, clone(value));
      return recordKey;
    });
  }
}

class FakeTransaction {
  readonly db: FakeDatabase;
  readonly mode: StoreMode;
  readonly objectStoreNames: string[];
  onabort: ((this: FakeTransaction, ev: Event) => void) | null = null;
  oncomplete: ((this: FakeTransaction, ev: Event) => void) | null = null;
  onerror: ((this: FakeTransaction, ev: Event) => void) | null = null;

  private readonly record: DbRecord;
  private pendingRequests = 0;
  private completedRequests = 0;
  private done = false;
  private aborted = false;

  constructor(db: FakeDatabase, storeNames: string[], mode: StoreMode, record: DbRecord) {
    this.db = db;
    this.objectStoreNames = storeNames;
    this.mode = mode;
    this.record = record;
  }

  isDone(): boolean {
    return this.done || this.aborted;
  }

  getStoreSchema(name: string): StoreSchema {
    const schema = this.record.schemas.get(name);
    if (!schema) {
      throw new DOMException(`Store ${name} not found`, 'NotFoundError');
    }
    return schema;
  }

  trackRequest(): void {
    this.pendingRequests += 1;
    this.completedRequests += 1;
    setTimeout(() => this.maybeComplete(), 0);
  }

  objectStore(name: string): FakeObjectStore {
    if (!this.objectStoreNames.includes(name)) {
      throw new DOMException(`Store ${name} not in transaction`, 'NotFoundError');
    }
    const schema = this.getStoreSchema(name);
    const data = this.record.stores.get(name);
    if (!data) {
      throw new DOMException(`Store ${name} not found`, 'NotFoundError');
    }
    return new FakeObjectStore(name, schema, this, data);
  }

  abort(reason?: unknown): void {
    if (this.done) return;
    this.aborted = true;
    this.done = true;
    this.onabort?.call(this, new Event('abort'));
    if (reason instanceof Error) {
      this.onerror?.call(this, new Event('error'));
    }
  }

  commit(): void {
    if (this.done) return;
    this.done = true;
    this.oncomplete?.call(this, new Event('complete'));
  }

  private maybeComplete(): void {
    if (this.done || this.aborted) return;
    if (this.completedRequests >= this.pendingRequests && this.pendingRequests > 0) {
      this.commit();
    }
  }
}

class FakeDatabase {
  readonly name: string;
  version: number;
  readonly objectStoreNames: DOMStringList;

  constructor(
    name: string,
    private readonly record: DbRecord,
  ) {
    this.name = name;
    this.version = record.version;
    const names = [...record.schemas.keys()];
    this.objectStoreNames = {
      length: names.length,
      contains: (value: string) => record.schemas.has(value),
      item: (index: number) => names[index] ?? null,
      [Symbol.iterator]: function* () {
        yield* names;
      },
    } as DOMStringList;
  }

  close(): void {
    /* noop */
  }

  createObjectStore(name: string, options?: IDBObjectStoreParameters): FakeObjectStore {
    if (this.record.schemas.has(name)) {
      throw new DOMException(`Store ${name} already exists`, 'ConstraintError');
    }
    const keyPath = typeof options?.keyPath === 'string' ? options.keyPath : null;
    if (!keyPath) {
      throw new DOMException('Fake IndexedDB requires string keyPath', 'DataError');
    }
    const schema: StoreSchema = { keyPath, indexes: new Map() };
    this.record.schemas.set(name, schema);
    this.record.stores.set(name, new Map());
    const tx = new FakeTransaction(this, [name], 'versionchange', this.record);
    return new FakeObjectStore(name, schema, tx, this.record.stores.get(name)!);
  }

  deleteObjectStore(name: string): void {
    this.record.schemas.delete(name);
    this.record.stores.delete(name);
  }

  transaction(storeNames: string | string[], mode: StoreMode = 'readonly'): FakeTransaction {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return new FakeTransaction(this, names, mode, this.record);
  }
}

class FakeOpenRequest {
  result: FakeDatabase | null = null;
  error: DOMException | null = null;
  onblocked: ((this: FakeOpenRequest, ev: Event) => void) | null = null;
  onerror: ((this: FakeOpenRequest, ev: Event) => void) | null = null;
  onsuccess: ((this: FakeOpenRequest, ev: Event) => void) | null = null;
  onupgradeneeded: ((this: FakeOpenRequest, ev: IDBVersionChangeEvent) => void) | null = null;

  constructor(
    private readonly databases: DatabaseRegistry,
    private readonly name: string,
    private readonly version: number,
  ) {
    setTimeout(() => this.run(), 0);
  }

  private run(): void {
    let record = this.databases.get(this.name);
    if (!record) {
      record = {
        version: 0,
        stores: new Map(),
        schemas: new Map(),
      };
      this.databases.set(this.name, record);
    }

    const oldVersion = record.version;
    if (oldVersion > this.version) {
      this.onerror?.call(this, new Event('error'));
      return;
    }

    if (oldVersion < this.version) {
      const db = new FakeDatabase(this.name, record);
      this.result = db;
      const event = {
        oldVersion,
        newVersion: this.version,
      } as IDBVersionChangeEvent;
      this.onupgradeneeded?.call(this, event);
      record.version = this.version;
      db.version = this.version;
    }

    if (!this.result) {
      this.result = new FakeDatabase(this.name, record);
    }
    this.onsuccess?.call(this, new Event('success'));
  }
}

class FakeDeleteRequest {
  result: undefined;
  error: DOMException | null = null;
  onblocked: ((this: FakeDeleteRequest, ev: Event) => void) | null = null;
  onerror: ((this: FakeDeleteRequest, ev: Event) => void) | null = null;
  onsuccess: ((this: FakeDeleteRequest, ev: Event) => void) | null = null;
  onupgradeneeded: ((this: FakeDeleteRequest, ev: IDBVersionChangeEvent) => void) | null = null;

  constructor(private readonly databases: DatabaseRegistry, private readonly name: string) {
    setTimeout(() => {
      this.databases.delete(this.name);
      this.onsuccess?.call(this, new Event('success'));
    }, 0);
  }
}

class FakeFactory {
  private readonly registry: DatabaseRegistry = new Map();

  cmp(first: unknown, second: unknown): number {
    if (first === second) return 0;
    return (first as number) < (second as number) ? -1 : 1;
  }

  databases(): Promise<Array<{ name?: string; version?: number }>> {
    return Promise.resolve(
      [...this.registry.entries()].map(([name, record]) => ({
        name,
        version: record.version,
      })),
    );
  }

  deleteDatabase(name: string): FakeDeleteRequest {
    return new FakeDeleteRequest(this.registry, name);
  }

  open(name: string, version?: number): FakeOpenRequest {
    return new FakeOpenRequest(this.registry, name, version ?? 1);
  }

  clear(): void {
    this.registry.clear();
  }
}

export interface FakeIndexedDbHandle {
  factory: IDBFactory;
  reset(): void;
}

/** Create an isolated in-memory IndexedDB factory for tests. */
export function createFakeIndexedDb(): FakeIndexedDbHandle {
  const factory = new FakeFactory();

  return {
    factory: factory as unknown as IDBFactory,
    reset() {
      factory.clear();
    },
  };
}

/** Install fake IndexedDB on globalThis; returns restore(). */
export function installFakeIndexedDb(): { factory: IDBFactory; restore(): void } {
  const previous = globalThis.indexedDB;
  const handle = createFakeIndexedDb();
  globalThis.indexedDB = handle.factory;
  return {
    factory: handle.factory,
    restore() {
      if (previous === undefined) {
        delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
      } else {
        globalThis.indexedDB = previous;
      }
      handle.reset();
    },
  };
}

export type FakeIndexedDbFactory = FakeFactory;
