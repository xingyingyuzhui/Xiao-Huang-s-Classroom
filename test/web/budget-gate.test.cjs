/**
 * Bundle 预算门禁（Task 8 重构版）。
 *
 * budget.mjs 从 Vite manifest 沿 imports 递归计算三条路径（initial /
 * mathGraph / mathClassroomKatexOnly）的真实请求集合，用 node:zlib.gzipSync
 * 计算 raw + gzip，并与拆分前 baseline（route-request-baseline.json）比较
 * 规范化请求集合。本文件用临时 dist fixture 覆盖红绿矩阵：
 *
 * - 单 chunk raw 超限失败；gzip 超限但 raw 未超限仍失败；
 * - 多 index-* 正确聚合；HTML initial preload 集合正确（未引用 lazy chunk 不计首屏）；
 * - CSS 计入 initial gzip；
 * - manifest imports 闭包循环去重并计入动态路径；
 * - 请求数超限失败；KaTeX-only 路径含 jsxgraph chunk 失败；
 * - manifest 缺预期 dynamic entry 失败（不 0KB 假绿）；
 * - baseline 比较：允许 mathviz → jsxgraph+katex 拆分，其余差异失败；
 * - 真实 dist（已构建时）整体通过且 KaTeX-only 不含 JSXGraph。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

const script = path.join(root, 'tooling/performance/budget.mjs');

// ── fixture 构造 ────────────────────────────────────────────────────────────

/** 可压缩文本内容（gzip 极小） */
function text(kb) {
  return Buffer.alloc(Math.round(kb * 1024), 0x61);
}

/** 确定性不可压缩内容（mulberry32；gzip ≈ raw，用于 gzip 超限场景） */
function random(kb, seed = 42) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const buf = Buffer.alloc(Math.round(kb * 1024));
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(next() * 256);
  return buf;
}

/**
 * 标准 fixture 工厂。返回 { dir, manifest }。
 * 默认请求集合（与真实构建同构）：
 *   initial: index:js + index:css + three:js
 *   mathGraph incremental: index:js + jsxgraph:js + katex:js
 *   mathClassroomKatexOnly incremental: entry:js + tex:js + tex:css + katex:js
 */
function makeDist(opts = {}) {
  const {
    sizes = {},
    initialImports = ['_three-AAAAAAAA.js'],
    graphImports = ['_jsxgraph-AAAAAAAA.js', '_katex-AAAAAAAA.js'],
    classroomImports = ['_katex-AAAAAAAA.js', '_tex-AAAAAAAA.js'],
    extraManifest = {},
    manifest = null,
  } = opts;
  const size = (key, def) => sizes[key] ?? def;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'budget-fixture-'));
  fs.mkdirSync(path.join(dir, '.vite'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });

  const assets = {
    'index-AAAAAAAA.js': text(size('index', 30)),
    'index-AAAAAAAA.css': text(size('indexCss', 20)),
    'three-AAAAAAAA.js': text(size('three', 10)),
    'jsxgraph-AAAAAAAA.js': text(size('jsxgraph', 10)),
    'katex-AAAAAAAA.js': text(size('katex', 10)),
    'index-BBBBBBBB.js': text(size('graphIndex', 20)),
    'entry-AAAAAAAA.js': text(size('entry', 10)),
    'tex-AAAAAAAA.js': text(size('tex', 1)),
    'tex-AAAAAAAA.css': text(size('texCss', 5)),
    'account-AAAAAAAA.js': text(size('account', 15)),
  };
  for (const [name, content] of Object.entries(assets)) {
    fs.writeFileSync(path.join(dir, 'assets', name), content);
  }

  const built = manifest || {
    'index.html': {
      file: 'assets/index-AAAAAAAA.js',
      src: 'index.html',
      isEntry: true,
      imports: initialImports,
      css: ['assets/index-AAAAAAAA.css'],
    },
    '_three-AAAAAAAA.js': { file: 'assets/three-AAAAAAAA.js', name: 'three' },
    '_jsxgraph-AAAAAAAA.js': { file: 'assets/jsxgraph-AAAAAAAA.js', name: 'jsxgraph' },
    '_katex-AAAAAAAA.js': { file: 'assets/katex-AAAAAAAA.js', name: 'katex' },
    'src/math/graph/index.js': {
      file: 'assets/index-BBBBBBBB.js',
      src: 'src/math/graph/index.js',
      isDynamicEntry: true,
      imports: graphImports,
    },
    'src/math/classroom/entry.js': {
      file: 'assets/entry-AAAAAAAA.js',
      src: 'src/math/classroom/entry.js',
      isDynamicEntry: true,
      imports: classroomImports,
    },
    'src/account/boot-account-cloud.js': {
      file: 'assets/account-AAAAAAAA.js',
      src: 'src/account/boot-account-cloud.js',
      isDynamicEntry: true,
      imports: [],
    },
    '_tex-AAAAAAAA.js': {
      file: 'assets/tex-AAAAAAAA.js',
      name: 'tex',
      css: ['assets/tex-AAAAAAAA.css'],
    },
    ...extraManifest,
  };
  fs.writeFileSync(path.join(dir, '.vite/manifest.json'), JSON.stringify(built, null, 2));
  return { dir, manifest: built };
}

