/**
 * 架构检查器 fixture 测试（R3.1）：
 * 注入违规 TS 文件（packages → apps 反向导入）必须被检出失败。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

test('架构检查器检出违规 TS 文件（packages → apps 反向导入）', () => {
  // 临时目录构造违规结构：packages/violation/src/bad.ts 导入 apps/web
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-fixture-'));
  const pkgDir = path.join(dir, 'packages', 'violation', 'src');
  const appsDir = path.join(dir, 'apps', 'web', 'src');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.mkdirSync(appsDir, { recursive: true });
  fs.writeFileSync(path.join(appsDir, 'target.js'), 'export const x = 1;\n');
  fs.writeFileSync(
    path.join(pkgDir, 'bad.ts'),
    "import { x } from '../../../apps/web/src/target.js';\nexport const y = x;\n",
  );
  // 在临时目录用真实规则跑检查器（规则文件相对路径基于脚本自身）
  try {
    execFileSync(
      process.execPath,
      [path.join(root, 'tooling/architecture/check-dependencies.mjs')],
      { cwd: dir, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ARCH_ROOT: dir } },
    );
    assert.fail('违规 TS 必须被检出');
  } catch (err) {
    const out = String(err.stdout || '') + String(err.stderr || '');
    assert.match(out, /packages.*禁止.*apps|packages.*apps/, `输出应报告 packages→apps 违规: ${out.slice(0, 200)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('架构检查器检出循环依赖', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-cycle-'));
  const srcDir = path.join(dir, 'packages', 'cyc', 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'a.ts'), "import { b } from './b.js';\nexport const a = 1;\n");
  fs.writeFileSync(path.join(srcDir, 'b.ts'), "import { a } from './a.js';\nexport const b = 2;\n");
  try {
    execFileSync(
      process.execPath,
      [path.join(root, 'tooling/architecture/check-dependencies.mjs')],
      { cwd: dir, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ARCH_ROOT: dir } },
    );
    assert.fail('循环依赖必须被检出');
  } catch (err) {
    const out = String(err.stdout || '') + String(err.stderr || '');
    assert.match(out, /循环依赖/, `输出应报告循环依赖: ${out.slice(0, 200)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
