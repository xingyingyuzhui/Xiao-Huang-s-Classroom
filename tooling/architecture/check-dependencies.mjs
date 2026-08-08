#!/usr/bin/env node
/**
 * 依赖方向门禁（Program 1 Task 1.6）。
 *
 * 扫描 apps/packages 下全部源码的 import/require 语句，解析相对导入的
 * 真实目标，按 tooling/architecture/rules.json 的 forbidden 规则判定违规；
 * 同时检查禁止 export * 的文件。违规输出并 exit 1。
 *
 * 用法：node tooling/architecture/check-dependencies.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 默认 root 为仓库根；fixture 测试用 ARCH_ROOT 注入临时目录
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.ARCH_ROOT
  ? path.resolve(process.env.ARCH_ROOT)
  : path.resolve(scriptDir, '../..');
// 规则文件始终从脚本自身位置读取（不随 ARCH_ROOT）
const rules = JSON.parse(fs.readFileSync(path.join(scriptDir, 'rules.json'), 'utf8'));

/** 收集可扫描源码文件（排除生成/依赖目录） */
function collectSources() {
  const results = [];
  const ignoreDirs = new Set(['node_modules', 'dist', 'public', 'data', '.electron-stage', 'coverage']);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignoreDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|cjs|ts|tsx)$/.test(entry.name)) results.push(full);
    }
  };
  for (const base of ['apps', 'packages']) {
    const full = path.join(root, base);
    if (fs.existsSync(full)) walk(full);
  }
  return results;
}

/** 提取文件的 import/require 目标（相对/包名），返回 {specifier, line} 列表 */
function extractImports(src) {
  const imports = [];
  // ES import ... from 'x' / import 'x'
  const esm = /(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  // require('x') / import('x')
  const req = /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [esm, req]) {
    let m;
    while ((m = re.exec(src)) !== null) {
      const line = src.slice(0, m.index).split('\n').length;
      imports.push({ specifier: m[1], line });
    }
  }
  return imports;
}

/** 相对导入解析到真实文件（补扩展名、index、TS 源码 .js→.ts 惯例） */
function resolveRelative(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.js`, `${base}.mjs`, `${base}.cjs`,
    `${base}.ts`, `${base}.tsx`,
    path.join(base, 'index.js'), path.join(base, 'index.ts'),
  ];
  // TS 源码惯例：import './x.js' 实际文件是 x.ts（ESM 类型解析）
  if (/\.(js|mjs|cjs)$/.test(base)) {
    candidates.push(
      base.replace(/\.(js|mjs|cjs)$/, '.ts'),
      base.replace(/\.(js|mjs|cjs)$/, '.tsx'),
    );
  }
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function relToRoot(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

const violations = [];
const sources = collectSources();

for (const file of sources) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = relToRoot(file);

  // export * 检查（裸 export * 有歧义；export * as X 命名空间重导出无歧义，允许）
  // 先剥离注释，避免注释文字误报
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  if (/export\s+\*(?!\s*as\b)/.test(codeOnly)) {
    const allowed = rules.noExportStar?.files?.includes(rel) || false;
    if (!allowed) {
      violations.push(`${rel}: 禁止 export *（公共兼容入口需显式具名导出）`);
    }
  }

  for (const { specifier, line } of extractImports(src)) {
    if (!specifier.startsWith('.')) continue; // 包名/裸导入跳过
    const target = resolveRelative(file, specifier);
    if (!target) continue; // 无法解析（可能指向非 js 资源）
    const targetRel = relToRoot(target);
    for (const rule of rules.forbidden || []) {
      if (rel.startsWith(rule.from) && targetRel.startsWith(rule.to)) {
        violations.push(`${rel}:${line} 导入 ${targetRel} —— ${rule.reason}`);
      }
    }
  }
}

/** 循环依赖检测：模块图 DFS 找环（只报告第一个环路径） */
function findCycle(files) {
  const graph = new Map();
  for (const f of files) {
    const rel = relToRoot(f);
    const deps = new Set();
    const src = fs.readFileSync(f, 'utf8');
    for (const { specifier } of extractImports(src)) {
      if (!specifier.startsWith('.')) continue;
      const target = resolveRelative(f, specifier);
      if (target) deps.add(relToRoot(target));
    }
    graph.set(rel, deps);
  }
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const dfs = (node) => {
    if (visiting.has(node)) {
      const idx = stack.indexOf(node);
      return [...stack.slice(idx), node];
    }
    if (visited.has(node)) return null;
    visiting.add(node);
    stack.push(node);
    for (const dep of graph.get(node) || []) {
      const cycle = dfs(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  };
  for (const node of graph.keys()) {
    const cycle = dfs(node);
    if (cycle) return cycle;
  }
  return null;
}

const cycle = findCycle(sources);
if (cycle) {
  violations.push(`循环依赖: ${cycle.join(' → ')}`);
}

if (violations.length) {
  console.error(`[architecture] ${violations.length} 处依赖方向违规：`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log(`[architecture] OK：${sources.length} 个源文件，无依赖方向违规与循环依赖`);
