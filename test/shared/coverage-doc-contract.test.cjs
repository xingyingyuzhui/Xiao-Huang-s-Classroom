/**
 * Coverage 文档一致性合同（六轮增强版）。
 *
 * 动态读取全部 coverage workspace：
 * 1. 文档必须包含每个 workspace 的行。
 * 2. 文档声明的强制阈值与各 vitest.config.ts thresholds 完全一致。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

function discoverCoverageWorkspaces() {
  const out = [];
  for (const name of fs.readdirSync(path.join(root, 'packages'))) {
    const pkgPath = path.join(root, 'packages', name, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (typeof pkg.scripts?.coverage === 'string') out.push(name);
  }
  return out.sort();
}

/** 从 vitest.config.ts 提取 thresholds → { statements: 80, branches: 90, ... } */
function configThresholds(name) {
  const cfg = fs.readFileSync(path.join(root, 'packages', name, 'vitest.config.ts'), 'utf8');
  const out = {};
  for (const m of cfg.matchAll(/(statements|branches|functions|lines): (\d+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

/** 从文档表格行解析声明阈值 → { statements: 80, ... } */
function docThresholds(line) {
  const cols = line.split('|').map((s) => s.trim());
  // 行首尾 | 产生空列：阈值在倒数第 2 列
  // 格式："stmts≥80、branches≥90" 或 "stmts≥65（branches/funcs/lines 为观察指标）"
  const out = {};
  const cell = cols[cols.length - 2] || '';
  const names = { stmts: 'statements', branches: 'branches', funcs: 'functions', lines: 'lines' };
  for (const m of cell.matchAll(/(stmts|branches|funcs|lines)≥(\d+)/g)) {
    out[names[m[1]]] = Number(m[2]);
  }
  return out;
}

test('文档包含全部 coverage workspace 且声明阈值与配置一致', () => {
  const doc = fs.readFileSync(path.join(root, 'docs/engineering/coverage-baseline.md'), 'utf8');
  const workspaces = discoverCoverageWorkspaces();
  assert.ok(workspaces.length >= 9, `至少 9 个 coverage workspace（实际 ${workspaces.length}）`);
  for (const name of workspaces) {
    const lineMatch = doc.match(new RegExp(`\\|\\s*${name}\\s+\\|.*`));
    assert.ok(lineMatch, `文档必须含 ${name} 行`);
    const cfg = configThresholds(name);
    const declared = docThresholds(lineMatch[0]);
    assert.ok(Object.keys(declared).length > 0, `${name} 文档必须声明强制阈值`);
    // 配置中每个阈值都必须在文档中一致声明
    for (const [metric, value] of Object.entries(cfg)) {
      assert.equal(
        declared[metric],
        value,
        `${name} 文档 ${metric}≥${declared[metric]} 与配置 ${value} 不一致`,
      );
    }
    // 文档不得把未配置的指标写成强制（文档声明 ⊆ 配置）
    for (const metric of Object.keys(declared)) {
      assert.equal(cfg[metric], declared[metric], `${name} 文档声明 ${metric} 不在配置中`);
    }
  }
});
