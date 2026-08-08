const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const skillRoot = path.join(repoRoot, '.grok/skills/xiaohuang-classroom');
const referencesRoot = path.join(skillRoot, 'references');

const requiredReferences = [
  'architecture.md',
  'product-philosophy.md',
  'frontend-shell.md',
  'hub-bookshelf.md',
  'math-canvas.md',
  'chemistry-features.md',
  'server-data.md',
  'desktop-release.md',
  'engineering-quality.md',
  'add-feature.md',
  'debug-playbook.md',
  'maintenance.md',
];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'SKILL.md must start with YAML frontmatter');
  const block = match[1];
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const descriptionLine = block.match(/^description:\s*(.*)$/m);
  assert.ok(descriptionLine, 'frontmatter requires description');

  let description = descriptionLine[1].trim();
  if (description === '>' || description === '|') {
    const start = descriptionLine.index + descriptionLine[0].length;
    description = block
      .slice(start)
      .split('\n')
      .filter((line) => /^\s+\S/.test(line))
      .map((line) => line.trim())
      .join(' ');
  }

  const keys = [...block.matchAll(/^([a-z][a-z0-9_-]*):/gm)].map((entry) => entry[1]);
  return { name, description, keys };
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

test('skill frontmatter is a valid trigger-only entry', () => {
  const frontmatter = parseFrontmatter(read('.grok/skills/xiaohuang-classroom/SKILL.md'));
  assert.equal(frontmatter.name, 'xiaohuang-classroom');
  assert.match(frontmatter.description, /^Use when\b/);
  assert.deepEqual(frontmatter.keys.sort(), ['description', 'name']);
});

test('SKILL directly routes every owned reference and every route exists', () => {
  const skill = read('.grok/skills/xiaohuang-classroom/SKILL.md');
  for (const reference of requiredReferences) {
    const directPath = `references/${reference}`;
    assert.match(skill, new RegExp(directPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(fs.existsSync(path.join(referencesRoot, reference)), `missing ${directPath}`);
  }

  const linkedReferences = [...skill.matchAll(/references\/([a-z0-9-]+\.md)/g)].map(
    (entry) => entry[1],
  );
  for (const reference of new Set(linkedReferences)) {
    assert.ok(fs.existsSync(path.join(referencesRoot, reference)), `broken route: ${reference}`);
  }
});

test('repo entry points to the skill and delegates ready state to runtime manifest', () => {
  const agents = read('AGENTS.md');
  assert.match(agents, /\.grok\/skills\/xiaohuang-classroom\//);
  assert.match(agents, /apps\/web\/src\/subjects\/manifest\.js/);
  assert.doesNotMatch(agents, /仅「化学」可进入/);
});

test('architecture and quality references expose every current workspace', () => {
  const docs = [
    read('.grok/skills/xiaohuang-classroom/references/architecture.md'),
    read('.grok/skills/xiaohuang-classroom/references/engineering-quality.md'),
  ].join('\n');

  for (const workspace of workspacePackages()) {
    assert.ok(
      docs.includes(workspace.relativeDir) || docs.includes(workspace.name),
      `workspace is not discoverable from the skill: ${workspace.relativeDir}`,
    );
  }
});

test('quality and Electron commands are mapped to the correct evidence references', () => {
  const quality = read('.grok/skills/xiaohuang-classroom/references/engineering-quality.md');
  const desktop = read('.grok/skills/xiaohuang-classroom/references/desktop-release.md');
  const rootPackage = JSON.parse(read('package.json'));

  for (const script of ['quality', 'lint:baseline']) {
    assert.ok(rootPackage.scripts[script], `root script is missing: ${script}`);
    assert.match(quality, new RegExp(`npm run ${script.replace(':', '\\:')}`));
  }

  for (const script of ['verify:electron-package', 'dist:mac', 'dist:win']) {
    assert.ok(rootPackage.scripts[script], `root script is missing: ${script}`);
    assert.match(desktop, new RegExp(`npm run ${script.replace(':', '\\:')}`));
  }
});

test('math canvas reference protects the source-of-truth and runtime boundary', () => {
  const math = read('.grok/skills/xiaohuang-classroom/references/math-canvas.md');
  assert.match(math, /apps\/web\/src\/math\/AGENTS\.md/);
  assert.match(math, /GraphDocumentV2[\s\S]*store[\s\S]*runtime[\s\S]*renderer/i);
  assert.match(math, /JSXGraph[\s\S]*(runtime|运行时)/i);
});

test('generated and user-data paths are explicitly excluded from source work', () => {
  const maintenance = read('.grok/skills/xiaohuang-classroom/references/maintenance.md');
  for (const generatedPath of [
    'apps/web/dist',
    'apps/server/public',
    '.electron-stage',
    'dist-electron',
    'dist-exe',
  ]) {
    assert.match(maintenance, new RegExp(generatedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(maintenance, /apps\/server\/(src\/)?data/);
  assert.match(maintenance, /(生成|generated)/i);
  assert.match(maintenance, /(用户数据|user data)/i);
});
