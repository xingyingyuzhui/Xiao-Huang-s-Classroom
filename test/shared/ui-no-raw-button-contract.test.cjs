/**
 * UI 库采用门禁（计划 P7.2 前置部分）：math/graph 禁止新增「裸按钮拼 UI」危险模式。
 *
 * 扫描 apps/web/src/math/graph/** 下的 .js/.ts，命中以下任一模式即「命中」：
 *   1. 直接 `createElement('button')` 创建裸按钮（未走 @xiaohuang/ui createButton）；
 *   2. 模板字符串 innerHTML（反引号模板）中出现 `<button>` 标记（按钮以 HTML 字符串拼装注入）。
 *
 * 命中文件必须登记 docs/engineering/ui-legacy-allowlist.md 豁免；未登记即失败。
 * 豁免只消化存量：登记表内的文件是 P3（math/graph 迁移）等并行任务正在处理的现状，
 * 新增裸按钮代码（新文件或未登记文件）一律失败，防止模式继续蔓延。
 *
 * 说明：豁免以 allowlist 登记为准。计划规定豁免还需文件头 `// ui-legacy: <reason>`
 * 注释，但 P7 前置阶段不触碰 math/graph 生产文件（P3 并行迁移中），头部注释由迁移
 * 任务一并补齐——本测试对已登记文件缺注释只给提示、不判失败；登记文件不再命中模式
 * 时同样只提示「可移除登记」，清理由后续任务完成。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const SCOPE_DIR = 'apps/web/src/math/graph';
const ALLOWLIST_DOC = 'docs/engineering/ui-legacy-allowlist.md';

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

/** 范围内全部 .js/.ts 文件（相对仓库根）。 */
function scopeFiles() {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.(js|ts)$/.test(entry.name)) {
        files.push(path.relative(repoRoot, full));
      }
    }
  }
  walk(path.join(repoRoot, SCOPE_DIR));
  return files.sort();
}

// 裸按钮：直接 createElement('button')（大小写不敏感）。
const RAW_BUTTON_CREATE = /createElement\(\s*['"]button['"]\s*\)/i;
// 模板字符串 innerHTML：innerHTML 赋值后 400 字符内出现反引号模板（容忍跨行写法，
// 如 `host.innerHTML = list.map((x) => \`<button…>…`）。窗口有界，避免误跨多条语句。
const TEMPLATE_INNER_HTML = /innerHTML\s*=\s*[\s\S]{0,400}?`/;
// 模板中出现 <button> 标记。
const BUTTON_MARKUP = /<button[\s>]/i;
// 文件头豁免注释（前 10 行内）。
const UI_LEGACY_COMMENT = /^\/\/\s*ui-legacy:\s*\S+/m;

/**
 * 命中「裸按钮拼 UI」模式时返回命中描述，否则返回 null。
 * 命中 = 裸按钮创建（createElement('button')）或按钮标记进模板 innerHTML。
 */
function rawButtonHit(source) {
  if (RAW_BUTTON_CREATE.test(source)) return "createElement('button')";
  if (TEMPLATE_INNER_HTML.test(source) && BUTTON_MARKUP.test(source)) {
    return '<button> in template innerHTML';
  }
  return null;
}

/** 从豁免登记文档解析表格行，返回 { path, reason, removal } 列表（仅范围内的文件）。 */
function allowlistEntries() {
  const entries = [];
  for (const line of read(ALLOWLIST_DOC).split('\n')) {
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .split('|')
      .map((c) => c.trim().replace(/^`|`$/g, ''));
    if (cells.length < 3 || !cells[0].startsWith(SCOPE_DIR)) continue;
    entries.push({ file: cells[0], reason: cells[1] || '', removal: cells[2] || '' });
  }
  return entries;
}

test('P7.2 scope: allowlist doc exists and references real files under math/graph', () => {
  assert.ok(fs.existsSync(path.join(repoRoot, ALLOWLIST_DOC)), `missing ${ALLOWLIST_DOC}`);
  const scope = new Set(scopeFiles());
  for (const entry of allowlistEntries()) {
    assert.ok(scope.has(entry.file), `allowlist references file outside scope: ${entry.file}`);
    assert.ok(entry.reason, `allowlist entry missing reason: ${entry.file}`);
    assert.ok(entry.removal, `allowlist entry missing removal condition: ${entry.file}`);
  }
});

test('P7.2 gate: raw-button hits in math/graph must be exempted in ui-legacy-allowlist', () => {
  const allowed = new Set(allowlistEntries().map((e) => e.file));
  const offenders = [];
  const exempted = [];
  for (const file of scopeFiles()) {
    const hit = rawButtonHit(read(file));
    if (!hit) continue;
    if (allowed.has(file)) exempted.push(file);
    else offenders.push(`${file} (${hit})`);
  }
  assert.deepEqual(
    offenders,
    [],
    `raw-button pattern without allowlist exemption (register in ${ALLOWLIST_DOC} or migrate):\n` +
      offenders.join('\n'),
  );
  if (exempted.length) {
    console.log(`[ui-no-raw-button] exempted (${exempted.length}): ${exempted.join(', ')}`);
  }
});

test('P7.2 hygiene: exempted files missing header comment / stale entries are reported for cleanup', () => {
  const allowed = new Set(allowlistEntries().map((e) => e.file));
  const notes = [];
  for (const file of allowlistEntries().map((e) => e.file)) {
    const source = read(file);
    const hit = rawButtonHit(source);
    if (!hit) {
      notes.push(`${file}: no longer matches raw-button pattern — remove allowlist entry`);
    } else if (!UI_LEGACY_COMMENT.test(source.slice(0, 1200))) {
      notes.push(`${file}: add header comment "// ui-legacy: <reason>" during migration`);
    }
  }
  if (notes.length) {
    console.log(`[ui-no-raw-button] cleanup notes:\n  ${notes.join('\n  ')}`);
  }
});
