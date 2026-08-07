#!/usr/bin/env node
/**
 * Bundle 性能预算（Program 7 Task 7.3；spec §14）。
 * 对 apps/web/dist/assets 各 chunk 与 budget.json 阈值比较；
 * 超限 exit 1（预算变更必须写明理由，更新 budget.json）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const budget = JSON.parse(
  fs.readFileSync(path.join(root, 'tooling/performance/budget.json'), 'utf8'),
);
const distDir = path.join(root, 'apps/web/dist/assets');
if (!fs.existsSync(distDir)) {
  console.error('[budget] dist 不存在，先运行 npm run build');
  process.exit(1);
}

const byName = new Map();
let total = 0;
for (const file of fs.readdirSync(distDir)) {
  if (!file.endsWith('.js')) continue;
  const size = fs.statSync(path.join(distDir, file)).size / 1024;
  total += size;
  const base = file.split('-')[0];
  const key = base === 'index' ? 'index (hub)' : base;
  if (byName.has(key)) byName.set(key, byName.get(key) + size);
  else byName.set(key, size);
}

const violations = [];
for (const rule of budget.chunks) {
  const actual = byName.get(rule.name) ?? 0;
  if (actual > rule.maxKb) {
    violations.push(`${rule.name}: ${actual.toFixed(0)}kB > 预算 ${rule.maxKb}kB（${rule.note}）`);
  }
}
if (total > budget.totalMaxKb) {
  violations.push(`total: ${total.toFixed(0)}kB > 预算 ${budget.totalMaxKb}kB`);
}

if (violations.length) {
  console.error('[budget] 性能预算超限：');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log(`[budget] OK：total=${total.toFixed(0)}kB（预算 ${budget.totalMaxKb}kB）`);
