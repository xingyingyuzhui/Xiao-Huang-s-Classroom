/**
 * GraphReadouts 布局批处理与生命周期合同（Task 7 Step 5 / 交接清单）。
 *
 * fake document + 注入 frame task 调度器，断言：
 * 1. 同帧多次 paintReadouts() 只执行一次宽度测量（DOM 批量写、帧内合并读）。
 * 2. dispose 取消 pending frame；dispose 后帧回调不写 DOM。
 * 3. reset() 重新武装（readouts 是模块级单例，跨 mount 复用）。
 * 4. 过期的异步数值分析回调（dispose 后 / 活动函数已切换）不更新 DOM。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function readoutsModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-readouts.js')).href,
  );
}
async function frameTaskModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/shared/frame-task.js')).href,
  );
}

/** 可手动触发的 frame scheduler：同一时刻只保留一个待执行帧回调。 */
function createFakeFrameScheduler() {
  let callback = null;
  let requested = 0;
  return {
    requestFrame(fn) {
      callback = fn;
      requested += 1;
      return requested;
    },
    cancelFrame() {
      callback = null;
    },
    runFrame() {
      const fn = callback;
      callback = null;
      if (fn) fn();
    },
    pending: () => callback !== null,
  };
}

/**
 * fake 元素。宽度测量（alignFeatureLabelWidths）是 features 元素上
 * `--feat-label-w` setProperty 的唯一消费者 → 用它计数测量执行次数。
 */
function makeFakeElement(id, counter, rows = 0) {
  const rowsEls = [];
  for (let i = 0; i < rows; i += 1) {
    rowsEls.push({ getBoundingClientRect: () => ({ width: 40 + i }) });
  }
  return {
    id,
    innerHTML: '',
    hidden: false,
    textContent: '',
    style: {
      properties: {},
      setProperty(k, v) {
        this.properties[k] = v;
        counter.measures += 1;
      },
    },
    querySelectorAll(sel) {
      return sel.includes('.math-float-feat-row') ? rowsEls : [];
    },
  };
}

/** 装配 readouts + fake DOM。 */
async function setup() {
  const [readoutsMod, frameMod] = await Promise.all([readoutsModule(), frameTaskModule()]);
  const scheduler = createFakeFrameScheduler();
  const counter = { measures: 0 };
  const elements = {
    mathGraphFeatures: makeFakeElement('mathGraphFeatures', counter, 2),
    mathGraphValueTable: makeFakeElement('mathGraphValueTable', counter),
    mathGraphProbeReadout: makeFakeElement('mathGraphProbeReadout', counter),
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      return elements[id] || null;
    },
  };

  const state = {
    functions: [],
    activeFnId: null,
    board: { getBoundingBox: () => [-10, 10, -10, 10] },
    numericRequest: null,
    numericRunner: null,
  };

  const readouts = readoutsMod.createGraphReadouts({
    getState: () => state,
    evalFnY: () => 0,
    fnDisplayLabel: (fn) => fn.name || fn.id,
    createFrameTask: (task) =>
      frameMod.createFrameTask(task, {
        requestFrame: scheduler.requestFrame,
        cancelFrame: scheduler.cancelFrame,
      }),
  });

  return {
    readouts,
    scheduler,
    elements,
    state,
    measureCount: () => counter.measures,
    restore() {
      globalThis.document = previousDocument;
    },
  };
}

const presetFn = (id) => ({ id, name: id, kind: 'preset', preset: 'quadratic', coeffs: { a: 1, b: 0, c: 0 }, visible: true });
const customFn = (id) => ({ id, name: id, kind: 'custom', expr: 'x^2-1', coeffs: {}, visible: true });