/** 与当前 fixture 请求集合一致的 baseline（比较通过；测试可覆盖再改坏） */
function makeBaseline({ initial, mathGraph, classroom, accountCloud } = {}) {
  const req = (list) =>
    (list || []).map((s) => {
      const [family, kind] = s.split(':');
      return { family, kind };
    });
  return {
    formatVersion: 1,
    entries: {
      initial: 'index.html',
      mathGraph: 'src/math/graph/index.js',
      mathClassroomKatexOnly: 'src/math/classroom/entry.js',
      accountCloud: 'src/account/boot-account-cloud.js',
    },
    routes: {
      initial: { requests: req(initial || ['index:js', 'index:css', 'three:js']) },
      mathGraph: { requests: req(mathGraph || ['index:js', 'jsxgraph:js', 'katex:js']) },
      mathClassroomKatexOnly: {
        requests: req(classroom || ['entry:js', 'tex:js', 'tex:css', 'katex:js']),
      },
      accountCloud: { requests: req(accountCloud || ['account:js']) },
    },
    chunks: {},
    total: { rawKb: 0, gzipKb: 0 },
  };
}

/** 运行预算工具；返回 { ok, out } */
function runBudget(dir, { baseline, args = [] } = {}) {
  const env = { ...process.env, ARCH_BUDGET_DIST: dir };
  if (baseline) env.ARCH_BUDGET_BASELINE = baseline;
  try {
    const out = execFileSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: 'utf8',
      env,
      stdio: 'pipe',
    });
    return { ok: true, out: String(out) };
  } catch (err) {
    return { ok: false, out: String(err.stdout || '') + String(err.stderr || '') };
  }
}

/** 临时 baseline 文件路径 */
function writeBaselineFile(baselineObj) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'budget-base-')), 'baseline.json');
  fs.writeFileSync(p, JSON.stringify(baselineObj));
  return p;
}

function cleanup(...dirs) {
  for (const d of dirs) {
    if (d) fs.rmSync(d, { recursive: true, force: true });
  }
}

// ── 红绿矩阵 ────────────────────────────────────────────────────────────────

