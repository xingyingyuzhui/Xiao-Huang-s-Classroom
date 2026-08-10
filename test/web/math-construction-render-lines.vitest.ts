/**
 * 割线构造渲染/恢复接线（main 运行时质量恢复计划 Task 3）。
 *
 * 真实 import createSecantConstruction / restoreConstructions /
 * constructionDocumentRecord，注入 fake board/host（JSXGraph 边界），断言：
 * - 默认新建通知 1 次，notify:false 为 0 次；
 * - 所有 runtime element 的 _mathConstrId === 最终 rec.id；
 * - constructionDocumentRecord(rec) 不含 els 等不可序列化字段；
 * - 传既有 meta.id 不消耗 allocator，新建只分配一次；
 * - 无 board/无目标函数 → null，allocator 与 board.create 均 0 次；
 * - restoreConstructions：内层 0 次通知、外层默认 1 次、外层静默 0 次，
 *   失败路径可见且不伪报整批成功。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

const MOD_DIR = path.join(root, 'apps/web/src/math/graph/construction');

async function renderLinesModule() {
  return import(pathToFileURL(path.join(MOD_DIR, 'render-lines.js')).href);
}
async function restoreModule() {
  return import(pathToFileURL(path.join(MOD_DIR, 'restore.js')).href);
}

// ───────────────────────── fake host / board ─────────────────────────

const fnF1 = {
  id: 'f1',
  kind: 'preset',
  preset: 'quadratic',
  coeffs: { a: 1, b: 0, c: 0 },
  visible: true,
  curve: { id: 'curve-f1' },
};

/**
 * @param {{
 *   board?: any | null,
 *   functions?: any[],
 *   throwOn?: string,
 * }} [opts]
 */
function makeSecantHost(opts = {}) {
  const userPoints = [
    { id: 'U1', el: { id: 'u1' } },
    { id: 'U2', el: { id: 'u2' } },
  ];
  const constructions = [];
  let allocated = 0;
  let notifyCount = 0;
  const created = [];
  const board =
    opts.board === undefined
      ? {
          create(type, args) {
            created.push(type);
            if (opts.throwOn && type === opts.throwOn) {
              throw new Error(`boom:${type}`);
            }
            return {
              elType: type,
              label: null,
              setText() {},
              setAttribute() {},
              X: () => (type === 'glider' ? Number(args[0]) : 0),
              Y: () => 0,
            };
          },
          removeObject() {},
          update() {},
          getBoundingBox: () => [-8, 8, 8, -8],
        }
      : opts.board;
  const host = {
    getBoard: () => board,
    getFunctions: () => opts.functions === undefined ? [fnF1] : opts.functions,
    getConstructions: () => constructions,
    setConstructions: (list) => {
      constructions.length = 0;
      constructions.push(...list);
    },
    findUserEl: (id) => userPoints.find((r) => r.id === id)?.el || null,
    findConstr: (id) => constructions.find((c) => c.id === id) || null,
    nextConstrId: () => {
      allocated += 1;
      return `C${allocated}`;
    },
    evalFnY: (fn, x) => {
      const { a = 0, b = 0, c = 0 } = fn?.coeffs || {};
      return a * x * x + b * x + c;
    },
    onChanged: () => {
      notifyCount += 1;
    },
  };
  return { host, constructions, userPoints, allocated: () => allocated, notifyCount: () => notifyCount, created };
}

// ───────────────────────── 割线创建：通知/ID/持久化边界 ─────────────────────────

test('createSecantConstruction：默认通知 1 次；notify:false 0 次；所有 els 标记最终 id；持久化不含 els', async () => {
  const { createSecantConstruction } = await renderLinesModule();
  const { constructionDocumentRecord } = await restoreModule();
  const { host, constructions, allocated, notifyCount } = makeSecantHost();

  const rec = createSecantConstruction(host, { fnId: 'f1', x1: -1, x2: 1 });
  assert.ok(rec, '有 board + 目标函数时应创建割线');
  assert.ok(rec.id, `割线有最终 id，实际 ${JSON.stringify(rec.id)}`);
  assert.equal(constructions[0], rec, 'runtime 记录进入 host.getConstructions()');
  assert.ok(rec.els.length >= 3, 'els 至少含 A/B 端点和割线段');
  for (const el of rec.els) {
    assert.equal(el._mathConstrId, rec.id, '每个 runtime element 标记最终 _mathConstrId');
  }
  assert.equal(notifyCount(), 1, '默认新建通知恰好 1 次');
  assert.equal(allocated(), 1, '新建割线分配一次 id');

  // 持久化边界：文档记录剔除 els/label DOM/board object
  const docRec = constructionDocumentRecord(rec);
  assert.ok(docRec, '文档记录可序列化');
  assert.ok(!('els' in docRec), 'constructionDocumentRecord 不含 els');
  assert.equal(docRec.kind, 'secant');
  assert.equal(docRec.id, rec.id);

  // notify:false → 0 次
  const { host: host2, notifyCount: n2 } = makeSecantHost();
  createSecantConstruction(host2, { fnId: 'f1', x1: -1, x2: 1 }, { notify: false });
  assert.equal(n2(), 0, 'notify:false 时 0 次通知');
});

