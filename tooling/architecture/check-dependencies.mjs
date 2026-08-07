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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'tooling/architecture/rules.json'), 'utf8'));

/** 收集可扫描源码文件（排除生成/依赖目录） */
function collectSources() {
  const results = [];
  const ignoreDirs = new Set(['node_modules', 'dist', 'public', 'data', '.electron-stage']);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignoreDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|cjs)$/.test(entry.name)) results.push(full);
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

/** 相对导入解析到真实文件（补 .js 扩展名） */
function resolveRelative(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, path.join(base, 'index.js')];
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
  if (/export\s+\*(?!\s*as\b)/.test(src)) {
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

if (violations.length) {
  console.error(`[architecture] ${violations.length} 处依赖方向违规：`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log(`[architecture] OK：${sources.length} 个源文件，无依赖方向违规`);
