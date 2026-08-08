/**
 * 数学 AI：小知识学科分支 + 函数生成接线
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

test('math AI function route and service exist', () => {
  const route = fs.readFileSync(
    path.join(root, 'apps/server/src/routes/ai/math.ts'),
    'utf8',
  );
  const svc = fs.readFileSync(
    path.join(root, 'apps/server/src/services/ai/math-fn-service.js'),
    'utf8',
  );
  const rootRouter = fs.readFileSync(path.join(root, 'apps/server/src/routes/ai.js'), 'utf8');
  assert.match(route, /\/math\/function/);
  assert.match(route, /generateMathFunction/);
  assert.match(svc, /kind.*preset|custom/);
  assert.match(svc, /deepseek|callDeepSeekChat/);
  assert.match(rootRouter, /ai\/math/);
});

test('math-fn-service validates expr and presets', () => {
  const {
    validateExprSyntax,
    normalizeFnPayload,
  } = require(path.join(root, 'apps/server/src/services/ai/math-fn-service.js'));

  const ok = validateExprSyntax('0.5x^2-x-1.5');
  assert.equal(ok.ok, true);
  assert.ok(ok.expr);

  const bad = validateExprSyntax('eval(1)');
  assert.equal(bad.ok, false);

  const preset = normalizeFnPayload({
    kind: 'preset',
    preset: 'quadratic',
    coeffs: { a: 0.5, b: -1, c: -1.5 },
    label: '二次',
  });
  assert.equal(preset.kind, 'preset');
  assert.equal(preset.preset, 'quadratic');
  assert.equal(preset.coeffs.a, 0.5);

  const custom = normalizeFnPayload({ kind: 'custom', expr: 'sin(x)' });
  assert.equal(custom.kind, 'custom');
  assert.match(custom.expr, /sin/);
});

test('tip generation has math branch', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/server/src/services/chemistry/ai-service.js'),
    'utf8',
  );
  assert.match(src, /MATH_TIP_SEEDS|高中数学/);
  assert.match(src, /sid === 'math'|subjectId.*math/);
});

test('brand tip is subject-aware', () => {
  const src = fs.readFileSync(
    path.join(root, 'apps/web/src/shared/ui/brand-tip.js'),
    'utf8',
  );
  assert.match(src, /FALLBACK_TIPS_MATH/);
  assert.match(src, /getCurrentSubjectId/);
  assert.match(src, /数学小知识/);
});

test('graph wires AI function modal', () => {
  const html = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/partials/math-panels.partial.html'),
    'utf8',
  );
  const js = [
    'index.js',
    'function-panel.js',
    'function-records.js',
  ]
    .map((file) => fs.readFileSync(path.join(root, 'apps/web/src/math/graph', file), 'utf8'))
    .join('\n');
  const client = fs.readFileSync(path.join(root, 'apps/web/src/shared/api/client.js'), 'utf8');
  // P3.1：AI 按钮不再静态内联在 partial——由 function-panel 用 @xiaohuang/ui
  // createButton 挂载（保留同一 id），partial 只需保留弹窗骨架
  assert.doesNotMatch(html, /id="btnMathAiFn"/);
  assert.match(js, /id\s*=\s*['"]btnMathAiFn['"]/);
  assert.match(html, /id="mathFnAiModal"/);
  assert.match(js, /mathFnGenerate|addFromAiSpec|showAi/);
  assert.match(client, /mathFnGenerate/);
  assert.match(client, /\/ai\/math\/function/);
});
