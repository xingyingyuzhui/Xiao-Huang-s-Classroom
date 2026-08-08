/**
 * 数据路径合同（D-data 收口）。
 *
 * 断言：paths.js 数据解析只走三类运行位置（web dev / Electron userData /
 * pkg 邻近），不写入历史路径 apps/server/src/data/；seed 数据源在
 * apps/web/src/chemistry/data/（web 模块数据），无 src/data 引用残留。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const pathsSrc = fs.readFileSync(path.join(root, 'apps/server/src/paths.js'), 'utf8');

test('paths.js 数据解析不写入 src/data（历史路径只识别）', () => {
  assert.doesNotMatch(pathsSrc, /src[\\/]data/, 'paths.js 禁止引用 src/data 写入路径');
  assert.match(pathsSrc, /CHEM_LAB_DATA_DIR/, '数据目录经环境变量/可写根解析');
});

test('三类运行位置解析链存在（web dev / Electron / pkg）', () => {
  assert.match(pathsSrc, /getWritableRoot/, '可写根解析存在');
  assert.match(pathsSrc, /CHEM_LAB_ELECTRON/, 'Electron 模式识别存在');
  assert.match(pathsSrc, /process\.pkg|isPkg/, 'pkg 模式识别存在');
});

test('seed 数据源在 web chemistry/data，src/data 无残留引用', () => {
  const seeds = ['labs-builtin.js', 'offline-quiz-bank.js'].map((f) =>
    fs.readFileSync(path.join(root, 'apps/server/src/seed', f), 'utf8'),
  );
  for (const src of seeds) {
    assert.doesNotMatch(src, /src[\\/]data/, 'seed 头注释不得引用 src/data');
    assert.match(src, /chemistry\/data|web\/src\/chemistry/, 'seed 头注明真实数据源');
  }
});

test('docs/engineering/data-paths.md 存在且说明三类位置与历史路径', () => {
  const doc = fs.readFileSync(path.join(root, 'docs/engineering/data-paths.md'), 'utf8');
  assert.match(doc, /apps\/server\/data/, 'web dev 数据位置');
  assert.match(doc, /userData/, 'Electron 数据位置');
  assert.match(doc, /pkg/, 'pkg 数据位置');
  assert.match(doc, /src\/data/, '历史路径说明');
});
