/**
 * 交点 runtime：视口只控制显隐，不决定存在性（Task 1）。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

const MOD_DIR = path.join(root, 'apps/web/src/math/graph/construction');

async function load(name) {
  return import(pathToFileURL(path.join(MOD_DIR, name)).href);
}

function makePoint(x, y) {
  return {
    elType: 'point',
    X: () => x,
    Y: () => y,
    on() {},
    setAttribute() {},
  };
}

function makeLine(p1, p2, elType = 'line') {
  return {
    elType,
    point1: p1,
    point2: p2,
  };
}

/**
 * @param {{
 *   bbox?: [number, number, number, number],
 *   constructions?: any[],
 * }} [opts]
 */
function makeHost(opts = {}) {
  let bbox = opts.bbox || /** @type {[number, number, number, number]} */ ([-8, 8, 8, -8]);
  const constructions = opts.constructions || [];
  let notifyCount = 0;
  let nextId = 1;
  const created = [];
  /** @type {any} */
  let lastPoint = null;

  const board = {
    getBoundingBox: () => bbox,
    setBoundingBox(next) {
      bbox = next;
    },
    create(type, args, attrs = {}) {
      const el = {
        elType: type,
        name: attrs.name,
        visProp: { visible: attrs.visible !== false },
        label: {
          visProp: { visible: true },
          setAttribute(patch) {
            Object.assign(this.visProp, patch);
          },
          setText() {},
        },
        setAttribute(patch) {
          Object.assign(this.visProp, patch);
        },
        on() {},
        X: () => {
          if (typeof args?.[0] === 'function') return Number(args[0]());
          return Number(args?.[0] ?? 0);
        },
        Y: () => {
          if (typeof args?.[1] === 'function') return Number(args[1]());
          return Number(args?.[1] ?? 0);
        },
        board: null,
      };
      el.board = board;
      created.push(el);
      if (type === 'point' || type === 'intersection') lastPoint = el;
      return el;
    },
    removeObject() {},
    update() {},
    _mathSchedulePointLabelFusion() {},
  };

  const host = {
    getBoard: () => board,
    getUserPoints: () => [],
    getFunctions: () => [],
    getConstructions: () => constructions,
    setConstructions(list) {
      constructions.length = 0;
      constructions.push(...list);
    },
    findUserEl: () => null,
    findConstr: (id) => constructions.find((c) => c.id === id) || null,
    evalFnY: () => null,
    findFnByCurve: () => null,
    recomputeIntersection: () => null,
    createUserPoint: () => null,
    nextConstrId: () => `I${nextId++}`,
    onChanged: () => {
      notifyCount += 1;
    },
    _notifyCount: () => notifyCount,
    _setBBox: (next) => {
      bbox = next;
    },
    _lastPoint: () => lastPoint,
    _created: () => created,
  };
  return host;
}

test('line×line intersection offscreen still creates construction record', async () => {
  const { createLineIntersection } = await load('intersection-renderers.js');
  const { syncIntersectVisibility } = await load('intersection-visibility.js');

  // 交点在 (50, 50)，视口仅 ±8 → 视口外
  const a1 = makePoint(0, 0);
  const a2 = makePoint(100, 100);
  const b1 = makePoint(0, 100);
  const b2 = makePoint(100, 0);
  const lineA = makeLine(a1, a2);
  const lineB = makeLine(b1, b2);

  const host = makeHost({ bbox: [-8, 8, 8, -8] });
  host.getConstructions().push(
    { id: 'LA', kind: 'line', els: [lineA], extend: false },
    { id: 'LB', kind: 'line', els: [lineB], extend: false },
  );

  const beforeNotify = host._notifyCount();
  const rec = createLineIntersection(host, lineA, lineB, ['LA', 'LB'], 'IX1', {
    notify: false,
  });

  assert.ok(rec, 'offscreen intersection must still return a record');
  assert.equal(rec.id, 'IX1');
  assert.equal(host.getConstructions().filter((c) => c.kind === 'intersect').length, 1);
  assert.equal(host.getConstructions().find((c) => c.id === 'IX1')?.id, 'IX1');

  const pt = rec.els[0];
  assert.equal(pt.visProp.visible, false, 'offscreen point starts hidden');
  assert.equal(pt._mathIntersectOnBody, true, 'geometry still on infinite lines');
  assert.equal(pt._mathIntersectInViewport, false);

  // 平移视口使交点进入视野
  host._setBBox([40, 60, 60, 40]);
  const visible = syncIntersectVisibility(host, pt, ['LA', 'LB']);
  assert.equal(visible, true);
  assert.equal(pt.visProp.visible, true);
  assert.equal(pt._mathIntersectInViewport, true);
  assert.equal(pt._mathIntersectOnBody, true);

  // ID / 数量不变；显隐不触发业务通知
  assert.equal(host.getConstructions().filter((c) => c.kind === 'intersect').length, 1);
  assert.equal(host.getConstructions().find((c) => c.kind === 'intersect')?.id, 'IX1');
  assert.equal(host._notifyCount(), beforeNotify);
});

