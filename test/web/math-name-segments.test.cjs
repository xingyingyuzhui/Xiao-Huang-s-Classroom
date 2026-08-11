/**
 * 对象短名：样式 + 字母 + 数字 解析/格式化
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function load(rel) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

test('parseStructuredName splits style + letter + number for points', async () => {
  const { parseStructuredName, formatStructuredName, POINT_NAME_STYLES } = await load(
    'apps/web/src/math/shared/name-segments.js',
  );

  assert.deepEqual(parseStructuredName('顶点A4', 'point'), {
    style: '顶点',
    letter: 'A',
    number: '4',
  });
  assert.equal(formatStructuredName({ style: '顶点', letter: 'A', number: '4' }), '顶点A4');
  assert.equal(parseStructuredName('交点', 'point').style, '交点');
  assert.equal(parseStructuredName('H', 'point').letter, 'H');
  assert.ok(POINT_NAME_STYLES.includes('零点'));
});

test('parseStructuredName uses line style vocabulary', async () => {
  const { parseStructuredName, LINE_NAME_STYLES } = await load(
    'apps/web/src/math/shared/name-segments.js',
  );

  assert.equal(parseStructuredName('垂线L2', 'line').style, '垂线');
  assert.equal(parseStructuredName('垂线L2', 'line').letter, 'L');
  assert.equal(parseStructuredName('垂线L2', 'line').number, '2');
  assert.ok(LINE_NAME_STYLES.includes('切线'));
});

test('formatLineMeasureLabel combines short name with measure text', async () => {
  const { formatLineMeasureLabel } = await load('apps/web/src/math/graph/construction/measurements.js');
  const host = { _mathBaseName: '线段A1', name: '线段' };
  assert.equal(formatLineMeasureLabel(host, '长 3.2'), '线段A1 · 长 3.2');
  assert.equal(formatLineMeasureLabel({ _mathBaseName: '垂线L2' }, ''), '垂线L2');
});

test('object style panel exposes structured name segments UI', () => {
  const fs = require('node:fs');
  const panel = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/object-style-panel.js'),
    'utf8',
  );
  const editor = fs.readFileSync(
    path.join(root, 'apps/web/src/math/shared/object-name-editor.js'),
    'utf8',
  );
  assert.match(panel, /math-name-seg/);
  assert.match(panel, /setNameEditHooks/);
  assert.match(panel, /data-seg="style"/);
  assert.match(panel, /data-seg="letter"/);
  assert.match(panel, /data-seg="number"/);
  assert.match(panel, /createObjectNameEditor/);
  assert.match(editor, /showNameKeypad/);
  assert.match(editor, /hideNameKeypad/);
  assert.match(editor, /commitNameSegments/);
});
