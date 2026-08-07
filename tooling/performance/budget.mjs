#!/usr/bin/env node
/**
 * Bundle 性能预算（R3.2 修复版）。
 *
 * - chunk 名称统一：按文件前缀归组（index-* → "index"）。
 * - 对 mathviz / three / index / total 分别真实检查。
 * - 超限 exit 1；预算变更必须更新 budget.json 并写明理由。
 * - ARCH_BUDGET_DIST 可注入产物目录（失败测试用）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const budget = JSON.parse(
  fs.readFileSync(path.join(root, 'tooling/performance/budget.json'), 'utf8'),
);
const distDir = process.env.ARCH_BUDGET_DIST
  ? path.resolve(process.env.ARCH_BUDGET_DIST)
  : path.join(root, 'apps/web/dist/assets');
if (!fs.existsSync(distDir)) {
  console.error('[budget] dist 不存在，先运行 npm run build');
  process.exit(1);
}

/** chunk 前缀 → 配置名（index-* 统一归 "index"） */
function chunkName(file) {
  const base = file.split('-')[0];
  if (base === 'index') return 'index';
  return base;
}

const byName = new Map();
let total = 0;
for (const file of fs.readdirSync(distDir)) {
  if (!file.endsWith('.js')) continue;
  const size = fs.statSync(path.join(distDir, file)).size / 1024;
  total += size;
  const key = chunkName(file);
  byName.set(key, (byName.get(key) || 0) + size);
}

const violations = [];
for (const rule of budget.chunks) {
  const actual = byName.get(rule.name) ?? 0;
  if (actual > rule.maxKb) {
    violations.push(`${rule.name}: ${actual.toFixed(0)}kB > 预算 ${rule.maxKb}kB（${rule.note}）`);
  } else {
    console.log(`[budget] ${rule.name}: ${actual.toFixed(0)}kB <= ${rule.maxKb}kB`);
  }
}
if (total > budget.totalMaxKb) {
  violations.push(`total: ${total.toFixed(0)}kB > 预算 ${budget.totalMaxKb}kB`);
} else {
  console.log(`[budget] total: ${total.toFixed(0)}kB <= ${budget.totalMaxKb}kB`);
}

if (violations.length) {
  console.error('[budget] 性能预算超限：');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
