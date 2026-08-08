/**
 * 资源 registry 合同（7.6 补齐）：
 * 1. 孤儿资源检测：未登记封面家族的资源必须被检出。
 * 2. manifest 漂移检测：新增资源未登记 → 失败；登记后通过。
 * 3. 同路径内容变化（hash/size）→ 必须失败。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

const script = path.join(root, 'tooling/architecture/check-assets.mjs');

function runCheck(cwd) {
  return execFileSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ARCH_ROOT: cwd },
    stdio: 'pipe',
  });
}

function runCheckExpectFail(cwd) {
  try {
    runCheck(cwd);
    return { ok: true, out: '' };
  } catch (err) {
    return {
      ok: false,
      out: String(err.stdout || '') + String(err.stderr || ''),
    };
  }
}

test('孤儿资源被检出（未登记封面家族 + 未被引用的资源）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-assets-'));
  const publicDir = path.join(dir, 'apps/web/public');
  const srcDir = path.join(dir, 'apps/web/src');
  fs.mkdirSync(path.join(publicDir, 'assets/orphans'), { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'assets/subject-covers'), { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'assets/orphans/ghost.png'), 'x');
  fs.writeFileSync(path.join(publicDir, 'assets/subject-covers/physics-cover-v1.png'), 'x');
  // 生成完整 manifest 后再只改登记，避免 hash 误报干扰孤儿断言
  fs.mkdirSync(path.join(dir, 'docs/engineering'), { recursive: true });
  execFileSync(process.execPath, [script, '--manifest'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ARCH_ROOT: dir },
  });
  try {
    const r = runCheckExpectFail(dir);
    assert.equal(r.ok, false, '孤儿资源必须被检出');
    assert.match(r.out, /孤儿资源.*ghost\.png/, '孤儿 ghost.png 被检出');
    assert.doesNotMatch(
      r.out,
      /孤儿资源: assets\/subject-covers\/physics-cover-v1/,
      '已登记封面家族不被误报为孤儿',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('manifest 漂移被检出（新资源未登记）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-drift-'));
  const publicDir = path.join(dir, 'apps/web/public');
  fs.mkdirSync(path.join(publicDir, 'assets/hub-backgrounds'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/engineering'), { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'assets/hub-backgrounds/new.png'), 'x');
  fs.writeFileSync(
    path.join(dir, 'docs/engineering/assets-manifest.json'),
    JSON.stringify({ entries: [] }),
  );
  try {
    const r = runCheckExpectFail(dir);
    assert.equal(r.ok, false, 'manifest 漂移必须被检出');
    assert.match(r.out, /漂移|未登记/, '漂移信息含未登记资源');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('manifest 同路径内容变化（hash/size）红绿', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-content-'));
  const publicDir = path.join(dir, 'apps/web/public');
  const assetDir = path.join(publicDir, 'assets');
  fs.mkdirSync(assetDir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'apps/web/src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/engineering'), { recursive: true });
  // 源码引用，避免孤儿
  fs.writeFileSync(
    path.join(dir, 'apps/web/src/ref.js'),
    "export const u = '/assets/example.png';\n",
  );
  const assetPath = path.join(assetDir, 'example.png');
  fs.writeFileSync(assetPath, 'content-v1');

  try {
    // 生成与当前内容一致的 manifest
    execFileSync(process.execPath, [script, '--manifest'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ARCH_ROOT: dir },
    });
    // 通过
    runCheck(dir);

    // 保持路径不变，修改资源内容
    fs.writeFileSync(assetPath, 'content-v2-changed-bytes');
    const r = runCheckExpectFail(dir);
    assert.equal(r.ok, false, '内容变化必须失败');
    assert.match(r.out, /manifest 漂移/, '报告 manifest 漂移');
    assert.match(r.out, /hash 或 size 不一致/, '报告 hash 或 size 不一致');

    // 重新生成 manifest 后通过
    execFileSync(process.execPath, [script, '--manifest'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ARCH_ROOT: dir },
    });
    runCheck(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('已删除资源仍登记被检出', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-deleted-'));
  const publicDir = path.join(dir, 'apps/web/public');
  fs.mkdirSync(path.join(publicDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/engineering'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs/engineering/assets-manifest.json'),
    JSON.stringify({
      entries: [
        {
          id: 'assets/gone.png',
          path: 'assets/gone.png',
          format: 'png',
          size: 1,
          hash: 'deadbeef',
          themeVariants: [],
        },
      ],
    }),
  );
  try {
    const r = runCheckExpectFail(dir);
    assert.equal(r.ok, false);
    assert.match(r.out, /已删除资源仍登记/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
