/** GraphHistory：有界、可合并、排除批注的撤销/重做历史。 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function historyModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-history.js')).href,
  );
}

async function storeModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-store.js')).href,
  );
}

async function documentModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-document.js')).href,
  );
}

function richDocument() {
  return {
    schemaVersion: 2,
    id: 'd',
    title: 't',
    functions: [
      { id: 'f1', name: '', kind: 'preset', preset: 'quadratic', expr: '', coeffs: { a: 1, b: 0, c: 0 }, color: '#111', visible: true, locked: false, domain: { mode: 'viewport' } },
      { id: 'f2', name: '', kind: 'preset', preset: 'linear', expr: '', coeffs: { a: 2, b: 0, c: 0 }, color: '#222', visible: true, locked: false, domain: { mode: 'viewport' } },
    ],
    points: [{ id: 'p1', name: 'A', x: 1, y: 2, showCoords: true, locked: false }],
    constructions: [{ id: 'c1', kind: 'segment', pointIds: ['p1', 'p2'], locked: false, visible: true, extend: false }],
    view: { boundingBox: [-8, 8, 8, -8], axes: {} },
    presentation: { activeFunctionId: 'f1', compare: null },
    annotations: { version: 1, strokes: [{ id: 's1', points: [{ x: 0, y: 0 }] }] },
    meta: { createdAt: '', updatedAt: '' },
  };
}

async function makeHistory(limit) {
  const { createGraphStore } = await storeModule();
  const { createGraphHistory } = await historyModule();
  const store = createGraphStore(richDocument());
  const history = createGraphHistory(store, limit == null ? {} : { limit });
  return { store, history };
}

test('dispatch makes undo available and undo restores the structural document', async () => {
  const { store, history } = await makeHistory();
  assert.equal(history.canUndo(), false);
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  assert.equal(history.canUndo(), true);
  assert.equal(history.canRedo(), false);

  history.undo();
  const doc = store.getDocument();
  assert.equal(doc.functions[0].visible, true);
  assert.equal(doc.functions[1].visible, true);
  assert.equal(doc.points.length, 1);
  assert.equal(history.canRedo(), true);
});

test('undo keeps the annotations written after the action', async () => {
  const { store, history } = await makeHistory();
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  // 之后写了批注：结构历史不包含批注，undo 必须保留批注
  store.dispatch({
    type: 'annotations/replace',
    payload: { annotations: { version: 1, strokes: [{ id: 's9', points: [{ x: 1, y: 1 }] }] } },
    meta: { record: false, persist: true },
  });
  history.undo();
  const doc = store.getDocument();
  assert.equal(doc.functions[0].visible, true);
  assert.equal(doc.annotations.strokes[0].id, 's9', 'undo must not roll back annotations');
});

test('undo/redo preserves schemaVersion, id, and title', async () => {
  const { store, history } = await makeHistory();
  assert.equal(store.getDocument().schemaVersion, 2);
  assert.equal(store.getDocument().id, 'd');
  assert.equal(store.getDocument().title, 't');
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  history.undo();
  const afterUndo = store.getDocument();
  assert.equal(afterUndo.schemaVersion, 2, 'undo must keep schemaVersion for persistence');
  assert.equal(afterUndo.id, 'd');
  assert.equal(afterUndo.title, 't');
  history.redo();
  const afterRedo = store.getDocument();
  assert.equal(afterRedo.schemaVersion, 2);
  assert.equal(afterRedo.id, 'd');
  assert.equal(afterRedo.title, 't');
  assert.equal(afterRedo.functions[0].visible, false);
});

test('redo restores the later structural document and keeps annotations', async () => {
  const { store, history } = await makeHistory();
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  history.undo();
  history.redo();
  const doc = store.getDocument();
  assert.equal(doc.functions[0].visible, false);
  assert.equal(doc.annotations.strokes.length, 1);
});

test('a new action clears the redo stack', async () => {
  const { store, history } = await makeHistory();
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  history.undo();
  assert.equal(history.canRedo(), true);
  store.dispatch({ type: 'function/update', payload: { id: 'f2', patch: { visible: false } } });
  assert.equal(history.canRedo(), false);
});

test('no-op actions do not enter history', async () => {
  const { store, history } = await makeHistory();
  store.dispatch({ type: 'function/update', payload: { id: 'missing', patch: { visible: false } } });
  assert.equal(history.canUndo(), false);
  // 值未变化的 patch 也不进历史
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: true } } });
  assert.equal(history.canUndo(), false);
});

test('history is bounded at 100 entries and drops the oldest', async () => {
  const { store, history } = await makeHistory(3);
  for (let i = 0; i < 5; i += 1) {
    store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { coeffs: { a: i + 1, b: 0, c: 0 } } } });
  }
  assert.equal(history.canUndo(), true);
  history.undo();
  assert.equal(store.getDocument().functions[0].coeffs.a, 4);
  history.undo();
  assert.equal(store.getDocument().functions[0].coeffs.a, 3);
  history.undo();
  assert.equal(store.getDocument().functions[0].coeffs.a, 2);
  assert.equal(history.canUndo(), false, 'oldest entries must be dropped');
});

test('a slider transaction with 50 previews forms exactly one history entry', async () => {
  const { store, history } = await makeHistory();
  store.beginTransaction();
  for (let i = 0; i < 50; i += 1) {
    store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { coeffs: { a: i / 10, b: 0, c: 0 } } } });
  }
  store.commitTransaction();
  assert.equal(history.canUndo(), true);
  history.undo();
  assert.equal(store.getDocument().functions[0].coeffs.a, 1);
  assert.equal(history.canRedo(), true);
  history.redo();
  assert.equal(store.getDocument().functions[0].coeffs.a, 4.9);
  assert.equal(history.canRedo(), false);
});

test('cancelled transactions never form history', async () => {
  const { store, history } = await makeHistory();
  store.beginTransaction();
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  store.cancelTransaction();
  assert.equal(history.canUndo(), false);
  assert.equal(store.getDocument().functions[0].visible, true);
});

test('annotations-only changes never form history', async () => {
  const { store, history } = await makeHistory();
  store.dispatch({
    type: 'annotations/replace',
    payload: { annotations: { version: 1, strokes: [{ id: 's2', points: [{ x: 2, y: 2 }] }] } },
    meta: { record: false, persist: true },
  });
  assert.equal(history.canUndo(), false);
  assert.equal(store.getDocument().annotations.strokes[0].id, 's2');
});

test('history restore dispatches do not re-enter history', async () => {
  const { store, history } = await makeHistory();
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  assert.equal(history.canUndo(), true);
  history.undo();
  assert.equal(history.canUndo(), false, 'undo must not record itself');
  history.redo();
  assert.equal(history.canRedo(), false, 'redo must not record itself');
});

test('history exposes subscribe/clear/dispose and never serializes', async () => {
  const { store, history } = await makeHistory();
  assert.equal(typeof history.subscribe, 'function');
  assert.equal(typeof history.clear, 'function');
  assert.equal(typeof history.dispose, 'function');
  assert.equal('toJSON' in history, false, 'history must not be serializable');
  assert.deepEqual(Object.keys(history).sort(), ['canRedo', 'canUndo', 'clear', 'dispose', 'redo', 'subscribe', 'undo']);

  let notified = 0;
  const unsubscribe = history.subscribe(() => {
    notified += 1;
  });
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  assert.ok(notified >= 1);
  unsubscribe();
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: true } } });
  const afterUnsubscribe = notified;
  history.clear();
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);
  history.dispose();
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  assert.equal(notified, afterUnsubscribe, 'disposed history must not listen');
});

test('undo does not move the stack when restore fails', async () => {
  const { createGraphStore } = await storeModule();
  const { createGraphHistory } = await historyModule();
  const { createDefaultGraphDocument } = await documentModule();
  const doc = createDefaultGraphDocument({});
  let failRestore = false;
  const store = createGraphStore(doc, {
    beforeCommit: (ctx) => {
      if (ctx.action?.type === 'history/restore' && failRestore) return { ok: false };
      return { ok: true };
    },
  });
  const history = createGraphHistory(store);
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  assert.equal(history.canUndo(), true);

  // 第一次 restore 失败：栈不动
  failRestore = true;
  assert.equal(history.undo(), false);
  assert.equal(history.canUndo(), true, 'stack must not move on failed restore');
  assert.equal(history.canRedo(), false);

  // 第二次成功：栈才移动
  failRestore = false;
  assert.equal(history.undo(), true);
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), true);
  assert.equal(store.getDocument().functions[0].visible, true);
});

test('redo does not move the stack when restore fails', async () => {
  const { createGraphStore } = await storeModule();
  const { createGraphHistory } = await historyModule();
  const { createDefaultGraphDocument } = await documentModule();
  const doc = createDefaultGraphDocument({});
  let failRestore = false;
  const store = createGraphStore(doc, {
    beforeCommit: (ctx) => {
      if (ctx.action?.type === 'history/restore' && failRestore) return { ok: false };
      return { ok: true };
    },
  });
  const history = createGraphHistory(store);
  store.dispatch({ type: 'function/update', payload: { id: 'f1', patch: { visible: false } } });
  history.undo();
  assert.equal(history.canRedo(), true);

  failRestore = true;
  assert.equal(history.redo(), false);
  assert.equal(history.canRedo(), true, 'redo stack must not move on failed restore');
  assert.equal(history.canUndo(), false);

  failRestore = false;
  assert.equal(history.redo(), true);
  assert.equal(store.getDocument().functions[0].visible, false);
});
