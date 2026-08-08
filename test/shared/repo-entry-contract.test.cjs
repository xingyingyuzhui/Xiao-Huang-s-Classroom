/**
 * 公开仓库入口合同：不依赖 .grok/.cursor 等私有 agent 目录。
 * 验证 AGENTS.md、docs/engineering、根 scripts 与 workspace 可发现性。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function workspacePackages() {
  const rootPackage = JSON.parse(read('package.json'));
  return rootPackage.workspaces.flatMap((workspacePattern) => {
    assert.match(workspacePattern, /\/\*$/, `unsupported workspace pattern: ${workspacePattern}`);
    const parent = workspacePattern.slice(0, -2);
    return fs
      .readdirSync(path.join(repoRoot, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const relativeDir = `${parent}/${entry.name}`;
        const manifestPath = path.join(repoRoot, relativeDir, 'package.json');
        if (!fs.existsSync(manifestPath)) return null;
        return {
          relativeDir,
          name: JSON.parse(fs.readFileSync(manifestPath, 'utf8')).name,
        };
      })
      .filter(Boolean);
  });
}

test('AGENTS.md points to public docs and runtime manifest, not private agent skills', () => {
  const agents = read('AGENTS.md');
  assert.match(agents, /docs\/engineering\//);
  assert.match(agents, /apps\/web\/src\/subjects\/manifest\.js/);
  assert.match(agents, /apps\/web\/src\/math\/AGENTS\.md/);
  assert.doesNotMatch(agents, /\.grok\/skills\//);
  assert.doesNotMatch(agents, /仅「化学」可进入/);
});

test('public engineering docs exist for debt, allowlist, and behavior compatibility', () => {
  for (const relative of [
    'docs/engineering/debt-registry.md',
    'docs/engineering/js-allowlist.md',
    'docs/engineering/behavior-compatibility.md',
    'docs/engineering/baseline-2026-08-07.md',
  ]) {
    assert.ok(fs.existsSync(path.join(repoRoot, relative)), `missing ${relative}`);
  }
});

test('root package exposes quality and electron evidence scripts', () => {
  const rootPackage = JSON.parse(read('package.json'));
  for (const script of [
    'quality',
    'lint:baseline',
    'verify:electron-package',
    'dist:mac',
    'dist:win',
    'build:frontend',
  ]) {
    assert.ok(rootPackage.scripts[script], `root script is missing: ${script}`);
  }
});

test('workspaces are discoverable from package.json and live on disk', () => {
  const workspaces = workspacePackages();
  assert.ok(workspaces.length >= 10, `expected many workspaces, got ${workspaces.length}`);
  for (const workspace of workspaces) {
    assert.ok(workspace.name, `${workspace.relativeDir} missing package name`);
    assert.ok(
      fs.existsSync(path.join(repoRoot, workspace.relativeDir, 'package.json')),
      `missing ${workspace.relativeDir}/package.json`,
    );
  }
});

test('AGENTS.md excludes generated and user-data paths from source work', () => {
  const agents = read('AGENTS.md');
  for (const generatedPath of [
    'apps/web/dist',
    'apps/server/public',
    '.electron-stage',
    'dist-electron',
    'dist-exe',
  ]) {
    assert.match(agents, new RegExp(generatedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(agents, /apps\/server\/(src\/)?data/);
});

test('math board contract doc still lives in public tree', () => {
  const mathAgents = read('apps/web/src/math/AGENTS.md');
  assert.match(mathAgents, /math-theme|board-lifecycle|withPreservedViewport/i);
});

test('gitignore keeps agent and IDE skill directories private', () => {
  const ignore = read('.gitignore');
  for (const dir of ['.grok/', '.cursor/', '.claude/', '.agents/', '.opencode/']) {
    assert.match(ignore, new RegExp(dir.replace(/\./g, '\\.')));
  }
  // 不得再「例外放行」skills
  assert.doesNotMatch(ignore, /!\.cursor\/skills/);
  assert.doesNotMatch(ignore, /!\.claude\/skills/);
});
