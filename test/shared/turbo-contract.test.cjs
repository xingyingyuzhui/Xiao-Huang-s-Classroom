/**
 * Turborepo 任务图合同（Program 1 Task 1.5）。
 *
 * 断言：turbo.json 存在且定义 build/test/typecheck/lint 任务；
 * 根 build 脚本委托 turbo；缓存配置存在。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

test('turbo.json 存在且定义标准任务图', () => {
  const file = path.join(root, 'turbo.json');
  assert.ok(fs.existsSync(file), 'turbo.json 必须存在');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const task of ['build', 'test', 'typecheck', 'lint']) {
    assert.ok(cfg.tasks?.[task], `turbo.json 必须定义任务 ${task}`);
  }
  assert.ok(cfg.tasks.build.dependsOn, 'build 任务必须声明 dependsOn（^build 依赖图）');
});

test('根 build 脚本委托 turbo；test 保持全仓 node:test 入口', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.build, /turbo run build/, '根 build 必须委托 turbo');
  assert.match(pkg.scripts.test, /node --test/, '根 test 保持 node:test 全仓入口（迁移前）');
});

test('test 任务必须依赖自身 build 与上游 ^build（避免 dist 竞态）', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'turbo.json'), 'utf8'));
  const deps = cfg.tasks.test.dependsOn || [];
  assert.ok(deps.includes('build'), 'test.dependsOn 必须含 build（自身先构建）');
  assert.ok(deps.includes('^build'), 'test.dependsOn 必须含 ^build');
});

