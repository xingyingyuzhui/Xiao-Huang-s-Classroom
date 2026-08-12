import { describe, expect, it } from 'vitest';
import {
  createFakeClock,
  createFakeDocument,
  createFakeFetch,
  createFakeIndexedDb,
  createFakeStorage,
  createFakeTimers,
  installFakeIndexedDb,
} from '../src/index.js';

describe('fake-timer-raf', () => {
  it('timer 到期执行一次；clear 后不执行', () => {
    const t = createFakeTimers();
    let n = 0;
    const id = t.setTimeout(() => {
      n += 1;
    }, 300);
    t.clearTimeout(id);
    t.runTimers();
    expect(n).toBe(0);
    t.setTimeout(() => {
      n += 1;
    }, 100);
    t.runTimers();
    expect(n).toBe(1);
    expect(t.pendingTimers()).toBe(0);
  });

  it('RAF 手动帧执行；cancel 后不执行', () => {
    const t = createFakeTimers();
    let frames = 0;
    t.requestAnimationFrame(() => {
      frames += 1;
    });
    t.requestAnimationFrame(() => {
      frames += 1;
    });
    const id = t.requestAnimationFrame(() => {
      frames += 1;
    });
    t.cancelAnimationFrame(id);
    t.runFrame();
    expect(frames).toBe(1);
    t.runFrame();
    expect(frames).toBe(2);
    expect(t.pendingFrames()).toBe(0);
  });
});

describe('fake-storage', () => {
  it('读写删与快照', () => {
    const s = createFakeStorage({ a: '1' });
    expect(s.getItem('a')).toBe('1');
    s.setItem('b', '2');
    s.removeItem('a');
    expect(s.snapshot()).toEqual({ b: '2' });
    expect(s.keys()).toEqual(['b']);
    s.clear();
    expect(s.keys()).toEqual([]);
  });
});

describe('fake-clock', () => {
  it('可控推进', () => {
    const c = createFakeClock(100);
    expect(c.now()).toBe(100);
    c.advance(50);
    expect(c.now()).toBe(150);
    c.set(0);
    expect(c.now()).toBe(0);
  });
});

describe('fake-dom', () => {
  it('listener 绑定/解绑与 click 触发', () => {
    const doc = createFakeDocument();
    const btn = doc.register('btn');
    let clicks = 0;
    const fn = () => {
      clicks += 1;
    };
    btn.addEventListener('click', fn);
    btn.click();
    expect(clicks).toBe(1);
    btn.removeEventListener('click', fn);
    btn.click();
    expect(clicks).toBe(1);
    expect(doc.totalListeners()).toBe(0);
  });
});

describe('fake-fetch', () => {
  it('按 URL 路由响应并记录请求', async () => {
    const f = createFakeFetch();
    f.respond(/\/api\/v2\/settings/, () => new Response('{"ok":true}', { status: 200 }));
    const r = await f.fetch('/api/v2/settings');
    expect(r.status).toBe(200);
    expect(f.requests().length).toBe(1);
    const miss = await f.fetch('/nope');
    expect(miss.status).toBe(404);
  });
});

describe('fake-indexeddb', () => {
  it('opens database, creates stores, and persists records across reopen', async () => {
    const { factory, reset } = createFakeIndexedDb();
    const db = await openFakeDb(factory, 1);
    const tx = db.transaction('items', 'readwrite');
    tx.objectStore('items').put({ id: 'a', value: 1 });
    await transactionDone(tx);
    db.close();

    const reopened = await openFakeDb(factory, 1);
    const readTx = reopened.transaction('items', 'readonly');
    const row = await requestResult(readTx.objectStore('items').get('a'));
    await transactionDone(readTx);
    expect(row).toEqual({ id: 'a', value: 1 });
    reopened.close();
    reset();
  });

  it('installs onto globalThis and lists/deletes databases', async () => {
    const { factory } = createFakeIndexedDb();
    expect(factory.cmp(1, 1)).toBe(0);
    expect(factory.cmp(1, 2)).toBe(-1);
    const db = await openFakeDb(factory, 1);
    db.close();
    expect(await factory.databases()).toEqual([{ name: 'test-db', version: 1 }]);
    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase('test-db');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    expect(await factory.databases()).toEqual([]);

    const installed = installFakeIndexedDb();
    expect(globalThis.indexedDB).toBe(installed.factory);
    installed.restore();
    expect(globalThis.indexedDB).not.toBe(installed.factory);
  });
});

async function openFakeDb(factory: IDBFactory, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open('test-db', version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('items')) {
        db.createObjectStore('items', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
