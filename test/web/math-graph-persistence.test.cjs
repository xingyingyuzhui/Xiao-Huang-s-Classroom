/** GraphPersistence：debounce、限额、危险键与导入失败保护（fake storage/timer）。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function persistenceModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-persistence.js')).href,
  );
}

async function documentModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document.js')).href,
  );
}

function makeFakeStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function makeFakeTimers() {
  const pending = new Map();
  let seq = 1;
  return {
    setTimeout(fn, ms) {
      const id = seq++;
      pending.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    /** 触发所有到期 timer */
    runAll() {
      for (const [, task] of [...pending]) {
        pending.delete([...pending.keys()].find((k) => pending.get(k) === task));
        task.fn();
      }
    },
    count() {
      return pending.size;
    },
  };
}

function defaultDoc(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [{ id: 'f1', name: '', kind: 'preset', preset: 'quadratic', expr: '', coeffs: { a: 1, b: 0, c: 0 }, color: '#111', visible: true, locked: false, domain: { mode: 'viewport' } }],
    points: [],
    constructions: [],
    view: { boundingBox: [-8, 8, 8, -8], axes: {} },
    presentation: { activeFunctionId: 'f1', compare: null },
    annotations: { version: 1, strokes: [] },
    meta: { createdAt: '', updatedAt: '' },
    ...overrides,
  };
}

async function makePersistence(overrides = {}) {
  const { createGraphPersistence, GRAPH_STORAGE_KEY } = await persistenceModule();
  const storage = overrides.storage || makeFakeStorage();
  const timers = overrides.timers || makeFakeTimers();
  const now = overrides.now || (() => '2026-08-02T00:00:00.000Z');
  const persistence = createGraphPersistence({
    storage,
    key: overrides.key || GRAPH_STORAGE_KEY,
    wait: overrides.wait ?? 300,
    now,
    setTimeout: overrides.setTimeout,
    clearTimeout: overrides.clearTimeout,
  });
  return { persistence, storage, timers };
}

test('multiple changes within debounce write only once', async () => {
  const { createGraphPersistence, GRAPH_STORAGE_KEY } = await persistenceModule();
  const storage = makeFakeStorage();
  let writes = 0;
  const timers = makeFakeTimers();
  const persistence = createGraphPersistence({
    storage: {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        writes += 1;
        storage.setItem(k, v);
      },
      removeItem: (k) => storage.removeItem(k),
    },
    key: GRAPH_STORAGE_KEY,
    wait: 300,
    now: () => 't0',
    setTimeout: (fn) => timers.setTimeout(fn, 300),
    clearTimeout: (id) => timers.clearTimeout(id),
  });
  persistence.scheduleSave(defaultDoc());
  persistence.scheduleSave(defaultDoc({ functions: [{ id: 'f9', kind: 'custom', expr: 'x', color: '#222' }] }));
  persistence.scheduleSave(defaultDoc({ functions: [{ id: 'f9', kind: 'custom', expr: 'x^2', color: '#222' }] }));
  assert.equal(writes, 0, 'no write before debounce elapses');
  timers.runAll();
  assert.equal(writes, 1, 'three changes within debounce must produce one write');
  const stored = JSON.parse(storage.map.get(GRAPH_STORAGE_KEY));
  assert.equal(stored.functions[0].expr, 'x^2');
});

test('storage key is pinned', async () => {
  const { GRAPH_STORAGE_KEY } = await persistenceModule();
  assert.equal(GRAPH_STORAGE_KEY, 'xiaohuang:math:graph-document:v1');
});

test('quota errors degrade to memory state without crashing', async () => {
  const { createGraphPersistence, GRAPH_STORAGE_KEY } = await persistenceModule();
  const timers = makeFakeTimers();
  const persistence = createGraphPersistence({
    storage: {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => {},
    },
    key: GRAPH_STORAGE_KEY,
    wait: 0,
    now: () => 't',
    setTimeout: (fn) => timers.setTimeout(fn, 0),
    clearTimeout: (id) => timers.clearTimeout(id),
  });
  persistence.scheduleSave(defaultDoc());
  const status = persistence.flush();
  assert.equal(status.ok, false);
  assert.equal(status.code, 'STORAGE_UNAVAILABLE');
});

test('load parses, migrates and normalizes stored documents', async () => {
  const { persistence, storage } = await makePersistence();
  storage.map.set(
    'xiaohuang:math:graph-document:v1',
    JSON.stringify({
      schemaVersion: 1,
      id: 'stored',
      title: 't',
      functions: [{ id: 'f1', kind: 'preset', preset: 'linear', coeffs: { a: 3, b: 0, c: 0 }, curve: { x: 1 } }],
      points: [],
      constructions: [],
      view: { boundingBox: [-8, 8, 8, -8] },
      presentation: { activeFunctionId: 'f1' },
      annotations: { version: 1, strokes: [] },
      meta: { createdAt: '', updatedAt: '' },
    }),
  );
  const result = persistence.load();
  assert.equal(result.ok, true);
  assert.equal(result.document.id, 'stored');
  assert.equal('curve' in result.document.functions[0], false, 'runtime fields must be stripped');
});

