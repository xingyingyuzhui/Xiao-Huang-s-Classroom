/**
 * Workspace 标准任务合同（R2/R4）：
 * 所有应参加 Turbo 的 workspace 必须有 test/typecheck（build 可选）标准脚本。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const WORKSPACES = ['web', 'server', 'desktop', 'config', 'domain-core', 'contracts', 'test-kit', 'design-tokens', 'ui', 'subject-kit', 'math-expr', 'subject-settings'];

test('所有 workspace 提供标准 test 任务（turbo run test 可发现）', () => {
  for (const name of WORKSPACES) {
    const appsPath = path.join(root, 'apps', name, 'package.json');
    const pkgPath = fs.existsSync(appsPath) ? appsPath : path.join(root, 'packages', name, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.equal(typeof pkg.scripts?.test, 'string', `${name} 必须有 test 脚本`);
  }
});

test('apps（web/server/desktop）提供标准 typecheck 任务', () => {
  for (const name of ['web', 'server', 'desktop']) {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'apps', name, 'package.json'), 'utf8'),
    );
    assert.equal(typeof pkg.scripts?.typecheck, 'string', `apps/${name} 必须有 typecheck 脚本`);
  }
});

test('apps/server 提供 build 任务（TS 产物构建链）', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/server/package.json'), 'utf8'),
  );
  assert.equal(typeof pkg.scripts?.build, 'string', 'apps/server 必须有 build 脚本');
  assert.equal(typeof pkg.scripts?.test, 'string', 'apps/server 必须有 test 脚本');
});
