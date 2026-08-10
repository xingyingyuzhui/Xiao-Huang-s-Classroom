/**
 * lint baseline v2 文件级指纹回归测试（2026-08-10 计划 Task 5）。
 *
 * 验证 diff 算法保证：
 *  - 删除旧 issue 允许；
 *  - 同 rule 总量下降但新文件出现 issue 仍失败（v1 按 rule 总量比较的盲区）；
 *  - 同文件新增第二个相同 issue（同指纹 count 增加）失败；
 *  - 文件开头插入无关行、违规源码及其上下文未变时不失败；
 *  - 同文件、同 rule、同 message 搬到不同源码上下文时失败（依赖前后锚点）；
 *  - 只改违规语句中的数字、变量名或字符串产生新指纹并失败；
 *  - parse error 永远视为关键回归；同位置重复稳定不误报。
 *
 * 不宣称能够区分“完全相同代码连同完全相同相邻上下文”在同文件内的纯搬移
 * （该极端情况需要先修旧债或升级为 AST anchor，不能退回全仓总量比较）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

let core;
test.before(async () => {
  core = await import(
    pathToFileURL(path.join(root, 'tooling/quality/lint-baseline-core.mjs')).href
  );
});

/** 构造一个 fake ESLint 文件结果：filePath 位于仓库根下，source 由测试提供 */
function makeFile(relPath, source, messages) {
  return { filePath: path.join(root, relPath), source, messages };
}

/** 从文件结果集构造 collector 注入用的 readFile（内存 map，不读磁盘） */
function makeRead(files) {
  const map = new Map(files.map((f) => [f.filePath, f.source]));
  return (filePath) => {
    if (!map.has(filePath)) throw new Error(`missing fixture: ${filePath}`);
    return map.get(filePath);
  };
}

/** 用内存 readFile 收集 entries */
function collect(files) {
  return core.collectEntries(files, root, makeRead(files));
}

/** 构造单行规则 message（line=endLine，column/endColumn 指向违规 node） */
function msg(ruleId, message, line, column, endColumn, extra = {}) {
  return { ruleId, message, line, endLine: line, column, endColumn, ...extra };
}

/** 构造 parse error message（无 endColumn，ESLint fatal 形状） */
function parseError(message, line, column) {
  return { ruleId: null, fatal: true, message, line, endLine: line, column };
}

/**
 * v1 旧算法的最小复刻：按 ruleId 全仓总量比较。
 * 仅用于证明“同 rule 新文件问题”对旧门禁不可见（先红）。
 */
function v1PerRuleCounts(results) {
  const perRule = {};
  for (const file of results) {
    for (const m of file.messages) {
      const key = m.ruleId || '(parse-error)';
      perRule[key] = (perRule[key] || 0) + 1;
    }
  }
  return perRule;
}

function v1Regressions(baselinePerRule, currentPerRule) {
  const out = [];
  for (const [rule, count] of Object.entries(currentPerRule)) {
    const prev = baselinePerRule[rule] || 0;
    if (count > prev) out.push(`${rule}: ${prev} → ${count}`);
  }
  return out;
}

test('normalizeSourceContext 只折叠空白，不归一化数字/变量名/字符串', () => {
  const { normalizeSourceContext } = core;
  assert.equal(
    normalizeSourceContext('  const   a = 1;\n\tconst b = 2;  '),
    'const a = 1; const b = 2;',
  );
  assert.equal(normalizeSourceContext('foo  bar'), normalizeSourceContext('foo bar'));
  assert.notEqual(normalizeSourceContext('1'), normalizeSourceContext('2'));
  assert.notEqual(normalizeSourceContext('myVar'), normalizeSourceContext('yourVar'));
  assert.notEqual(normalizeSourceContext("'a'"), normalizeSourceContext("'b'"));
});

