/** 函数求值 sidecar：记录不携带 evalFn，编译与缓存收敛到 evaluator。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function evaluator() {
  return import(
    pathToFileURL(
      path.join(root, 'apps/web/src/math/graph/function-evaluator.js'),
    ).href,
  );
}

test('compileFunctionRecord handles preset and custom records', async () => {
  const { compileFunctionRecord } = await evaluator();
  const preset = compileFunctionRecord({
    id: 'f1',
    kind: 'preset',
    preset: 'quadratic',
    coeffs: { a: 1, b: -2, c: 1 },
  });
  assert.equal(preset.ok, true);
  assert.equal(preset.fn(1), 0);
  assert.equal(preset.fn(2), 1);

  const custom = compileFunctionRecord({ id: 'f2', kind: 'custom', expr: 'x^2' });
  assert.equal(custom.ok, true);
  assert.equal(custom.fn(3), 9);

  const bad = compileFunctionRecord({ id: 'f3', kind: 'custom', expr: 'x + (' });
  assert.equal(bad.ok, false);
  assert.equal(typeof bad.error, 'string');
});

test('evaluator cache resolves, invalidates and clears by record key', async () => {
  const { createFunctionEvaluatorCache } = await evaluator();
  const cache = createFunctionEvaluatorCache();

  const f1 = { id: 'f1', kind: 'preset', preset: 'linear', coeffs: { a: 2, b: 1, c: 0 } };
  const f2 = { id: 'f2', kind: 'custom', expr: 'x^3' };

  assert.equal(cache.resolve(f1)(3), 7);
  assert.equal(cache.resolve(f2)(2), 8);

  // 同一 key 命中缓存：替换实现不应导致重复编译（用计数器验证）
  let compiles = 0;
  const spyCache = createFunctionEvaluatorCache({
    compile: (record) => {
      compiles += 1;
      return { ok: true, fn: (x) => x * 2 };
    },
  });
  spyCache.resolve({ id: 'x', kind: 'custom', expr: 't' });
  spyCache.resolve({ id: 'x', kind: 'custom', expr: 't' });
  assert.equal(compiles, 1, 'cache hit must not recompile');

  // key 变化（expr 编辑）重新编译
  spyCache.resolve({ id: 'x', kind: 'custom', expr: 't+1' });
  assert.equal(compiles, 2);

  // invalidate / clear 失效
  spyCache.resolve({ id: 'y', kind: 'custom', expr: 'u' });
  spyCache.invalidate('y');
  spyCache.resolve({ id: 'y', kind: 'custom', expr: 'u' });
  assert.equal(compiles, 4);
  spyCache.clear();
  spyCache.resolve({ id: 'y', kind: 'custom', expr: 'u' });
  assert.equal(compiles, 5);
});

test('evaluateGraphFunction uses the resolver option and falls back to the default cache', async () => {
  const evaluatorMod = await evaluator();
  const { createFunctionEvaluatorCache } = evaluatorMod;
  const { evaluateGraphFunction } = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/function-analysis.js')).href,
  );

  const custom = {
    id: 'f1',
    kind: 'custom',
    expr: 'x^2',
    visible: true,
  };
  // 显式注入 resolver
  const resolver = createFunctionEvaluatorCache();
  assert.equal(evaluateGraphFunction(custom, 4, { resolveEvaluator: (r) => resolver.resolve(r) }), 16);
  // 不注入时走默认 cache，同样可求值（回归：不保留 evalFn 字段也能画）
  assert.equal(evaluateGraphFunction(custom, 5), 25);
  // 隐藏函数无结果
  assert.equal(evaluateGraphFunction({ ...custom, visible: false }, 5), null);
});

test('graph runtime sidecar holds curve slot and evaluator', async () => {
  const runtimeMod = await import(
    pathToFileURL(path.join(root, 'apps/web/src/math/graph/graph-runtime.js')).href,
  );
  assert.equal(typeof runtimeMod.createGraphRuntimeSidecar, 'function');
  const sidecar = runtimeMod.createGraphRuntimeSidecar();
  assert.equal(sidecar.curve, null);
  assert.equal(typeof sidecar.evaluator.resolve, 'function');
  assert.equal(typeof sidecar.evaluator.invalidate, 'function');
  assert.equal(typeof sidecar.evaluator.clear, 'function');
  assert.equal(sidecar.evaluator.resolve({ id: 'q', kind: 'preset', preset: 'linear', coeffs: { a: 3, b: 0, c: 0 } })(2), 6);
});
