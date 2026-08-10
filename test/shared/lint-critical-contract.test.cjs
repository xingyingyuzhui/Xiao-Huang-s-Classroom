/**
 * lint:critical 零容忍运行时安全门禁合同（2026-08-10 计划 Task 4）。
 *
 * 断言：
 * 1. 根脚本与 quality/quality:fast 两条质量链都包含 lint:critical；
 * 2. eslint.critical.config.mjs 存在且导出 11 条 runtimeSafetyRules（全部 error）；
 * 3. 通过 ESLint Node API lintText() 检查未定义引用：先断言无 parser error，
 *    再断言命中 no-undef（filePath 指向不存在的 apps/web/src/__fixtures__/bad.js
 *    逻辑路径，不写任何 fixture 文件）；
 * 4. 合法 browser/node 文本（document/performance/AbortController）分别以
 *    Web/Server 逻辑路径断言不误报；
 * 5. 本测试不修改真实 ESLint 配置、baseline 或生产源码。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ESLint } = require('eslint');
const root = require('../helpers/repo-root.js');

const criticalConfigFile = path.join(root, 'eslint.critical.config.mjs');

/** 只加载 critical 配置本身（overrideConfigFile 指向路径时 ESLint 不再合并根配置） */
function createCriticalLinter() {
  return new ESLint({ cwd: root, overrideConfigFile: criticalConfigFile });
}

/** lintText 并断言结果既无 parser/fatal error，也无其他非预期错误 */
async function lintCritical(code, filePath) {
  const results = await createCriticalLinter().lintText(code, { filePath });
  assert.equal(results.length, 1, 'lintText 必须返回单个文件结果');
  const messages = results[0].messages;
  const fatal = messages.filter((m) => m.fatal || m.ruleId === null);
  assert.deepEqual(
    fatal.map((m) => m.message),
    [],
    `lintText 不允许出现 parser error（filePath=${filePath}）`,
  );
  return messages;
}

test('根脚本与 quality 链均包含 lint:critical', () => {
  const pkg = JSON.parse(require('node:fs').readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['lint:critical'], /eslint/, 'lint:critical 脚本必须调用 eslint');
  assert.match(
    pkg.scripts['lint:critical'],
    /eslint\.critical\.config\.mjs/,
    'lint:critical 必须显式使用 critical 配置',
  );
  for (const chain of ['quality', 'quality:fast']) {
    assert.match(
      pkg.scripts[chain],
      /lint:critical/,
      `${chain} 必须包含 lint:critical（普通 lint 后、typecheck 前）`,
    );
  }
  // 顺序合同：lint:critical 在 lint 之后、typecheck 之前
  const criticalIndex = pkg.scripts.quality.indexOf('lint:critical');
  const lintIndex = pkg.scripts.quality.indexOf('npm run lint &&');
  const typecheckIndex = pkg.scripts.quality.indexOf('typecheck');
  assert.ok(criticalIndex > lintIndex, 'quality: lint:critical 必须在 lint 之后');
  assert.ok(criticalIndex < typecheckIndex, 'quality: lint:critical 必须在 typecheck 之前');
});

test('critical 配置存在且 11 条运行时安全规则全部为 error', async () => {
  const { runtimeSafetyRules } = await import(pathToFileURL(criticalConfigFile).href);
  const expected = [
    'constructor-super',
    'getter-return',
    'no-class-assign',
    'no-const-assign',
    'no-dupe-keys',
    'no-ex-assign',
    'no-func-assign',
    'no-import-assign',
    'no-undef',
    'no-unreachable',
    'valid-typeof',
  ];
  for (const rule of expected) {
    assert.equal(runtimeSafetyRules[rule], 'error', `runtimeSafetyRules.${rule} 必须为 error`);
  }
  assert.equal(Object.keys(runtimeSafetyRules).length, expected.length, '规则表不得混入风格债规则');
});

test('lintText 坏文本命中 no-undef 且无 parser error（不写 fixture 文件）', async () => {
  const code = 'function probe() { return missingRuntimeDependency; } probe();';
  const filePath = path.join(root, 'apps/web/src/__fixtures__/bad.js');
  assert.ok(!require('node:fs').existsSync(filePath), '禁止真实写入 fixture 文件');
  const messages = await lintCritical(code, filePath);
  const noUndef = messages.filter((m) => m.ruleId === 'no-undef');
  assert.ok(noUndef.length >= 1, `必须命中 no-undef，实际: ${messages.map((m) => m.message)}`);
  assert.match(
    noUndef[0].message,
    /missingRuntimeDependency/,
    'no-undef 必须指向缺失的运行时符号',
  );
});

test('合法 browser 文本以 Web 逻辑路径不误报', async () => {
  const code = [
    'const el = document.createElement("div");',
    'const ctl = new AbortController();',
    'const t = performance.now();',
    'el.append(String(t));',
  ].join('\n');
  const messages = await lintCritical(code, path.join(root, 'apps/web/src/probe.js'));
  assert.deepEqual(messages, [], 'browser 合法全局不得被 no-undef 误报');
});

test('合法 node 文本以 Server 逻辑路径不误报', async () => {
  const code = [
    'const { performance } = globalThis;',
    'function run() {',
    '  const ctl = new AbortController();',
    '  const t = performance.now();',
    '  const ok = fetch("https://example.invalid");',
    '  return { ctl, t, ok };',
    '}',
    'module.exports = { run };',
  ].join('\n');
  const messages = await lintCritical(code, path.join(root, 'apps/server/src/probe.js'));
  assert.deepEqual(messages, [], 'node 合法全局不得被 no-undef 误报');
});
