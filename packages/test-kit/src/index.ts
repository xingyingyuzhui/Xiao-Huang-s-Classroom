/**
 * test-kit 公共入口：显式具名导出（禁止裸 export *，避免歧义导出）。
 */
export { createFakeTimers } from './fake-timer-raf.js';
export type { FakeTimerHandle, FakeRafHandle, FakeTimers } from './fake-timer-raf.js';
export { createFakeStorage } from './fake-storage.js';
export type { FakeStorage } from './fake-storage.js';
export { createFakeClock } from './fake-clock.js';
export type { FakeClock } from './fake-clock.js';
export { makeFakeElement, createFakeDocument } from './fake-dom.js';
export type { FakeElement, FakeDocument } from './fake-dom.js';
export { createFakeFetch } from './fake-fetch.js';
export type { FetchRequest, FakeFetch } from './fake-fetch.js';
export { createFakeIndexedDb, installFakeIndexedDb } from './fake-indexeddb.js';
export type { FakeIndexedDbHandle } from './fake-indexeddb.js';
