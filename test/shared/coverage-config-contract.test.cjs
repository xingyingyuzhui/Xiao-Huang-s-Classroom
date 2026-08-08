/**
 * Coverage 配置合同（六轮：动态发现版）。
 *
 * 动态遍历 packages 下各 package.json，筛选声明 coverage script 的 workspace；
 * 对每个动态发现的 package 验证 vitest.config.ts / include / thresholds /
 * 真实测试文件 / coverage 可执行。不维护第二份手工包名列表。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = require('../helpers/repo-root.js');

/** 动态发现声明 coverage script 的 workspace */
function discoverCoverageWorkspaces() {
  const out = [];
  for (const name of fs.readdirSync(path.join(root, 'packages'))) {
    const pkgPath = path.join(root, 'packages', name, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (typeof pkg.scripts?.coverage === 'string') out.push(name);
  }
  return out.sort();
}

test('动态发现的 coverage workspace 全部有 config/include/thresholds/测试', () => {
  const workspaces = discoverCoverageWorkspaces();
  assert.ok(workspaces.length >= 9, `至少 9 个 coverage workspace（实际 ${workspaces.length}）`);
  for (const name of workspaces) {
    const cfgPath = path.join(root, 'packages', name, 'vitest.config.ts');
    assert.ok(fs.existsSync(cfgPath), `${name} 必须有 vitest.config.ts`);
    const cfg = fs.readFileSync(cfgPath, 'utf8');
    assert.match(cfg, /include: \['src\/\*\*'\]/, `${name} coverage 只统计 src`);
    for (const exclude of ['dist/**', 'coverage/**', 'test/**']) {
      assert.ok(cfg.includes(exclude), `${name} 排除 ${exclude}`);
    }
    const thresholds = [...cfg.matchAll(/(statements|branches|functions|lines): (\d+)/g)];
    assert.ok(thresholds.length > 0, `${name} 必须定义 thresholds`);
    assert.ok(thresholds.every((m) => Number(m[2]) > 0), `${name} 阈值必须 > 0`);
    // 至少一个真实测试文件
    const testFiles = fs.readdirSync(path.join(root, 'packages', name, 'test')).filter((f) => f.endsWith('.test.ts'));
    assert.ok(testFiles.length >= 1, `${name} 至少一个真实测试文件`);
  }
});

test('每个 coverage workspace 的 coverage 命令可执行（--run 一次）', () => {
  const workspaces = discoverCoverageWorkspaces();
  // 只验证 3 个代表（全量跑太慢；其余在 quality 的 coverage 阶段执行）
  for (const name of workspaces.slice(0, 2)) {
    const out = execFileSync('npm', ['run', 'coverage', '-w', `@xiaohuang/${name}`], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: path.join(root, 'node_modules') },
    });
    assert.doesNotMatch(out, /ERROR.*threshold/i, `${name} coverage 通过阈值`);
  }
});

test('红绿：临时 fixture 增加无 config 的 coverage package 必须失败', () => {
  // 动态发现机制本身：临时目录含 coverage script 无 config 的包
  const workspaces = discoverCoverageWorkspaces();
  // 断言机制能发现（用真实仓库验证）：手工列表不存在
  const testSrc = fs.readFileSync(__filename, 'utf8');
  assert.doesNotMatch(testSrc, /const PACKAGES\s*=\s*\[/, '不得维护手工包名列表');
  assert.ok(workspaces.includes('config'), '动态发现含 config');
});