test('指纹确定性强：路径/rule/message/上下文哈希任一变化都产生新指纹', () => {
  const { issueFingerprint } = core;
  const m = msg('no-undef', "'foo' is not defined.", 1, 1, 4);
  const base = issueFingerprint(root, 'apps/web/src/x.js', m, '  foo');
  assert.equal(issueFingerprint(root, 'apps/web/src/x.js', m, '  foo'), base, '同输入必须同指纹');
  assert.notEqual(
    issueFingerprint(root, 'apps/web/src/x.js', m, '  bar'),
    base,
    '上下文变化必须换指纹',
  );
  assert.notEqual(
    issueFingerprint(root, 'apps/web/src/y.js', m, '  foo'),
    base,
    '路径变化必须换指纹',
  );
  assert.notEqual(
    issueFingerprint(
      root,
      'apps/web/src/x.js',
      { ...m, message: "'bar' is not defined." },
      '  foo',
    ),
    base,
    'message 变化必须换指纹',
  );
  const parse = issueFingerprint(root, 'apps/web/src/x.js', parseError('Parsing error', 2, 3), 'x');
  assert.match(parse, /::\(parse-error\)::/, 'parse error 的 ruleId 必须记为 (parse-error)');
});

test('v1 按 rule 总量比较对“同 rule 新文件问题”不可见（旧算法红）', () => {
  const srcA = [
    "'use strict';",
    "const MODE = 'prod';",
    '',
    'function compute() {',
    '  const unusedA = 1;',
    '  const unusedB = 2;',
    '  const unusedC = 3;',
    '  return MODE;',
    '}',
    '',
  ].join('\n');
  const unusedMsg = (name, line) =>
    msg('no-unused-vars', `'${name}' is defined but never used.`, line, 9, 16);
  const baselineResults = [
    makeFile('apps/web/src/a.js', srcA, [
      unusedMsg('unusedA', 5),
      unusedMsg('unusedB', 6),
      unusedMsg('unusedC', 7),
    ]),
  ];
  // 当前：a.js 删掉一个（unusedB），但新文件 b.js 出现同样 rule 的 1 个问题
  const currentResults = [
    makeFile('apps/web/src/a.js', srcA, [unusedMsg('unusedA', 5), unusedMsg('unusedC', 7)]),
    makeFile('apps/web/src/b.js', 'function helper() {\n  const unusedD = 1;\n  return 0;\n}\n', [
      unusedMsg('unusedD', 2),
    ]),
  ];
  const baseline = v1PerRuleCounts(baselineResults);
  const current = v1PerRuleCounts(currentResults);
  assert.deepEqual(
    v1Regressions(baseline, current),
    [],
    'v1 只比较 rule 总量：3 → 3 看不到新文件里的同 rule 问题（旧门禁盲区）',
  );
});

test('v2：同 rule 总量下降但新文件出现 issue 仍失败（新算法绿）', () => {
  const srcA = [
    "'use strict';",
    "const MODE = 'prod';",
    '',
    'function compute() {',
    '  const unusedA = 1;',
    '  const unusedB = 2;',
    '  const unusedC = 3;',
    '  return MODE;',
    '}',
    '',
  ].join('\n');
  const unusedMsg = (name, line) =>
    msg('no-unused-vars', `'${name}' is defined but never used.`, line, 9, 16);
  const baseline = collect([
    makeFile('apps/web/src/a.js', srcA, [
      unusedMsg('unusedA', 5),
      unusedMsg('unusedB', 6),
      unusedMsg('unusedC', 7),
    ]),
  ]);
  const current = collect([
    makeFile('apps/web/src/a.js', srcA, [unusedMsg('unusedA', 5), unusedMsg('unusedC', 7)]),
    makeFile('apps/web/src/b.js', 'function helper() {\n  const unusedD = 1;\n  return 0;\n}\n', [
      unusedMsg('unusedD', 2),
    ]),
  ]);
  const regressions = core.diffEntries(baseline.entries, current.entries);
  assert.equal(regressions.length, 1, '必须恰好检测到 b.js 的新指纹');
  assert.match(
    regressions[0].fingerprint,
    /^apps\/web\/src\/b\.js::no-unused-vars::/,
    '回归必须是 b.js 的指纹',
  );
  assert.deepEqual(
    { prev: regressions[0].prev, count: regressions[0].count },
    { prev: 0, count: 1 },
  );
});

