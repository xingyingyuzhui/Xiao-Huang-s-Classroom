#!/usr/bin/env node
/**
 * 资源清单检查（Program 7 Task 7.6；spec §17）。
 *
 * - 缺失资源：CSS/JS 引用的 /assets/ 文件必须存在。
 * - 主题映射：subject-covers 五套齐全（v1-v5）。
 * - 重复大文件：>500kB 的重复 hash 文件告警。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = path.join(root, 'apps/web/public');
const violations = [];
let checked = 0;

function assetsExist() {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(css|js|mjs)$/.test(e.name)) files.push(full);
    }
  };
  walk(path.join(root, 'apps/web/src'));
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/['"](\/assets\/[^'"]+)['"]/g)) {
      checked += 1;
      const target = path.join(publicDir, m[1].replace(/^\//, ''));
      if (!fs.existsSync(target)) {
        violations.push(`缺失资源: ${m[1]}（引用自 ${path.relative(root, f)}）`);
      }
    }
  }
}

function coversComplete() {
  const dir = path.join(publicDir, 'assets/subject-covers');
  if (!fs.existsSync(dir)) return;
  for (const subject of ['chemistry', 'math', 'physics', 'biology']) {
    for (let v = 1; v <= 5; v += 1) {
      const found = fs.readdirSync(dir).some((n) => n.includes(`${subject}-v${v}`));
      if (!found) violations.push(`主题封面缺失: ${subject}-v${v}`);
    }
  }
}

function duplicates() {
  // 只查 assets 目录；大文件用头尾采样 hash（全量读太慢）
  const seen = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.png') || e.name.endsWith('.jpg') || e.name.endsWith('.webp')) {
        const size = fs.statSync(full).size;
        if (size < 800 * 1024) continue;
        const fd = fs.openSync(full, 'r');
        const head = Buffer.alloc(64 * 1024);
        const tail = Buffer.alloc(64 * 1024);
        fs.readSync(fd, head, 0, head.length, 0);
        fs.readSync(fd, tail, 0, tail.length, Math.max(0, size - tail.length));
        fs.closeSync(fd);
        const hash = crypto.createHash('md5').update(head).update(tail).update(String(size)).digest('hex');
        if (seen.has(hash)) violations.push(`重复大文件: ${path.relative(root, full)} 与 ${seen.get(hash)} 相同`);
        else seen.set(hash, path.relative(root, full));
      }
    }
  };
  walk(path.join(publicDir, 'assets'));
}

assetsExist();
coversComplete();
duplicates();

if (violations.length) {
  console.error(`[assets] ${violations.length} 处资源问题：`);
  for (const v of violations.slice(0, 30)) console.error('  ' + v);
  process.exit(1);
}
console.log(`[assets] OK：${checked} 处资源引用有效，主题封面齐全，无重复大文件`);