test('line×fn intersection offscreen is kept and can reappear', async () => {
  const { createLineFnIntersection } = await load('intersection-renderers.js');
  const { syncIntersectVisibility } = await load('intersection-visibility.js');

  // 水平线 y=50 与常量函数 f=50，交点任意 x；用 JSXGraph intersection fake 返回 (50,50)
  const p1 = makePoint(0, 50);
  const p2 = makePoint(100, 50);
  const lineEl = makeLine(p1, p2);
  const fn = {
    id: 'F1',
    visible: true,
    curve: { id: 'curve-f1' },
  };

  const host = makeHost({ bbox: [-8, 8, 8, -8] });
  host.getFunctions = () => [fn];
  host.evalFnY = () => 50;
  host.getConstructions().push({
    id: 'L1',
    kind: 'line',
    els: [lineEl],
    extend: false,
  });

  // board.create('intersection') 返回视口外点
  const board = host.getBoard();
  const origCreate = board.create.bind(board);
  board.create = (type, args, attrs) => {
    if (type === 'intersection') {
      const el = origCreate('point', [50, 50], attrs);
      el.elType = 'intersection';
      el.X = () => 50;
      el.Y = () => 50;
      return el;
    }
    return origCreate(type, args, attrs);
  };

  const beforeNotify = host._notifyCount();
  const rec = createLineFnIntersection(host, lineEl, fn, 'L1', 'F1', 0, 'IF1', {
    notify: false,
  });
  assert.ok(rec, 'offscreen line×fn intersection must be preserved');
  assert.equal(rec.id, 'IF1');
  assert.equal(host.getConstructions().some((c) => c.id === 'IF1'), true);

  const pt = rec.els[0];
  assert.equal(pt.visProp.visible, false);
  assert.equal(pt._mathIntersectInViewport, false);

  host._setBBox([40, 60, 60, 40]);
  assert.equal(syncIntersectVisibility(host, pt, ['L1']), true);
  assert.equal(pt.visProp.visible, true);
  assert.equal(pt._mathIntersectInViewport, true);
  assert.equal(host.getConstructions().filter((c) => c.id === 'IF1').length, 1);
  assert.equal(host._notifyCount(), beforeNotify);
});

test('syncIntersectVisibility does not conflate onBody with inViewport', async () => {
  const { syncIntersectVisibility } = await load('intersection-visibility.js');
  const host = makeHost({ bbox: [-1, 1, 1, -1] });
  const pt = {
    X: () => 50,
    Y: () => 50,
    visProp: { visible: true },
    label: { setAttribute() {}, visProp: {} },
    setAttribute(patch) {
      Object.assign(this.visProp, patch);
    },
    _mathIntersectComputeRaw: () => ({ x: 50, y: 50 }),
    board: host.getBoard(),
  };
  host.getConstructions().push({ id: 'LA', kind: 'line', els: [], extend: false });
  const visible = syncIntersectVisibility(host, pt, ['LA']);
  assert.equal(visible, false);
  assert.equal(pt._mathIntersectOnBody, true);
  assert.equal(pt._mathIntersectInViewport, false);
  assert.equal(pt.visProp.visible, false);
});

test('autoIntersectNewLine creates at least four line×fn indices when geometry allows', async () => {
  const { autoIntersectNewLine } = await load('intersections.js');
  const { createLineFnIntersection } = await load('intersection-renderers.js');

  const p1 = makePoint(-20, 0);
  const p2 = makePoint(20, 0);
  const lineEl = makeLine(p1, p2);
  const fn = { id: 'Fsin', visible: true, curve: { id: 'c-sin' } };

  let suspend = 0;
  let unsuspend = 0;
  const host = makeHost({ bbox: [-30, 30, 30, -30] });
  const board = host.getBoard();
  board.suspendUpdate = () => {
    suspend += 1;
  };
  board.unsuspendUpdate = () => {
    unsuspend += 1;
  };
  const hits = [
    [-4.5, 0],
    [-1.5, 0],
    [1.5, 0],
    [4.5, 0],
  ];
  const origCreate = board.create.bind(board);
  board.create = (type, args, attrs) => {
    if (type === 'intersection') {
      const idx = Number(args?.[2] ?? 0);
      const pair = hits[idx];
      if (!pair) throw new Error('no hit');
      const [x, y] = pair;
      const el = origCreate('point', [x, y], attrs);
      el.elType = 'intersection';
      el.X = () => x;
      el.Y = () => y;
      return el;
    }
    return origCreate(type, args, attrs);
  };
  host.getFunctions = () => [fn];
  host.evalFnY = () => 0;

  const lineRec = {
    id: 'Lnew',
    kind: 'line',
    els: [lineEl],
    extend: false,
  };
  host.getConstructions().push(lineRec);

  createLineFnIntersection(host, lineEl, fn, 'Lnew', 'Fsin', 0, 'pre0', { notify: false });
  createLineFnIntersection(host, lineEl, fn, 'Lnew', 'Fsin', 1, 'pre1', { notify: false });

  const beforeNotify = host._notifyCount();
  autoIntersectNewLine(host, lineRec);

  const intersects = host
    .getConstructions()
    .filter((c) => c.kind === 'intersect' && c.fnIds?.[0] === 'Fsin');
  const indices = intersects.map((c) => c.intersectIndex ?? 0).sort((a, b) => a - b);
  assert.deepEqual(indices, [0, 1, 2, 3]);
  assert.equal(intersects.filter((c) => c.id === 'pre0' || c.id === 'pre1').length, 2);
  assert.equal(suspend, 1);
  assert.equal(unsuspend, 1);
  assert.equal(host._notifyCount(), beforeNotify, 'batch uses notify:false');
});