test('达标 fixture 整体通过（raw/gzip/请求数/baseline 全绿）', () => {
  const { dir } = makeDist();
  const base = writeBaselineFile(makeBaseline());
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(r.ok, `应通过: ${r.out.slice(0, 300)}`);
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

test('单 chunk raw 超限必须失败（jsxgraph raw > 1035kB）', () => {
  const { dir } = makeDist({ sizes: { jsxgraph: 1200 } });
  const base = writeBaselineFile(makeBaseline());
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(!r.ok, 'jsxgraph raw 超限必须 exit 1');
    assert.match(r.out, /jsxgraph raw: 1200kB > 预算 1035kB/);
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

test('gzip 超限但 raw 未超限仍失败（不可压缩 jsxgraph）', () => {
  const { dir } = makeDist({
    sizes: { jsxgraph: 700 },
    graphImports: [], // 不把 jsxgraph 拖进 mathGraph，保持单点失败
  });
  // 用不可压缩内容覆盖 jsxgraph 文件
  fs.writeFileSync(path.join(dir, 'assets', 'jsxgraph-AAAAAAAA.js'), random(700));
  const base = writeBaselineFile(makeBaseline({ mathGraph: ['index:js'] }));
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(!r.ok, 'gzip 超限必须 exit 1');
    assert.match(r.out, /jsxgraph gzip: \d+kB > 预算 268kB/);
    assert.doesNotMatch(r.out, /jsxgraph raw: 700kB > 预算 1035kB/, 'raw 不应同时超限');
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

test('多个 index-* 正确聚合（各 chunk 未超但合计超限失败）', () => {
  const { dir } = makeDist({ sizes: { index: 350, graphIndex: 350 } });
  const base = writeBaselineFile(makeBaseline());
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(!r.ok, 'index 聚合超限必须失败');
    assert.match(r.out, /index raw: 700kB > 预算 658kB/);
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

test('HTML initial preload 集合正确：未引用的 lazy chunk 不计首屏', () => {
  const { dir } = makeDist({
    classroomImports: ['_katex-AAAAAAAA.js', '_tex-AAAAAAAA.js', '_big-AAAAAAAA.js'],
    extraManifest: {
      '_big-AAAAAAAA.js': { file: 'assets/big-AAAAAAAA.js' },
    },
  });
  fs.writeFileSync(path.join(dir, 'assets', 'big-AAAAAAAA.js'), text(400));
  try {
    const reportPath = path.join(dir, 'report.json');
    const r = runBudget(dir, { args: ['--report-json', reportPath] });
    assert.ok(r.ok, r.out.slice(0, 300));
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const initialFams = report.routes.initial.requests.map((x) => x.family);
    assert.deepEqual(initialFams, ['index', 'index', 'three'], 'initial 只含 entry+首屏 CSS+three');
    // 400kB 的 big chunk 在 classroom 路径里，而不是 initial
    const classFams = report.routes.mathClassroomKatexOnly.requests.map((x) => x.family);
    assert.ok(classFams.includes('big'), 'lazy chunk 计入 dynamic 路径');
    assert.ok(!initialFams.includes('big'), 'lazy chunk 不得计入首屏');
  } finally {
    cleanup(dir);
  }
});

test('CSS 计入 initial gzip（raw 未超、gzip 超限失败）', () => {
  const { dir } = makeDist({ sizes: { indexCss: 500 } });
  fs.writeFileSync(path.join(dir, 'assets', 'index-AAAAAAAA.css'), random(500));
  const base = writeBaselineFile(makeBaseline());
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(!r.ok, 'initial gzip 超限必须失败');
    assert.match(r.out, /initial gzip: \d+kB > 预算 328kB/);
    assert.doesNotMatch(r.out, /initial raw: \d+kB > 预算 1334kB/, 'raw 不应同时超限');
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

test('manifest imports 闭包循环去重并计入动态路径', () => {
  const { dir } = makeDist({
    graphImports: ['_A-AAAAAAAA.js'],
    extraManifest: {
      '_A-AAAAAAAA.js': { file: 'assets/A-AAAAAAAA.js', imports: ['_B-AAAAAAAA.js'] },
      '_B-AAAAAAAA.js': { file: 'assets/B-AAAAAAAA.js', imports: ['_A-AAAAAAAA.js'] },
    },
  });
  fs.writeFileSync(path.join(dir, 'assets', 'A-AAAAAAAA.js'), text(10));
  fs.writeFileSync(path.join(dir, 'assets', 'B-AAAAAAAA.js'), text(100));
  try {
    const reportPath = path.join(dir, 'report.json');
    const r = runBudget(dir, { args: ['--report-json', reportPath] });
    assert.ok(r.ok, r.out.slice(0, 300));
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const inc = report.routes.mathGraph.requests;
    const fams = inc.map((x) => x.family);
    assert.equal(fams.filter((f) => f === 'B').length, 1, 'B 只计一次（循环去重）');
    // graphIndex 20 + A 10 + B 100 = 130kB，重复计数会翻倍
    assert.ok(Math.abs(report.routes.mathGraph.incrementalRawKb - 130) < 1, '闭包字节不重复计');
  } finally {
    cleanup(dir);
  }
});

test('请求数超限失败（字节未超仍失败）', () => {
  const { dir } = makeDist({
    initialImports: [
      '_c1-AAAAAAAA.js',
      '_c2-AAAAAAAA.js',
      '_c3-AAAAAAAA.js',
      '_c4-AAAAAAAA.js',
      '_c5-AAAAAAAA.js',
      '_c6-AAAAAAAA.js',
    ],
    extraManifest: Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((n) => [`_c${n}-AAAAAAAA.js`, { file: `assets/c${n}-AAAAAAAA.js` }]),
    ),
  });
  for (const n of [1, 2, 3, 4, 5, 6]) {
    fs.writeFileSync(path.join(dir, 'assets', `c${n}-AAAAAAAA.js`), text(1));
  }
  const base = writeBaselineFile(makeBaseline());
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(!r.ok, '请求数超限必须失败');
    assert.match(r.out, /initial 请求数: \d+ > 预算 4/);
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

test('KaTeX-only 路径出现 jsxgraph chunk 必须失败（forbiddenChunks）', () => {
  const { dir } = makeDist({
    classroomImports: ['_jsxgraph-AAAAAAAA.js', '_tex-AAAAAAAA.js'],
  });
  // baseline 与当前请求集合一致，保证唯一失败点是 forbiddenChunks
  const base = writeBaselineFile(
    makeBaseline({ classroom: ['entry:js', 'tex:js', 'tex:css', 'jsxgraph:js'] }),
  );
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(!r.ok, 'KaTeX-only 含 JSXGraph 必须失败');
    assert.match(r.out, /mathClassroomKatexOnly 含禁用 chunk jsxgraph/);
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

test('manifest 缺预期 dynamic entry 必须硬失败（不 0KB 假绿）', () => {
  const { dir, manifest } = makeDist();
  delete manifest['src/math/graph/index.js'];
  fs.writeFileSync(path.join(dir, '.vite/manifest.json'), JSON.stringify(manifest));
  const base = writeBaselineFile(makeBaseline());
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(!r.ok, '缺入口必须失败');
    assert.match(r.out, /manifest 缺少预期入口 src\/math\/graph\/index\.js/);
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

test('预期入口存在但不是 dynamic entry 必须失败', () => {
  const { dir, manifest } = makeDist();
  delete manifest['src/math/classroom/entry.js'].isDynamicEntry;
  fs.writeFileSync(path.join(dir, '.vite/manifest.json'), JSON.stringify(manifest));
  const base = writeBaselineFile(makeBaseline());
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(!r.ok, '非 dynamic entry 必须失败');
    assert.match(r.out, /不是 dynamic entry/);
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

// ── baseline 比较规则 ────────────────────────────────────────────────────────

test('baseline 比较：允许 mathviz → jsxgraph+katex 拆分', () => {
  const { dir } = makeDist({
    graphImports: ['_jsxgraph-AAAAAAAA.js', '_katex-AAAAAAAA.js'],
    classroomImports: ['_katex-AAAAAAAA.js', '_tex-AAAAAAAA.js'],
    extraManifest: {
      '_mathviz-AAAAAAAA.js': { file: 'assets/mathviz-AAAAAAAA.js' },
    },
  });
  fs.writeFileSync(path.join(dir, 'assets', 'mathviz-AAAAAAAA.js'), text(10));
  // 拆分前 baseline：mathviz 整包在两条路径
  const base = writeBaselineFile(
    makeBaseline({
      mathGraph: ['index:js', 'mathviz:js'],
      classroom: ['entry:js', 'tex:js', 'tex:css', 'mathviz:js'],
    }),
  );
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(r.ok, `mathviz→jsxgraph+katex 拆分应通过: ${r.out.slice(0, 300)}`);
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

test('baseline 比较：mathviz 未拆分仍整包存在必须失败', () => {
  const { dir } = makeDist({
    graphImports: ['_mathviz-AAAAAAAA.js'],
    extraManifest: {
      '_mathviz-AAAAAAAA.js': { file: 'assets/mathviz-AAAAAAAA.js' },
    },
  });
  fs.writeFileSync(path.join(dir, 'assets', 'mathviz-AAAAAAAA.js'), text(10));
  const base = writeBaselineFile(makeBaseline({ mathGraph: ['index:js', 'mathviz:js'] }));
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(!r.ok, 'mathviz 未拆分必须失败');
    assert.match(r.out, /mathGraph: mathviz 未按 splitTransforms 拆分/);
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

test('baseline 比较：拆分后路径丢失全部目标必须失败', () => {
  const { dir } = makeDist({
    graphImports: [],
  });
  const base = writeBaselineFile(makeBaseline({ mathGraph: ['index:js', 'mathviz:js'] }));
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(!r.ok, '拆分后无目标 chunk 必须失败');
    assert.match(r.out, /mathGraph: 拆分后（源自 mathviz:js）该路径未保有任一目标 chunk/);
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

test('baseline 比较：未声明成员消失/新增必须失败', () => {
  // 消失：baseline 有 object-select，当前没有且无 transform
  const { dir } = makeDist({
    graphImports: ['_jsxgraph-AAAAAAAA.js'],
    extraManifest: { '_object-select-AAAAAAAA.js': { file: 'assets/object-select-AAAAAAAA.js' } },
  });
  fs.writeFileSync(path.join(dir, 'assets', 'object-select-AAAAAAAA.js'), text(5));
  const base = writeBaselineFile(
    makeBaseline({ mathGraph: ['index:js', 'object-select:js', 'jsxgraph:js'] }),
  );
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(!r.ok, '未声明成员消失必须失败');
    assert.match(r.out, /mathGraph: 基线请求集合成员 object-select:js 在当前构建中消失/);
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

test('baseline 比较：当前新增未声明 family 必须失败', () => {
  const { dir } = makeDist({
    graphImports: ['_jsxgraph-AAAAAAAA.js', '_katex-AAAAAAAA.js', '_extra-AAAAAAAA.js'],
    extraManifest: { '_extra-AAAAAAAA.js': { file: 'assets/extra-AAAAAAAA.js' } },
  });
  fs.writeFileSync(path.join(dir, 'assets', 'extra-AAAAAAAA.js'), text(5));
  const base = writeBaselineFile(
    makeBaseline({ mathGraph: ['index:js', 'jsxgraph:js', 'katex:js'] }),
  );
  try {
    const r = runBudget(dir, { baseline: base });
    assert.ok(!r.ok, '新增未声明 family 必须失败');
    assert.match(r.out, /mathGraph: 当前请求集合新增未声明成员 extra:js/);
  } finally {
    cleanup(dir, path.dirname(base));
  }
});

// ── 真实 dist ────────────────────────────────────────────────────────────────

test('stale hash 文件不计入 total/index；当前 manifest 超限仍失败', () => {
  const { dir } = makeDist({ sizes: { index: 30 } });
  // 旧 hash：体积巨大但不在当前 manifest
  fs.writeFileSync(path.join(dir, 'assets', 'index-OLDOLDOLD.js'), text(900));
  const base = writeBaselineFile(makeBaseline());
  try {
    const reportPath = path.join(dir, 'report.json');
    const r = runBudget(dir, { baseline: base, args: ['--report-json', reportPath] });
    assert.ok(r.ok, `含 stale 文件仍应通过: ${r.out.slice(0, 400)}`);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.ok(report.total.rawKb < 200, `stale index 不得计入 total: ${report.total.rawKb}`);
    assert.ok((report.chunks.index?.rawKb ?? 0) < 100, 'stale index 不得计入 index 聚合');
  } finally {
    cleanup(dir, path.dirname(base));
  }

  const over = makeDist({ sizes: { index: 700 } });
  const overBase = writeBaselineFile(makeBaseline());
  try {
    const r = runBudget(over.dir, { baseline: overBase });
    assert.ok(!r.ok, '当前 manifest 引用文件超限必须失败');
    assert.match(r.out, /index raw:/);
  } finally {
    cleanup(over.dir, path.dirname(overBase));
  }
});

test('真实 dist（已构建时）整体通过且 KaTeX-only 不含 JSXGraph', () => {
  const dist = path.join(root, 'apps/web/dist');
  if (!fs.existsSync(path.join(dist, '.vite/manifest.json'))) {
    // 未构建时跳过（build 门禁会先跑）
    return;
  }
  const r = runBudget(dist);
  assert.ok(r.ok, `真实 dist 必须通过预算: ${r.out.slice(-600)}`);
  assert.doesNotMatch(r.out, /禁用 chunk|FAIL/, '不允许路径级违规');
  // 直接断言报告数据：mathClassroomKatexOnly 增量集合不含 jsxgraph
  const reportPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'budget-real-')), 'r.json');
  try {
    const rr = runBudget(dist, { args: ['--report-json', reportPath] });
    assert.ok(rr.ok, rr.out);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const fams = report.routes.mathClassroomKatexOnly.requests.map((x) => x.family);
    assert.ok(!fams.includes('jsxgraph'), `KaTeX-only 不得含 jsxgraph: ${fams.join(', ')}`);
    // 拆分确已发生：mathGraph 不再有 mathviz 整包
    const gFams = report.routes.mathGraph.requests.map((x) => x.family);
    assert.ok(!gFams.includes('mathviz'), 'mathGraph 不得再出现 mathviz 整包');
  } finally {
    cleanup(path.dirname(reportPath));
  }
});
