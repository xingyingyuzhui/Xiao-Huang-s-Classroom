/**
 * 资源 registry 合同（7.6 补齐）：
 * 1. 孤儿资源检测：未登记封面家族的资源必须被检出。
 * 2. manifest 漂移检测：新增资源未登记 → 失败；登记后通过。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

const script = path.join(root, 'tooling/architecture/check-assets.mjs');

test('孤儿资源被检出（未登记封面家族 + 未被引用的资源）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-assets-'));
  const publicDir = path.join(dir, 'apps/web/public');
  const srcDir = path.join(dir, 'apps/web/src');
  fs.mkdirSync(path.join(publicDir, 'assets/orphans'), { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'assets/subject-covers'), { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });
  // 孤儿资源：无源码引用 + 非登记封面
  fs.writeFileSync(path.join(publicDir, 'assets/orphans/ghost.png'), 'x');
  // 已登记封面（从真实 cover-urls 提取 stem 模拟）
  fs.writeFileSync(path.join(publicDir, 'assets/subject-covers/physics-cover-v1.png'), 'x');
  // manifest（登记孤儿 + 封面）
  fs.mkdirSync(path.join(dir, 'docs/engineering'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs/engineering/assets-manifest.json'),
    JSON.stringify({ entries: [
      { id: 'assets/orphans/ghost.png', path: 'assets/orphans/ghost.png' },
      { id: 'assets/subject-covers/physics-cover-v1.png', path: 'assets/subject-covers/physics-cover-v1.png' },
    ] }),
  );
  try {
    execFileSync(process.execPath, [script], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ARCH_ROOT: dir },
      stdio: 'pipe',
    });
    assert.fail('孤儿资源必须被检出');
  } catch (err) {
    const out = String(err.stdout || '') + String(err.stderr || '');
    assert.match(out, /孤儿资源.*ghost\.png/, '孤儿 ghost.png 被检出');
    assert.doesNotMatch(out, /physics-cover-v1/, '已登记封面家族不被误报');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('manifest 漂移被检出（新资源未登记）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-drift-'));
  const publicDir = path.join(dir, 'apps/web/public');
  fs.mkdirSync(path.join(publicDir, 'assets/hub-backgrounds'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/engineering'), { recursive: true });
  // 资源存在但 manifest 未登记
  fs.writeFileSync(path.join(publicDir, 'assets/hub-backgrounds/new.png'), 'x');
  fs.writeFileSync(
    path.join(dir, 'docs/engineering/assets-manifest.json'),
    JSON.stringify({ entries: [] }),
  );
  try {
    execFileSync(process.execPath, [script], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ARCH_ROOT: dir },
      stdio: 'pipe',
    });
    assert.fail('manifest 漂移必须被检出');
  } catch (err) {
    const out = String(err.stdout || '') + String(err.stderr || '');
    assert.match(out, /漂移|未登记/, '漂移信息含未登记资源');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
