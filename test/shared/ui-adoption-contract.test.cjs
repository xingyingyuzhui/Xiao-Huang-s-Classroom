/**
 * UI 库（@xiaohuang/ui）采用计数合同（计划 Phase 0 仪表盘基线）。
 * 锁定：包存在、web 依赖、公开导出、业务采用文件数下限、function-panel 试点不回退。
 * 后续 Phase（P3/P5/P6/P7）抬高 MIN_BUSINESS_CONSUMERS 阈值（计划 P7.1）。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');

// P0 基线 = function-panel 唯一业务试点；P3 后 >=3、P5 后 >=5、P6 后 >=8
const MIN_BUSINESS_CONSUMERS = 1;

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function webPackage() {
  return JSON.parse(read('apps/web/package.json'));
}

/** apps/web/src 下业务消费 @xiaohuang/ui 的 .js 文件（排除 dev/ 目录，catalog 不计入业务数）。 */
function businessUiConsumers() {
  const webSrc = path.join(repoRoot, 'apps/web/src');
  const consumers = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'dev') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        const source = fs.readFileSync(full, 'utf8');
        if (/from\s+['"]@xiaohuang\/ui['"]/.test(source)) consumers.push(full);
      }
    }
  }
  walk(webSrc);
  return consumers;
}

test('packages/ui exists and apps/web depends on @xiaohuang/ui', () => {
  const uiManifest = JSON.parse(read('packages/ui/package.json'));
  assert.equal(uiManifest.name, '@xiaohuang/ui');
  const web = webPackage();
  assert.ok(
    web.dependencies && web.dependencies['@xiaohuang/ui'],
    'apps/web must depend on @xiaohuang/ui',
  );
});

test('packages/ui/src/index.ts exports the P0 contract factories', () => {
  const index = read('packages/ui/src/index.ts');
  for (const factory of [
    'createButton',
    'createDialog',
    'createToast',
    'createToolGroup',
    'createReadoutCard',
  ]) {
    assert.match(index, new RegExp(`export\\s*\\{\\s*${factory}\\b`), `missing export: ${factory}`);
  }
});

test(`business UI consumers >= ${MIN_BUSINESS_CONSUMERS} (P0 baseline)`, () => {
  const consumers = businessUiConsumers();
  assert.ok(
    consumers.length >= MIN_BUSINESS_CONSUMERS,
    `expected >= ${MIN_BUSINESS_CONSUMERS} business consumer(s) of @xiaohuang/ui, got ${consumers.length}: ${consumers.join(', ')}`,
  );
});

test('function-panel pilot must keep importing createButton from @xiaohuang/ui', () => {
  const panel = read('apps/web/src/math/graph/function-panel.js');
  assert.match(panel, /from\s+['"]@xiaohuang\/ui['"]/);
  assert.match(panel, /createButton/);
});

test('P0.1 dashboard doc exists in public engineering docs', () => {
  assert.ok(
    fs.existsSync(path.join(repoRoot, 'docs/engineering/ui-library.md')),
    'missing docs/engineering/ui-library.md',
  );
});
