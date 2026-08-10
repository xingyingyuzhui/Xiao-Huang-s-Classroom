#!/usr/bin/env node
/**
 * lint-baseline：全仓 ESLint 问题文件级指纹快照与门禁（2026-08-10 计划 Task 5，v2）。
 *
 * 用法：
 *   node scripts/lint-baseline.mjs --snapshot   # 记录当前问题指纹账本（v2 schema）
 *   node scripts/lint-baseline.mjs              # 与快照比较，任何指纹回归 → exit 1
 *
 * 保证（不再按 rule 全仓总量抵消）：
 *   - 指纹 = relativePath :: ruleId :: normalizedMessage :: sha256(源码上下文)，
 *     不保存行号；同指纹多次出现保留 count；
 *   - 删除旧问题允许；新文件、新 rule/message、新源码上下文或同指纹 count 增加
 *     都会失败；perRule 只用于报告，失败以 entries 为准；
 *   - 运行时安全规则由 lint:critical 单独零容忍，baseline 只负责其余历史债。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectEntries, diffEntries } from '../tooling/quality/lint-baseline-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotFile = path.join(root, 'docs/engineering/lint-baseline.json');
const snapshot = process.argv.includes('--snapshot');

/** 全仓 eslint JSON 输出（eslint 退出码非零时 stdout 仍含完整 JSON） */
function runEslintJson() {
  let out;
  try {
    out = execFileSync(
      process.execPath,
      [path.join(root, 'node_modules/eslint/bin/eslint.js'), '.', '--format', 'json'],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (err) {
    out = /** @type {string} */ (err.stdout);
  }
  return JSON.parse(out);
}

const current = collectEntries(runEslintJson(), root);

if (snapshot) {
  fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
  fs.writeFileSync(
    snapshotFile,
    JSON.stringify(
      {
        version: 2,
        capturedAt: new Date().toISOString(),
        total: current.total,
        perRule: current.perRule,
        entries: current.entries,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `[lint-baseline] snapshot 已记录（v2）：total=${current.total}，指纹键=${Object.keys(current.entries).length}`,
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
} catch (err) {
  console.error(`[lint-baseline] 无法读取快照 ${snapshotFile}：${err.message}`);
  process.exit(2);
}
if (baseline.version !== 2 || typeof baseline.entries !== 'object' || baseline.entries === null) {
  console.error(
    '[lint-baseline] 快照不是 v2（缺少 entries 指纹账本），请先运行 node scripts/lint-baseline.mjs --snapshot 重建',
  );
  process.exit(2);
}

const regressions = diffEntries(baseline.entries, current.entries);

// perRule 只用于报告：列出与本轮有差异的 rule 计数，不参与失败判定
const ruleNames = new Set([
  ...Object.keys(baseline.perRule || {}),
  ...Object.keys(current.perRule),
]);
const ruleDeltas = [];
for (const rule of ruleNames) {
  const prev = baseline.perRule?.[rule] || 0;
  const now = current.perRule[rule] || 0;
  if (now !== prev) ruleDeltas.push(`${rule}: ${prev} → ${now}${now > prev ? ' (↑)' : ' (↓)'}`);
}

if (regressions.length) {
  console.error('[lint-baseline] 新增 lint 问题（文件级指纹，相对快照）：');
  for (const { fingerprint, prev, count } of regressions) {
    console.error(`  ${fingerprint}`);
    console.error(`    baseline=${prev} → current=${count}`);
  }
  console.error(`[lint-baseline] total: ${baseline.total} → ${current.total}`);
  if (ruleDeltas.length) {
    console.error(
      `[lint-baseline] perRule 变化（仅报告，不判失败）：\n  ${ruleDeltas.join('\n  ')}`,
    );
  }
  process.exit(1);
}
if (ruleDeltas.length) {
  console.log(`[lint-baseline] perRule 变化（仅报告）：\n  ${ruleDeltas.join('\n  ')}`);
}
console.log(
  `[lint-baseline] OK：文件级指纹无新增（total=${current.total}，快照=${baseline.total}）`,
);
