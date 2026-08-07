#!/usr/bin/env node
/**
 * Apps（web/server/desktop）迁移期 typecheck 策略（R1.1）。
 *
 * - 每个 app 的 tsconfig.json 必须存在（策略文档化）。
 * - 扫描 src/ 与 test/ 下 TS 文件；有 TS 则真实执行 tsc --noEmit。
 * - 无 TS 时报告迁移状态（JS 文件数），退出 0——检查"无 TS"是真实事实，
 *   不冒充检查（有 TS 时立即走真实 tsc）。
 * - JS 文件由 docs/engineering/js-allowlist.md 跟踪（R8），迁移目录时
 *   在 tsconfig 开启 checkJs。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apps = ['web', 'server', 'desktop'];
let failed = false;

for (const app of apps) {
  const appDir = path.join(root, 'apps', app);
  const tsconfig = path.join(appDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfig)) {
    console.error(`[typecheck] ${app}: 缺少 tsconfig.json（迁移期策略要求存在）`);
    failed = true;
    continue;
  }
  const tsFiles = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'public') continue;
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) tsFiles.push(full);
    }
  };
  walk(path.join(appDir, 'src'));
  walk(path.join(appDir, 'test'));

  if (tsFiles.length === 0) {
    console.log(`[typecheck] ${app}: 迁移期无 TS 文件（JS 由 js-allowlist 跟踪，R8 迁移）`);
    continue;
  }
  try {
    execFileSync(
      process.execPath,
      [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', tsconfig],
      { cwd: appDir, stdio: 'inherit' },
    );
    console.log(`[typecheck] ${app}: ${tsFiles.length} 个 TS 文件检查通过`);
  } catch {
    failed = true;
  }
}

if (failed) process.exit(1);