test('createSecantConstruction：传 meta.id 不消耗 allocator；无 board/无函数返回 null 且 0 次创建', async () => {
  const { createSecantConstruction } = await renderLinesModule();
  const { host, allocated, notifyCount, created } = makeSecantHost();
  const rec = createSecantConstruction(host, { id: 'S9', fnId: 'f1', x1: 0, x2: 2 });
  assert.equal(rec.id, 'S9', '使用既有 meta.id');
  assert.equal(allocated(), 0, '传 meta.id 不消耗 allocator');
  assert.ok(rec.els.every((el) => el._mathConstrId === 'S9'), 'els 标记 meta.id');
  assert.equal(notifyCount(), 1);

  // 无 board
  const h1 = makeSecantHost({ board: null });
  const r1 = createSecantConstruction(h1.host, { fnId: 'f1' });
  assert.equal(r1, null, '无 board 返回 null');
  assert.equal(h1.allocated(), 0, '无 board 不消耗 allocator');
  assert.equal(h1.created.length, 0, '无 board 不创建任何 JSXGraph element');

  // 找不到目标函数
  const h2 = makeSecantHost({ functions: [] });
  const r2 = createSecantConstruction(h2.host, { fnId: 'nope' });
  assert.equal(r2, null, '找不到目标函数返回 null');
  assert.equal(h2.allocated(), 0, '无函数不消耗 allocator');
  assert.equal(h2.created.length, 0, '无函数不创建任何 JSXGraph element');
});

// ───────────────────────── 批量恢复：单次通知合同 ─────────────────────────

test('restoreConstructions：内层 0 次、外层默认 1 次、外层静默 0 次；混合种类全部恢复', async () => {
  const { restoreConstructions } = await restoreModule();
  const { host, constructions, allocated, notifyCount } = makeSecantHost();

  const saved = [
    { id: 'C1', kind: 'segment', pointIds: ['U1', 'U2'] },
    { id: 'C2', kind: 'line', pointIds: ['U1', 'U2'] },
    { id: 'C3', kind: 'secant', fnId: 'f1', x1: -1, x2: 1, showDelta: true },
    { id: 'C4', kind: 'tangent', pointIds: ['U1'], fnId: 'f1' },
  ];
  restoreConstructions(host, saved);
  for (const id of ['C1', 'C2', 'C3', 'C4']) {
    assert.ok(constructions.some((c) => c.id === id), `${id} 已恢复`);
  }
  assert.equal(allocated(), 0, '恢复带既有 id，不消耗 allocator');
  assert.equal(notifyCount(), 1, '内层构造器全部静默，外层至多一次通知');

  // 外层静默
  const { host: host2, notifyCount: n2 } = makeSecantHost();
  restoreConstructions(host2, saved, { notify: false });
  assert.equal(n2(), 0, '外层收到 notify:false 时为 0 次');
});

test('restoreConstructions 失败路径：日志可见、其余项恢复、外层通知仍一次（不伪报整批成功）', async () => {
  const { restoreConstructions } = await restoreModule();
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  try {
    // 割线成功；line 创建在 board.create('line') 处抛错
    const { host, constructions, notifyCount } = makeSecantHost({ throwOn: 'line' });
    restoreConstructions(host, [
      { id: 'C3', kind: 'secant', fnId: 'f1', x1: -1, x2: 1 },
      { id: 'C2', kind: 'line', pointIds: ['U1', 'U2'] },
    ]);
    assert.ok(warns.length >= 1, '失败路径有可见日志（console.warn）');
    assert.ok(constructions.some((c) => c.id === 'C3'), '失败不阻断其余项恢复');
    assert.ok(!constructions.some((c) => c.id === 'C2'), '失败项未伪报为已恢复');
    assert.equal(notifyCount(), 1, '失败路径外层通知仍恰好一次');
  } finally {
    console.warn = origWarn;
  }
});
