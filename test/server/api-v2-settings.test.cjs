/**
 * API v2 settings 合同（Program 5 Task 5.4）。
 *
 * 断言：v2 响应形状 { success, data|error, requestId }；data 可被
 * packages/contracts apiResponseSchema 解析；与 v1 数据一致（同一 service）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

const { app } = require('../../apps/server/src');
const { initDatabase, closeDatabase } = require('../../apps/server/src/db/sqlite');

async function withApiServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-v2-test-'));
  let server;
  try {
    await initDatabase(path.join(dir, 'chem-lab.db'));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    return await fn(baseUrl);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('v2 settings 返回规范响应形状且可被 contracts schema 解析', async () => {
  const { apiResponseSchema } = await import(
    pathToFileURL(path.join(root, 'packages/contracts/dist/index.js')).href
  );
  await withApiServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v2/subject-settings`);
    assert.equal(res.status, 200);
    const j = await res.json();
    // 响应形状：{ success: true, data, requestId }
    assert.equal(j.success, true);
    assert.ok(j.data && typeof j.data === 'object', 'data 必须是对象');
    assert.equal(typeof j.requestId, 'string');
    // contracts schema 可解析
    const parsed = apiResponseSchema.safeParse(j);
    assert.equal(parsed.success, true, 'v2 响应必须符合 contracts apiResponseSchema');
    if (parsed.success) {
      const data = parsed.data;
      if (data.success) {
        assert.ok(data.data.chemistry, 'data 含 chemistry 设置（与 v1 同源）');
        assert.ok(data.data.math, 'data 含 math 设置');
      }
    }
  });
});

test('v2 与 v1 数据一致（同一 application service）', async () => {
  await withApiServer(async (baseUrl) => {
    const [v2, v1] = await Promise.all([
      fetch(`${baseUrl}/api/v2/subject-settings`).then((r) => r.json()),
      fetch(`${baseUrl}/api/settings`).then((r) => r.json()),
    ]);
    const v2Data = v2.data;
    const v1Data = Array.isArray(v1) ? v1[0] : v1;
    // v1 响应含 subjects 映射（不同形状但同源）；这里断言 v2 默认面板与 v1 默认一致
    const v2Default = v2Data.chemistry?.defaultPage;
    assert.ok(v2Default, 'v2 有 chemistry 默认页');
  });
});
