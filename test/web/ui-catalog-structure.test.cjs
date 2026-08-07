/**
 * UI Catalog 结构合同（Program 3 Task 3.6）。
 *
 * 断言：catalog 是开发态独立入口——main.js 只在 DEV + #dev-catalog 时
 * 动态 import；catalog 使用 @xiaohuang/ui 包组件；不进正式导航/主包路径。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const mainSrc = fs.readFileSync(path.join(root, 'apps/web/src/main.js'), 'utf8');
const catalogSrc = fs.readFileSync(path.join(root, 'apps/web/src/dev/catalog/main.js'), 'utf8');

test('catalog 只在 DEV + #dev-catalog 时经动态 import 挂载', () => {
  assert.match(mainSrc, /import\.meta\.env\.DEV/, '必须 DEV 条件');
  assert.match(mainSrc, /#dev-catalog/, '必须 hash 条件');
  assert.match(mainSrc, /import\('\.\/dev\/catalog\/main\.js'\)/, '必须动态 import（独立 chunk）');
  assert.doesNotMatch(
    mainSrc,
    /^\s*import\s+[^(']*['"]\.\/dev\/catalog/m,
    '正式路径不得静态 import catalog（仅允许动态 import）',
  );
});

test('catalog 使用 @xiaohuang/ui 组件包', () => {
  assert.match(catalogSrc, /@xiaohuang\/ui/, 'catalog 必须消费 ui 包');
  assert.match(catalogSrc, /createButton/, '必须渲染组件状态矩阵');
  assert.match(catalogSrc, /createDialog/, '必须覆盖 overlay 组件');
});

test('catalog 不进正式导航', () => {
  const hub = fs.readFileSync(path.join(root, 'apps/web/src/subjects/hub.js'), 'utf8');
  assert.doesNotMatch(hub, /dev\/catalog/, 'hub 不得引用 catalog');
});