test('同帧多次 paintReadouts 只执行一次宽度测量', async () => {
  const ctx = await setup();
  const { readouts, scheduler, state, elements, measureCount, restore } = ctx;
  state.functions = [presetFn('f1')];
  state.activeFnId = 'f1';

  readouts.paintReadouts();
  readouts.paintReadouts();
  readouts.paintReadouts();
  assert.equal(scheduler.pending(), true, '同帧内只登记一个测量 frame');
  scheduler.runFrame();
  assert.equal(measureCount(), 1, '同帧多次 paintReadouts 只测量一次');
  assert.equal(
    elements.mathGraphFeatures.style.properties['--feat-label-w'],
    '41px',
    '测量结果写入 CSS custom property（取行最大宽度）',
  );
  restore();
});

test('dispose 取消 pending frame；dispose 后帧回调不写 DOM', async () => {
  const ctx = await setup();
  const { readouts, scheduler, state, measureCount, restore } = ctx;
  state.functions = [presetFn('f1')];
  state.activeFnId = 'f1';

  readouts.paintReadouts();
  assert.equal(scheduler.pending(), true);
  readouts.dispose();
  assert.equal(scheduler.pending(), false, 'dispose 取消 pending 测量 frame');
  scheduler.runFrame();
  assert.equal(measureCount(), 0, 'dispose 后帧回调不执行测量');

  // dispose 后再 paintReadouts：即使 frame 被调度，回调也因 disposed 直接返回
  readouts.paintReadouts();
  scheduler.runFrame();
  assert.equal(measureCount(), 0, 'dispose 后测量永远不落 DOM');
  restore();
});

test('reset 重新武装：跨 mount 复用恢复测量与 DOM 写入', async () => {
  const ctx = await setup();
  const { readouts, scheduler, state, measureCount, restore } = ctx;
  state.functions = [presetFn('f1')];
  state.activeFnId = 'f1';

  readouts.paintReadouts();
  readouts.dispose();
  scheduler.runFrame();
  assert.equal(measureCount(), 0, 'dispose 后不测量');

  readouts.reset(); // 重挂载：readouts 单例重新武装
  readouts.paintReadouts();
  assert.equal(scheduler.pending(), true, 'reset 后测量调度恢复');
  scheduler.runFrame();
  assert.equal(measureCount(), 1, 'reset 后恢复测量');
  restore();
});

test('dispose 后过期的异步数值分析结果不更新 DOM', async () => {
  const ctx = await setup();
  const { readouts, state, elements, restore } = ctx;
  state.functions = [customFn('f1')];
  state.activeFnId = 'f1';
  let captured = null;
  state.numericRunner = {
    analyze(opts) {
      captured = opts;
      return () => {};
    },
  };
  state.numericRequest = () => {};

  readouts.paintReadouts();
  assert.equal(elements.mathGraphFeatures.innerHTML.includes('分析中'), true);
  readouts.dispose();
  // 过期回调在 dispose 后返回
  captured.onResult({ ok: true, result: { zeros: [{ x: 1 }], extrema: [], discontinuities: [] } });
  assert.equal(elements.mathGraphFeatures.innerHTML.includes('零点'), false, '过期回调不写结果');
  assert.equal(elements.mathGraphFeatures.innerHTML.includes('分析中'), true, 'DOM 保持 dispose 时状态');
  restore();
});

test('活动函数已切换的过期数值分析结果不更新 DOM', async () => {
  const ctx = await setup();
  const { readouts, state, elements, restore } = ctx;
  state.functions = [customFn('f1'), customFn('f2')];
  state.activeFnId = 'f2';
  let captured = null;
  state.numericRunner = {
    analyze(opts) {
      captured = opts;
      return () => {};
    },
  };
  state.numericRequest = () => {};

  readouts.paintReadouts(); // 对活动函数 f2 发起分析
  // 分析期间活动函数切回 f1 → 旧结果过期
  state.activeFnId = 'f1';
  captured.onResult({ ok: true, result: { zeros: [{ x: 2 }], extrema: [], discontinuities: [] } });
  assert.equal(elements.mathGraphFeatures.innerHTML.includes('零点'), false, '过期结果不落 DOM');
  assert.equal(elements.mathGraphFeatures.innerHTML.includes('分析中'), true);
  restore();
});
