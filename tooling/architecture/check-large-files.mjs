#!/usr/bin/env node
/**
 * 大文件预算门禁（G3）：新增 >400 行文件必须有结构预算或拆分计划。
 *
 * - 扫描 apps/{web,server,desktop}/src 的 .js/.ts，行数 >400 的文件必须在
 *   large-file-budget.json 登记（类别 + 拆分计划），否则失败。
 * - 已登记文件行数超登记值 +15% 视为预算膨胀，失败（提示更新登记）。
 * - 登记表残留（文件已不存在或已 ≤400 行）失败（提示清理登记）。
 * - 类别白名单：entry / data / seed / shell / controller / logic / view /
 *   adapter / service——新增登记只能使用这些类别并写明拆分计划。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const BUDGET_PATH = path.join(scriptDir, 'large-file-budget.json');
const LIMIT = 400;
const GROWTH_TOLERANCE = 1.15;

const ALLOWED_CATEGORIES = new Set([
  'entry',
  'data',
  'seed',
  'shell',
  'controller',
  'logic',
  'view',
  'adapter',
  'service',
]);

function collectSources() {
  const files = [];
  for (const app of ['web', 'server', 'desktop']) {
    const srcRoot = path.join(repoRoot, 'apps', app, 'src');
    if (!fs.existsSync(srcRoot)) continue;
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'dist', 'public', 'data'].includes(e.name)) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.js') || e.name.endsWith('.ts')) files.push(full);
      }
    };
    walk(srcRoot);
  }
  return files;
}

function lineCount(file) {
  return fs.readFileSync(file, 'utf8').split('\n').length;
}

const budget = JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8'));
const problems = [];

/** 登记表相对路径（web/... server/... desktop/...）→ 仓库绝对路径（apps/...）。 */
function budgetPathToFull(rel) {
  const [app, ...rest] = rel.split('/');
  return path.join(repoRoot, 'apps', app, ...rest);
}

// 1. 现有大文件必须登记 + 类别合法 + 行数未超预算容差
for (const file of collectSources()) {
  const rel = path.relative(repoRoot, file).split(path.sep).join('/').replace(/^apps\//, '');
  const lines = lineCount(file);
  if (lines <= LIMIT) continue;
  const entry = budget[rel];
  if (!entry) {
    problems.push(`>${LIMIT} 行未登记预算: ${rel}（${lines} 行）——请拆分子模块或在 tooling/architecture/large-file-budget.json 登记类别+拆分计划`);
    continue;
  }
  if (!ALLOWED_CATEGORIES.has(entry.category)) {
    problems.push(`登记类别非法: ${rel} -> ${entry.category}（允许: ${[...ALLOWED_CATEGORIES].join('/')}）`);
  }
  if (!entry.plan || typeof entry.plan !== 'string' || entry.plan.length < 8) {
    problems.push(`登记缺少拆分计划说明: ${rel}`);
  }
  const registeredLines = Number(entry.lines);
  if (Number.isFinite(registeredLines) && lines > Math.round(registeredLines * GROWTH_TOLERANCE)) {
    problems.push(`预算膨胀: ${rel} ${registeredLines} → ${lines} 行（超 +15%），请拆分或更新登记`);
  }
}

// 2. 登记表残留（文件已不存在 / 已 ≤400 行）必须清理
for (const rel of Object.keys(budget)) {
  const full = budgetPathToFull(rel);
  if (!fs.existsSync(full)) {
    problems.push(`登记残留（文件不存在）: ${rel}——请从 large-file-budget.json 删除`);
    continue;
  }
  if (lineCount(full) <= LIMIT) {
    problems.push(`登记残留（已 ≤${LIMIT} 行）: ${rel}——请从 large-file-budget.json 删除`);
  }
}

if (problems.length) {
  console.error(`[large-files] ${problems.length} 处违反大文件预算门禁：`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`[large-files] OK：${Object.keys(budget).length} 个 >${LIMIT} 行文件均有预算登记，无膨胀/残留`);
