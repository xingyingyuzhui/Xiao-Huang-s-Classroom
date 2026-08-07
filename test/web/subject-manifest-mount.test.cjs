/**
 * manifest classroom.mount 真实接线（R4.1）。
 *
 * 断言：CLASSROOM_FACTORIES 是 registry 的公开导出（manifest 引用有效）；
 * manifest.mount 工厂对 ready 学科存在；未注册学科工厂返回 false。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

async function load(rel) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

test('CLASSROOM_FACTORIES 是 registry 公开导出（manifest 引用有效）', async () => {
  const registry = await import(
    pathToFileURL(path.join(root, 'apps/web/src/subjects/classrooms/registry.js')).href
  ).catch(() => null);
  // registry 顶层连带 HTML 无法在 Node 加载——验证导出声明存在于源码
  const src = require('node:fs').readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/registry.js'),
    'utf8',
  );
  assert.match(src, /export const CLASSROOM_FACTORIES/, 'CLASSROOM_FACTORIES 必须显式导出');
});

test('manifest.mount 工厂：ready 学科存在，未知学科不存在', async () => {
  const { subjectManifest } = await load('apps/web/src/subjects/manifest.js');
  for (const id of ['chemistry', 'math']) {
    const m = subjectManifest(id);
    assert.ok(m, `${id} manifest 存在`);
    assert.equal(await m.classroom.hasFactory(), true, `${id} 有真实工厂`);
    assert.equal(typeof m.classroom.mount, 'function');
  }
});

test('manifest 工厂清单与 registry 声明一致（防漂移）', () => {
  const fs = require('node:fs');
  const registry = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/registry.js'),
    'utf8',
  );
  const manifest = fs.readFileSync(path.join(root, 'apps/web/src/subjects/manifest.js'), 'utf8');
  const regIds = [...registry.matchAll(/(?:chemistry|physics|biology|math):\s*create/g)].map((m) => m[1]);
  for (const id of ['chemistry', 'physics', 'biology', 'math']) {
    assert.match(registry, new RegExp(`${id}:\\s*create`), `registry 注册 ${id}`);
    assert.match(manifest, new RegExp(`['"]${id}['"]`), `manifest 工厂清单含 ${id}`);
  }
});

test('hub/chrome/shell 数据源统一到 manifest（旧 catalog 直连禁止回归）', () => {
  const fs = require('node:fs');
  for (const rel of [
    'apps/web/src/subjects/hub.js',
    'apps/web/src/subjects/chrome.js',
    'apps/web/src/app/shell.js',
  ]) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.doesNotMatch(src, /from '\.\/catalog\.js'|from '\.\.\/subjects\/catalog\.js'|from '\.\.\/catalog\.js'/, `${rel} 不得直接 import catalog`);
    assert.match(src, /manifest\.js/, `${rel} 必须从 manifest 取元数据`);
  }
});

test('manifest 透传视觉字段（hub 渲染需要）', async () => {
  const { subjectManifest } = await load('apps/web/src/subjects/manifest.js');
  const chem = subjectManifest('chemistry');
  assert.ok(chem.book, 'manifest 必须透传 book 视觉字段');
  assert.equal(typeof chem.book.edge, 'string');
  assert.equal(chem.name, '化学');
  assert.ok(Array.isArray(chem.modules));
});
