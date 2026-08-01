/** 数值分析：取消、缓存命中、stale 丢弃与求值预算。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function runnerModule() {
  return import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/numeric-analysis-runner.js')).href,
  );
}

function makeScheduler() {
  const queue = [];
  return {
    queue,
    requestIdleCallback: (fn) => {
      queue.push(fn);
      return queue.length;
    },
    cancelIdleCallback: () => {},
    runNext() {
      const fn = queue.shift();
      if (fn) fn();
    },
  };
}

test('cache hit returns without re-evaluating', async () => {
  const { createNumericAnalysisRunner, analysisCacheKey } = await runnerModule();
  const scheduler = makeScheduler();
  const runner = createNumericAnalysisRunner({
    requestIdleCallback: scheduler.requestIdleCallback,
    cancelIdleCallback: scheduler.cancelIdleCallback,
  });
  let evaluations = 0;
  const record = { id: 'f1', kind: 'custom', expr: 'x^2-1' };
  const results = [];
  const run = (onResult) =>
    runner.analyze({
      record,
      interval: [-3, 3],
      resolveEvaluator: () => (x) => {
        evaluations += 1;
        return x * x - 1;
      },
      onResult,
    });
  run((r, meta) => results.push({ cached: meta.cached, zeros: r.result?.zeros?.length }));
  scheduler.runNext();
  assert.equal(results.length, 1);
  assert.equal(results[0].cached, false);
  const firstEvaluations = evaluations;

  run((r, meta) => results.push({ cached: meta.cached, zeros: r.result?.zeros?.length }));
  scheduler.runNext();
  assert.equal(results.length, 2);
  assert.equal(results[1].cached, true, 'second call is a cache hit');
  assert.equal(evaluations, firstEvaluations, 'cache hit must not re-evaluate');
  assert.ok(analysisCacheKey(record, [-3, 3], 1e-4).includes('x^2-1'));
});

test('cancelled requests do not publish', async () => {
  const { createNumericAnalysisRunner } = await runnerModule();
  const scheduler = makeScheduler();
  const runner = createNumericAnalysisRunner({
    requestIdleCallback: scheduler.requestIdleCallback,
    cancelIdleCallback: scheduler.cancelIdleCallback,
  });
  const results = [];
  const cancel = runner.analyze({
    record: { id: 'f1', kind: 'custom', expr: 'x' },
    interval: [-3, 3],
    resolveEvaluator: () => (x) => x,
    onResult: (r, meta) => results.push({ r, meta }),
  });
  cancel();
  scheduler.runNext();
  assert.equal(results.length, 0, 'cancelled analysis never publishes');
});

test('invalidated requests never publish (stale protection)', async () => {
  const { createNumericAnalysisRunner } = await runnerModule();
  const scheduler = makeScheduler();
  const runner = createNumericAnalysisRunner({
    requestIdleCallback: scheduler.requestIdleCallback,
    cancelIdleCallback: scheduler.cancelIdleCallback,
  });
  const results = [];
  const record = { id: 'f1', kind: 'custom', expr: 'x' };
  const cancel = runner.analyze({
    record,
    interval: [-3, 3],
    resolveEvaluator: () => (x) => x,
    onResult: (r, meta) => results.push(['first', meta.cached]),
  });
  // 函数定义变化 → 取消旧请求（等价于函数/视口变化时取消旧 request）
  cancel();
  scheduler.runNext();
  assert.equal(results.length, 0, 'cancelled/invalidated request never publishes');

  // 同一 key 的重复请求不重复调度（等前一个结果即可）
  const second = [];
  const { analysisCacheKey } = await runnerModule();
  const key = analysisCacheKey(record, [-3, 3], 1e-4);
  runner.invalidateKey(key);
  runner.analyze({
    record,
    interval: [-3, 3],
    resolveEvaluator: () => (x) => x,
    onResult: (r, meta) => second.push(meta.cached),
  });
  const dupe = runner.analyze({
    record,
    interval: [-3, 3],
    resolveEvaluator: () => (x) => x,
    onResult: (r, meta) => second.push(meta.cached),
  });
  assert.equal(typeof dupe, 'function', 'duplicate request returns a cancel fn');
  scheduler.runNext();
  scheduler.runNext();
  assert.equal(second.filter((c) => c === false).length, 1, 'one real computation, one share');
});

test('single active function analysis stays within the evaluation budget', async () => {
  const { createNumericAnalysisRunner } = await runnerModule();
  const runner = createNumericAnalysisRunner({});
  let evaluations = 0;
  const results = [];
  runner.analyze({
    record: { id: 'f1', kind: 'custom', expr: 'x^3 - 2x + 1' },
    interval: [-10, 10],
    resolveEvaluator: () => (x) => {
      evaluations += 1;
      return x * x * x - 2 * x + 1;
    },
    onResult: (r) => results.push(r),
  });
  // 无 ric/setTimeout 注入 → setTimeout 兜底；手动等一个宏任务
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(results.length, 1);
  assert.ok(evaluations <= 5000, `evaluations ${evaluations} within budget`);
  assert.equal(results[0].result.warnings.includes('NUMERIC_APPROXIMATION'), true);
});

test('clear drops cache and pending', async () => {
  const { createNumericAnalysisRunner } = await runnerModule();
  const runner = createNumericAnalysisRunner({});
  const results = [];
  runner.analyze({
    record: { id: 'f1', kind: 'custom', expr: 'x' },
    interval: [-3, 3],
    resolveEvaluator: () => (x) => x,
    onResult: (r, meta) => results.push(meta),
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(runner.stats().cacheSize, 1);
  runner.clear();
  assert.equal(runner.stats().cacheSize, 0);
});
