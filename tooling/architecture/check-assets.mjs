#!/usr/bin/env node
/**
 * 资源清单与检查（R3.3 增强版；spec §17）。
 *
 * 检查模式（默认）：
 * - JS/TS/CSS 中 /assets/ 与 url() 引用必须存在。
 * - 主题封面五套齐全（错误变体检测）。
 * - 重复大文件（采样 hash）。
 * 清单模式（--manifest）：生成 assets-manifest.json（相对路径，可重复）：
 *   id/path/format/size/hash/owner/themeVariants/source/license/preloadPolicy/fallback
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.ARCH_ROOT
  ? path.resolve(process.env.ARCH_ROOT)
  : path.resolve(scriptDir, '../..');
const publicDir = path.join(root, 'apps/web/public');
const manifestMode = process.argv.includes('--manifest');
const violations = [];
let checked = 0;

/** 扫描源码引用（JS/TS/CSS） */
function collectSourceFiles() {
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'public') continue;
      if (e.isDirectory()) walk(full);
      else if (/\.(css|js|mjs|cjs|ts|tsx)$/.test(e.name)) files.push(full);
    }
  };
  walk(path.join(root, 'apps/web/src'));
  walk(path.join(root, 'packages'));
  return files;
}

function referencesExist() {
  for (const f of collectSourceFiles()) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(root, f);
    // 字符串引用 /assets/...
    for (const m of src.matchAll(/['"](\/assets\/[^'"]+)['"]/g)) {
      checked += 1;
      if (!fs.existsSync(path.join(publicDir, m[1].replace(/^\//, '')))) {
        violations.push(`缺失资源: ${m[1]}（引用自 ${rel}）`);
      }
    }
    // CSS url() 引用
    if (f.endsWith('.css')) {
      for (const m of src.matchAll(/url\(\s*['"]?(\/assets\/[^'")]+)['"]?\s*\)/g)) {
        checked += 1;
        if (!fs.existsSync(path.join(publicDir, m[1].replace(/^\//, '')))) {
          violations.push(`缺失资源: ${m[1]}（CSS url 引用自 ${rel}）`);
        }
      }
    }
  }
}

function coversComplete() {
  const dir = path.join(publicDir, 'assets/subject-covers');
  if (!fs.existsSync(dir)) return;
  for (const subject of ['chemistry', 'math', 'physics', 'biology']) {
    for (let v = 1; v <= 5; v += 1) {
      const found = fs.readdirSync(dir).some((n) => n.startsWith(subject) && n.includes(`-v${v}`));
      if (!found) violations.push(`主题封面缺失: ${subject}-v${v}`);
    }
  }
}

function duplicates() {
  const seen = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(png|jpg|jpeg|webp)$/.test(e.name)) {
        const size = fs.statSync(full).size;
        if (size < 800 * 1024) continue;
        const fd = fs.openSync(full, 'r');
        const head = Buffer.alloc(64 * 1024);
        const tail = Buffer.alloc(64 * 1024);
        fs.readSync(fd, head, 0, head.length, 0);
        fs.readSync(fd, tail, 0, tail.length, Math.max(0, size - tail.length));
        fs.closeSync(fd);
        const hash = crypto.createHash('md5').update(head).update(tail).update(String(size)).digest('hex');
        if (seen.has(hash)) {
          violations.push(`重复大文件: ${path.relative(root, full)} 与 ${seen.get(hash)} 相同`);
        } else {
          seen.set(hash, path.relative(root, full));
        }
      }
    }
  };
  walk(path.join(publicDir, 'assets'));
}

/** 生成可重复清单（相对路径 + 稳定 owner/theme 推断） */
function generateManifest() {
  const entries = [];
  const walk = (dir, relDir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.posix.join(relDir, e.name);
      if (e.isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (!/\.(png|jpg|jpeg|webp|gif|svg|mp3|wav|json|glb|fbx)$/.test(e.name)) continue;
      const size = fs.statSync(full).size;
      const hash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex').slice(0, 16);
      const isCover = rel.includes('subject-covers');
      entries.push({
        id: rel,
        path: rel,
        format: path.extname(e.name).slice(1),
        size,
        hash,
        owner: rel.split('/')[1] || 'web',
        themeVariants: isCover ? [path.basename(rel).match(/v(\d)/)?.[1] || ''] : [],
        source: 'repo',
        license: 'unknown',
        preloadPolicy: 'lazy',
        fallback: null,
      });
    }
  };
  if (fs.existsSync(path.join(publicDir, 'assets'))) {
    walk(path.join(publicDir, 'assets'), 'assets');
  }
  const manifestPath = path.join(root, 'docs/engineering/assets-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), count: entries.length, entries }, null, 2) + '\n');
  console.log(`[assets] manifest 已生成：${entries.length} 项 → ${path.relative(root, manifestPath)}`);
}

if (manifestMode) {
  generateManifest();
  process.exit(0);
}

referencesExist();
coversComplete();
duplicates();

if (violations.length) {
  console.error(`[assets] ${violations.length} 处资源问题：`);
  for (const v of violations.slice(0, 30)) console.error('  ' + v);
  process.exit(1);
}
console.log(`[assets] OK：${checked} 处资源引用有效，主题封面齐全，无重复大文件`);
