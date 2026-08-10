/**
 * 数学模型契约（图象 / 数列等）— 原 atlas catalog 测试已退役
 * 保留文件名以兼容本地习惯；断言迁到课标命名的多 Tab 结构。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function load(rel) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

test('math labs expose curriculum-named modules and working models', async () => {
  const { GRAPH_PRESETS, keyFeatures, defaultCoeffsFor } = await load(
    'apps/web/src/math/graph/model.js',
  );
  assert.ok(GRAPH_PRESETS.some((p) => p.id === 'quadratic'));
  assert.ok(GRAPH_PRESETS.some((p) => p.label === '二次'));
  assert.ok(!GRAPH_PRESETS.some((p) => /二次一族/.test(p.label)));
  const feats = keyFeatures('quadratic', defaultCoeffsFor('quadratic'));
  assert.ok(Array.isArray(feats));

  const { sequenceTerms, partialSum } = await load('apps/web/src/math/sequence/model.js');
  assert.deepEqual(sequenceTerms('arith', 2, 3, 4), [2, 5, 8, 11]);
  assert.equal(partialSum('arith', 2, 3, 4), 26);

  const panels = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/partials/math-panels.partial.html'),
    'utf8',
  );
  assert.match(panels, /等差数列/);
  assert.match(panels, /等比数列/);
  assert.match(panels, /正四棱锥/);
  assert.match(panels, /单位圆/);
});