test('删除旧 issue 允许（整删与部分删都不失败）', () => {
  const src = 'function compute() {\n  const unusedA = 1;\n  const unusedB = 2;\n  return 0;\n}\n';
  const m1 = msg('no-unused-vars', "'unusedA' is defined but never used.", 2, 9, 16);
  const m2 = msg('no-unused-vars', "'unusedB' is defined but never used.", 3, 9, 16);
  const baseline = collect([makeFile('apps/web/src/a.js', src, [m1, m2])]);
  assert.deepEqual(core.diffEntries(baseline.entries, {}), [], '全部删除允许');
  const partial = collect([makeFile('apps/web/src/a.js', src, [m1])]);
  assert.deepEqual(core.diffEntries(baseline.entries, partial.entries), [], '部分删除允许');
  assert.equal(Object.keys(baseline.entries).length, 2, '基线必须包含两个不同指纹');
  assert.equal(Object.keys(partial.entries).length, 1, '部分删除后只剩一个指纹');
});

test('同文件新增第二个相同 issue（同指纹 count 增加）失败', () => {
  const src = [
    "'use strict';",
    '',
    'function compute() {',
    '  const unusedA = 1;',
    '  return 0;',
    '}',
    '',
  ].join('\n');
  const dup = msg('no-unused-vars', "'unusedA' is defined but never used.", 4, 9, 16);
  const baseline = collect([makeFile('apps/web/src/a.js', src, [dup])]);
  // ESLint 可对同一代码位置报出多个相同 rule/message/上下文的问题（同指纹出现多次）
  const current = collect([makeFile('apps/web/src/a.js', src, [dup, { ...dup }])]);
  const regressions = core.diffEntries(baseline.entries, current.entries);
  assert.equal(regressions.length, 1, '同指纹 count 1 → 2 必须失败');
  assert.deepEqual(
    { prev: regressions[0].prev, count: regressions[0].count },
    { prev: 1, count: 2 },
  );
});

test('文件开头插入无关行、违规源码及上下文未变时不失败', () => {
  const src = [
    "'use strict';",
    "const MODE = 'prod';",
    '',
    'function compute() {',
    '  const unusedA = 1;',
    '  return MODE;',
    '}',
    '',
  ].join('\n');
  const violation = msg('no-unused-vars', "'unusedA' is defined but never used.", 5, 9, 16);
  const baseline = collect([makeFile('apps/web/src/a.js', src, [violation])]);
  const withHeader = ['// header inserted at top of file', ...src.split('\n')].join('\n');
  const moved = { ...violation, line: 6 };
  const current = collect([makeFile('apps/web/src/a.js', withHeader, [moved])]);
  assert.deepEqual(core.diffEntries(baseline.entries, current.entries), [], '插行不得使指纹漂移');
  const key = Object.keys(current.entries)[0];
  assert.ok(baseline.entries[key] === 1, '插行后指纹必须与基线一致');
});

test('同文件、同 rule、同 message 搬到不同源码上下文时失败（依赖前后锚点）', () => {
  const src = [
    'function alpha() {',
    '  // shared anchor one',
    '  // shared anchor two',
    '  const unusedA = 1;',
    '  return 10;',
    '}',
    '',
    'function beta() {',
    '  // shared anchor one',
    '  // shared anchor two',
    '  const unusedA = 1;',
    '  return 20;',
    '}',
    '',
  ].join('\n');
  const violation = msg('no-unused-vars', "'unusedA' is defined but never used.", 4, 9, 16);
  const baseline = collect([makeFile('apps/web/src/a.js', src, [violation])]);
  // 搬到 beta：前面 2 个非空锚点与 alpha 完全相同，但后续锚点不同
  const moved = { ...violation, line: 11 };
  const current = collect([makeFile('apps/web/src/a.js', src, [moved])]);
  const regressions = core.diffEntries(baseline.entries, current.entries);
  assert.equal(regressions.length, 1, '搬移到不同源码上下文必须失败');
  assert.match(regressions[0].fingerprint, /::no-unused-vars::/, '回归指纹必须带 ruleId');
});

