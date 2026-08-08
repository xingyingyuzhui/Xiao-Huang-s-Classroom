/**
 * Subject manifest adapter 合同（Program 4 Task 4.4-4.6）。
 *
 * 断言：化学 manifest 与现状一致（status/默认面板/面板 catalog）；
 * 数学 manifest 保留函数画布合同入口；物理/生物为 locked placeholder。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function load(rel: string) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

test('化学 manifest：status ready、默认面板 table、面板 catalog 与现状一致', async () => {
  const { subjectManifest } = await load('apps/web/src/subjects/manifest.js');
  const m = subjectManifest('chemistry');
  assert.ok(m, '化学 manifest 必须存在');
  assert.equal(m.status, 'ready');
  assert.equal(m.classroom.defaultPanel, 'table');
  const ids = m.classroom.panels.map((p) => p.id);
  assert.deepEqual(ids, ['table', 'molecule', 'molar', 'electron', 'battle', 'ai']);
  assert.equal(m.intro.title, '化学');
  assert.ok(m.cover.variants.length >= 1);
});

test('数学 manifest：默认面板 graph、函数画布 tab 在 catalog 中', async () => {
  const { subjectManifest } = await load('apps/web/src/subjects/manifest.js');
  const m = subjectManifest('math');
  assert.ok(m);
  assert.equal(m.status, 'ready');
  assert.equal(m.classroom.defaultPanel, 'graph');
  const ids = m.classroom.panels.map((p) => p.id);
  assert.ok(ids.includes('graph'), '函数画布必须在数学面板 catalog');
});

test('物理/生物为 locked placeholder（可见不可点，沿用现有行为）', async () => {
  const { subjectManifest } = await load('apps/web/src/subjects/manifest.js');
  for (const id of ['physics', 'biology']) {
    const m = subjectManifest(id);
    assert.ok(m, `${id} manifest 必须存在`);
    assert.equal(m.status, 'locked', `${id} 必须 locked`);
  }
});