test('load falls back to default document on parse errors but reports the error', async () => {
  const { persistence, storage } = await makePersistence();
  storage.map.set('xiaohuang:math:graph-document:v1', '{broken json');
  const result = persistence.load();
  assert.equal(result.ok, false);
  assert.equal(result.document.schemaVersion, 1, 'fallback document is usable');
  assert.equal(result.error.code, 'INVALID_DOCUMENT');
});

test('import rejects dangerous prototype keys', async () => {
  const { persistence } = await makePersistence();
  // 用原始 JSON 构造 __proto__ 自有键（对象字面量 __proto__ 会改原型，不会成为键）
  const raw = '{"schemaVersion":1,"id":"d","title":"t","functions":[{"id":"f1","kind":"preset","preset":"quadratic","__proto__":{"polluted":true}}],"points":[],"constructions":[],"view":{},"presentation":{},"annotations":{},"meta":{}}';
  const bad = persistence.importJson(raw);
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'INVALID_DOCUMENT');
});

test('import enforces object and size limits', async () => {
  const { persistence } = await makePersistence();
  const many = persistence.importJson(JSON.stringify({
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: Array.from({ length: 51 }, (_, i) => ({ id: `f${i}`, kind: 'preset', preset: 'quadratic' })),
    points: [],
    constructions: [],
    view: {},
    presentation: {},
    annotations: {},
    meta: {},
  }));
  assert.equal(many.ok, false);
  assert.equal(many.code, 'DOCUMENT_TOO_LARGE');

  const tooBig = persistence.importJson(`{"x":"${'a'.repeat(1024 * 1024 + 1)}"}`);
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.code, 'DOCUMENT_TOO_LARGE');
});

test('import rejects unknown versions and invalid expressions without touching state', async () => {
  const { persistence } = await makePersistence();
  const tooNew = persistence.importJson(JSON.stringify({ schemaVersion: 99, functions: [] }));
  assert.equal(tooNew.ok, false);
  assert.equal(tooNew.code, 'UNSUPPORTED_VERSION');

  const badExpr = persistence.importJson(JSON.stringify({
    schemaVersion: 1,
    id: 'd',
    title: 't',
    functions: [{ id: 'f1', kind: 'custom', expr: 'x + (' }],
    points: [],
    constructions: [],
    view: {},
    presentation: {},
    annotations: {},
    meta: {},
  }));
  assert.equal(badExpr.ok, false);
  assert.equal(badExpr.code, 'INVALID_EXPRESSION');
});

test('import round-trips a full document including annotations', async () => {
  const { persistence } = await makePersistence();
  const doc = defaultDoc({
    points: [{ id: 'p1', name: 'A', x: 1, y: 2, constraint: { kind: 'free' }, showCoords: true, locked: false, style: { stroke: { explicitColor: '#ff0000' }, fill: { explicitColor: null, opacity: 1 }, size: 3, face: 'o', label: { explicitColor: null, opacity: 1, fontSize: 13 } } }],
    annotations: { version: 1, strokes: [{ id: 's1', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], colorSlot: null, explicitColor: '#333', width: 3, opacity: 1 }] },
  });
  const json = persistence.exportJson(doc);
  const imported = persistence.importJson(json);
  assert.equal(imported.ok, true, imported.message);
  assert.equal(imported.document.points[0].constraint.kind, 'free');
  assert.equal(imported.document.annotations.strokes.length, 1);
  assert.equal('el' in imported.document.points[0], false);
  assert.equal('curve' in imported.document.functions[0], false, 'exports must not contain runtime fields');
});

test('flush writes pending saves; dispose flushes', async () => {
  const { persistence, storage, timers } = await makePersistence();
  persistence.scheduleSave(defaultDoc());
  assert.equal(storage.map.size, 0);
  const status = persistence.flush();
  assert.equal(status.ok, true);
  assert.equal(storage.map.size, 1);
  persistence.scheduleSave(defaultDoc({ title: 'two' }));
  persistence.dispose();
  assert.equal(storage.map.size, 1, 'dispose flushes the pending save (one key)');
  const stored = JSON.parse(storage.map.get('xiaohuang:math:graph-document:v1'));
  assert.equal(stored.title, 'two');
  assert.equal(timers.count(), 0);
});

test('clear removes the storage key', async () => {
  const { persistence, storage } = await makePersistence();
  storage.map.set('xiaohuang:math:graph-document:v1', '{}');
  persistence.clear();
  assert.equal(storage.map.size, 0);
});
