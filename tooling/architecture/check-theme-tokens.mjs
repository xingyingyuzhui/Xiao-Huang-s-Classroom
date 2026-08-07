#!/usr/bin/env node
/**
 * 主题令牌门禁（Program 3 Task 3.8）。
 *
 * 规则：feature 样式（themes/ 之外的 CSS）禁止按主题 id 写业务分支硬编码颜色
 * （应为语义 var(--token)）；直接硬编码的十六进制/rgb 颜色登记允许清单
 * （阴影/半透明覆盖等非主题色），新增硬编码即失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stylesDir = path.join(root, 'apps/web/src/shared/styles');
const themesDir = path.join(stylesDir, 'themes');
const allowlistFile = path.join(root, 'tooling/architecture/theme-color-allowlist.json');

const allowlist = JSON.parse(fs.readFileSync(allowlistFile, 'utf8'));
const violations = [];
let scanned = 0;

/** 递归收集 CSS 文件（排除 themes/ 与生成目录） */
function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'themes' || entry.name === 'node_modules') continue;
      collect(full, out);
    } else if (entry.name.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_COLOR = /\b(?:rgb|rgba|hsl|hsla)\([^)]*\)/g;

for (const file of collect(stylesDir)) {
  scanned += 1;
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');

  // 规则 1：业务分支按主题 id 硬编码颜色
  let inThemeBranch = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/data-theme\s*=/.test(line)) inThemeBranch = true;
    else if (/^\s*}/.test(line)) inThemeBranch = false;
    if (!inThemeBranch) continue;
    // 自定义属性声明（--xxx: value）是主题变量定义，豁免；直接使用才违规
    if (/--[a-z0-9-]+\s*:/.test(line)) continue;
    const colors = [...line.matchAll(HEX_COLOR)].map((m) => m[0]);
    if (colors.length) {
      violations.push(
        `${path.relative(root, file)}:${i + 1} 主题分支硬编码颜色 ${colors.join(',')}`,
      );
    }
  }

  // 规则 2：硬编码颜色必须在允许清单（按文件 + 颜色值）
  const rel = path.relative(root, file);
  for (let i = 0; i < lines.length; i += 1) {
    for (const m of lines[i].matchAll(HEX_COLOR)) {
      const color = m[0].toLowerCase();
      const allowed = allowlist.some((a) => a.file === rel && a.color === color);
      if (!allowed) {
        violations.push(
          `${rel}:${i + 1} 硬编码颜色 ${color} 未登记（加入 allowlist 或改用 var(--token)）`,
        );
      }
    }
  }
}

if (violations.length) {
  console.error(`[theme-tokens] ${violations.length} 处违规（扫描 ${scanned} 个 CSS）：`);
  for (const v of violations.slice(0, 40)) console.error('  ' + v);
  if (violations.length > 40) console.error(`  … 还有 ${violations.length - 40} 处`);
  process.exit(1);
}
console.log(`[theme-tokens] OK：${scanned} 个 CSS 无主题硬编码违规`);
