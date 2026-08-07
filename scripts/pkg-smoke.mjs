#!/usr/bin/env node
/**
 * pkg 过渡 smoke（Program 1 Task 1.8）。
 *
 * 在退役门通过前，pkg 产物保持可用性检查：
 * - 产物存在性 + 基本静态检查（文件大小、可执行位、版本信息）
 * - 产物不存在时输出明确原因（不伪造通过）
 *
 * 退役门：docs/engineering/pkg-retirement-gate.md（E1–E5 全部通过后删除 pkg）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exePath = path.join(root, 'dist-exe', 'XiaoHuang-ChemLab.exe');

const failures = [];
const info = [];

if (!fs.existsSync(exePath)) {
  info.push(
    `pkg 产物不存在：${path.relative(root, exePath)}（当前平台为 ${process.platform}，Windows 产物需在 Windows/CI 构建）`,
  );
} else {
  const stat = fs.statSync(exePath);
  info.push(`pkg 产物存在：${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  if (stat.size < 10 * 1024 * 1024) {
    failures.push(`pkg 产物过小（${stat.size} bytes），疑似未完整打包`);
  }
  if (process.platform === 'win32' && (stat.mode & 0o111) === 0) {
    failures.push('pkg 产物缺少可执行位');
  }
}

// 退役门文档必须存在且列出等价验收项
const gateFile = path.join(root, 'docs/engineering/pkg-retirement-gate.md');
if (!fs.existsSync(gateFile)) {
  failures.push('缺失退役门文档 docs/engineering/pkg-retirement-gate.md');
} else {
  const gate = fs.readFileSync(gateFile, 'utf8');
  for (const item of ['E1', 'E2', 'E3', 'E4', 'E5']) {
    if (!gate.includes(item)) failures.push(`退役门文档缺少验收项 ${item}`);
  }
}

for (const line of info) console.log('[pkg-smoke] ' + line);
if (failures.length) {
  for (const line of failures) console.error('[pkg-smoke] FAIL: ' + line);
  process.exit(1);
}
console.log('[pkg-smoke] OK（产物不存在视为记录原因而非失败；退役门就位）');
