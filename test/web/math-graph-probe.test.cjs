/** 曲线探针：纯采样模型 + transient 控制器契约（fake board/事件）。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function probeModel() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/probe-model.js')).href,
  );
}

async function probeController() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/probe-controller.js')).href,
  );
}

function fn(id, visible = true) {
  return { id, name: id, visible, kind: 'preset', preset: 'linear', coeffs: { a: 1, b: 0, c: 0 } };
}

test('sampleProbe skips hidden functions and marks invalid values', async () => {
  const { sampleProbe } = await probeModel();
  const evaluator = (f, x) => {
    if (f.id === 'log') return x > 0 ? Math.log(x) : null;
    if (f.id === 'inf') return Infinity;
    return x * 2;
  };
  const samples = sampleProbe({
    functions: [fn('f1'), fn('hidden', false), fn('log'), fn('inf')],
    pointerX: -1,
    activeFunctionId: 'f1',
    evaluator,
  });
  // hidden 跳过；log(-1) 无效；Infinity 无效
  assert.equal(samples.some((s) => s.functionId === 'hidden'), false);
  const logSample = samples.find((s) => s.functionId === 'log');
  assert.equal(logSample.valid, false);
  assert.equal(logSample.y, null);
  const infSample = samples.find((s) => s.functionId === 'inf');
  assert.equal(infSample.valid, false);
  assert.equal(samples.find((s) => s.functionId === 'f1').valid, true);
});

test('sampleProbe orders the active function first and caps at maxFunctions', async () => {
  const { sampleProbe } = await probeModel();
  const functions = Array.from({ length: 12 }, (_, i) => fn(`f${i + 1}`));
  const samples = sampleProbe({
    functions,
    pointerX: 0,
    activeFunctionId: 'f7',
    evaluator: (f, x) => x,
    options: { maxFunctions: 5 },
  });
  assert.equal(samples.length, 5, 'capped at maxFunctions');
  assert.equal(samples[0].functionId, 'f7', 'active function comes first');
});

test('sampleProbe formats values and steps by tick', async () => {
  const { formatProbeValue, probeStepFromTick } = await probeModel();
  assert.equal(formatProbeValue(1.23456), '1.23');
  assert.equal(formatProbeValue(-0), '0');
  assert.equal(formatProbeValue(Infinity), '—');
  assert.equal(probeStepFromTick(1, false), 1);
  assert.equal(probeStepFromTick(2, true), 0.2);
  assert.equal(probeStepFromTick(0, false), 1, 'invalid tick falls back to 1');
});

test('probe controller renders transient crosshair and readout without store writes', async () => {
  const { createProbeController } = await probeController();
  const created = [];
  const removed = [];
  const board = {
    containerObj: {
      addEventListener() {},
      removeEventListener() {},
    },
    getBoundingBox: () => [-10, 10, 10, -10],
    getUsrCoordsOfMouse: (ev) => [1, ev.clientX, 0],
    create: (type, coords, attrs) => {
      const el = { type, coords, attrs };
      created.push(el);
      return el;
    },
    removeObject(el) {
      removed.push(el);
    },
  };
  const readout = { textContent: '', hidden: true };
  let samples = null;
  let pointerX = null;
  const frames = [];
  const controller = createProbeController({
    board,
    getFunctions: () => [fn('f1')],
    getActiveFunctionId: () => 'f1',
    resolveEvaluator: () => (x) => x * 2,
    getTick: () => 1,
    readoutEl: readout,
    onSample: (s, x) => {
      samples = s;
      pointerX = x;
    },
    eventTarget: { addEventListener() {}, removeEventListener() {} },
    frameScheduler: (fn) => {
      frames.push(fn);
      return frames.length;
    },
  });
  controller.activate();
  controller.updateAt(3);
  assert.equal(frames.length, 1, 'RAF coalesces');
  controller.updateAt(4);
  assert.equal(frames.length, 1, 'second update within a frame is coalesced');
  frames.shift()(); // 执行合并后的帧
  assert.equal(created.length, 1, 'crosshair created');
  assert.equal(created[0].type, 'line');
  assert.equal(samples[0].functionId, 'f1');
  assert.equal(samples[0].y, 8);
  assert.equal(pointerX, 4);
  assert.match(readout.textContent, /x=4/);

  controller.deactivate();
  assert.equal(removed.length, 1, 'transient crosshair removed on deactivate');
  assert.equal(readout.textContent, '');
  assert.equal(readout.hidden, true);
});

test('probe controller keyboard moves by tick and shift refines', async () => {
  const { createProbeController } = await probeController();
  const listeners = {};
  const board = {
    containerObj: { addEventListener() {}, removeEventListener() {} },
    getBoundingBox: () => [-10, 10, 10, -10],
    getUsrCoordsOfMouse: () => [1, 0, 0],
    create: () => ({}),
    removeObject() {},
  };
  const moved = [];
  const frames = [];
  const controller = createProbeController({
    board,
    getFunctions: () => [],
    getActiveFunctionId: () => null,
    resolveEvaluator: () => () => null,
    getTick: () => 1,
    readoutEl: null,
    eventTarget: {
      addEventListener(type, fn) {
        listeners[type] = fn;
      },
      removeEventListener(type) {
        delete listeners[type];
      },
    },
    frameScheduler: (fn) => {
      frames.push(fn);
    },
  });
  controller.activate();
  // 键盘步进
  listeners.keydown({ key: 'ArrowRight', shiftKey: false, preventDefault() {} });
  listeners.keydown({ key: 'ArrowRight', shiftKey: true, preventDefault() {} });
  // 执行两帧（每次步进触发一帧）
  frames.splice(0).forEach((fn) => fn());
  frames.splice(0).forEach((fn) => fn());
  controller.dispose();
  assert.equal(listeners.keydown, undefined, 'dispose removes keydown listener');
});

test('probe lifecycle: dispose cancels frame and removes listeners', async () => {
  const { createProbeController } = await probeController();
  const keyListeners = {};
  let removedCrosshairs = 0;
  const controller = createProbeController({
    board: {
      containerObj: {
        pointerMoves: [],
        addEventListener(type, fn) {
          this.pointerMoves.push(fn);
        },
        removeEventListener(type, fn) {
          this.pointerMoves = this.pointerMoves.filter((f) => f !== fn);
        },
      },
      getBoundingBox: () => [-10, 10, 10, -10],
      getUsrCoordsOfMouse: () => [1, 0, 0],
      create: () => ({}),
      removeObject() {
        removedCrosshairs += 1;
      },
    },
    getFunctions: () => [],
    getActiveFunctionId: () => null,
    resolveEvaluator: () => () => null,
    getTick: () => 1,
    eventTarget: {
      addEventListener(type, fn) {
        keyListeners[type] = fn;
      },
      removeEventListener(type) {
        delete keyListeners[type];
      },
    },
    frameScheduler: (fn) => fn(),
  });
  controller.activate();
  controller.updateAt(1);
  controller.dispose();
  assert.equal(keyListeners.keydown, undefined);
  assert.equal(removedCrosshairs, 1, 'dispose clears transient elements');
});