test('只改违规语句中的数字/变量名/字符串产生新指纹并失败', () => {
  const variants = [
    {
      name: '变量名',
      baselineSrc: 'function run() {\n  return foo + 1;\n}\n',
      currentSrc: 'function run() {\n  return bar + 1;\n}\n',
      baselineMsg: msg('no-undef', "'foo' is not defined.", 2, 10, 13),
      currentMsg: msg('no-undef', "'bar' is not defined.", 2, 10, 13),
    },
    {
      name: '数字',
      baselineSrc: 'function spin() {\n    while (1) {\n      break;\n    }\n}\n',
      currentSrc: 'function spin() {\n    while (2) {\n      break;\n    }\n}\n',
      baselineMsg: msg('no-constant-condition', 'Unexpected constant condition.', 2, 12, 13),
      currentMsg: msg('no-constant-condition', 'Unexpected constant condition.', 2, 12, 13),
    },
    {
      name: '字符串',
      baselineSrc: "const text = 'he\\\\dllo';\n",
      currentSrc: "const text = 'he\\\\wllo';\n",
      baselineMsg: msg('no-useless-escape', 'Unnecessary escape character: \\d.', 1, 17, 19),
      currentMsg: msg('no-useless-escape', 'Unnecessary escape character: \\w.', 1, 17, 19),
    },
  ];
  for (const v of variants) {
    const baseline = collect([makeFile('apps/web/src/a.js', v.baselineSrc, [v.baselineMsg])]);
    const current = collect([makeFile('apps/web/src/a.js', v.currentSrc, [v.currentMsg])]);
    const regressions = core.diffEntries(baseline.entries, current.entries);
    assert.equal(regressions.length, 1, `${v.name} 变化必须产生新指纹并失败`);
  }
});

test('parse error 永远关键：新位置必失败，同位置重复稳定不误报', () => {
  const src = 'const ok = 1;\nconst bad = (1 + 2;\n';
  const parseA = parseError('Parsing error: Unexpected token ;', 2, 18);
  // 空基线出现 parse error → 关键回归
  const fresh = core.diffEntries(
    {},
    collect([makeFile('apps/web/src/a.js', src, [parseA])]).entries,
  );
  assert.equal(fresh.length, 1, '新 parse error 必须失败');
  assert.match(fresh[0].fingerprint, /::\(parse-error\)::/, 'parse error 指纹必须带 (parse-error)');

  // 同位置同 message 重复 → 稳定不误报
  const baseline = collect([makeFile('apps/web/src/a.js', src, [parseA])]);
  const same = collect([makeFile('apps/web/src/a.js', src, [parseA])]);
  assert.deepEqual(
    core.diffEntries(baseline.entries, same.entries),
    [],
    '同位置 parse error 不误报',
  );

  // 同 message 换到同文件另一处（不同源码上下文）→ 关键回归
  const movedSrc = 'const ok = 1;\nconst bad = (1 + 2;\n\nconst evil = 1;\nconst worse = (2 + 3;\n';
  const parseB = parseError('Parsing error: Unexpected token ;', 5, 18);
  const moved = collect([makeFile('apps/web/src/a.js', movedSrc, [parseB])]);
  const regressions = core.diffEntries(baseline.entries, moved.entries);
  assert.equal(regressions.length, 1, 'parse error 换到新源码上下文必须失败');
});
