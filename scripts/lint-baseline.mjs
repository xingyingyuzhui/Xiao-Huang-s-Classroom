#!/usr/bin/env node
/**
 * lint-baseline：全仓 ESLint 问题计数快照与门禁。
 *
 * 用法：
 *   node scripts/lint-baseline.mjs --snapshot   # 记录当前问题计数（按 ruleId）
 *   node scripts/lint-baseline.mjs              # 与快照比较，任何规则计数增长 → exit 1
 *
 * 旧问题逐阶段清零（Program 7）；lint:all 用于 CI 断言不新增问题。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotFile = path.join(root, 'docs/engineering/lint-baseline.json');
const snapshot = process.argv.includes('--snapshot');

/** 全仓 eslint JSON 输出 → { [ruleId]: count, total }（eslint 退出码非零时 stdout 仍含完整 JSON） */
function collect() {
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
  const perRule = {};
  let total = 0;
  for (const file of JSON.parse(out)) {
    for (const msg of file.messages) {
      const key = msg.ruleId || '(parse-error)';
      perRule[key] = (perRule[key] || 0) + 1;
      total += 1;
    }
  }
  return { perRule, total };
}

const current = collect();

if (snapshot) {
  fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
  fs.writeFileSync(
    snapshotFile,
    JSON.stringify({ capturedAt: new Date().toISOString(), total: current.total, perRule: current.perRule }, null, 2) + '\n',
  );
  console.log(`[lint-baseline] snapshot 已记录：total=${current.total}`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
const regressions = [];
for (const [rule, count] of Object.entries(current.perRule)) {
  const prev = baseline.perRule?.[rule] || 0;
  if (count > prev) regressions.push(`${rule}: ${prev} → ${count}`);
}
if (regressions.length) {
  console.error('[lint-baseline] 新增 lint 问题（相对快照）：');
  for (const line of regressions) console.error('  ' + line);
  console.error(`[lint-baseline] total: ${baseline.total} → ${current.total}`);
  process.exit(1);
}
console.log(`[lint-baseline] OK：问题数未增长（total=${current.total}，快照=${baseline.total}）`);
