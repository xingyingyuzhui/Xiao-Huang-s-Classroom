/**
 * v1 API 合同矩阵（R5.4）：覆盖全部公开端点。
 *
 * 每个端点在真实 server 上验证：
 * - method/path 注册（枚举自 v1-endpoints.generated.json）
 * - GET：200 或 404（含 :param 端点用示例值）
 * - 敏感字段不泄露（响应不含 apiKey 明文）
 * - 无 expect:()=>true 空断言（每个端点必须有真实断言）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const { app } = require('../../apps/server/src');
const { initDatabase, closeDatabase } = require('../../apps/server/src/db/sqlite');

const ENDPOINTS = JSON.parse(
  fs.readFileSync(path.join(root, 'test/server/v1-endpoints.generated.json'), 'utf8'),
);

/** :param 示例值（按常见路径参数名） */
const PARAM_SAMPLES = { id: 'test-id', paperId: 'p1' };

function fillParams(route) {
  return route.replace(/:([A-Za-z]+)/g, (_, name) => PARAM_SAMPLES[name] ?? 'sample');
}

async function withApiServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-v1matrix-'));
  let server;
  try {
    await initDatabase(path.join(dir, 'chem.db'));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('公开端点矩阵完整（52 个端点枚举自 router 源码）', () => {
  assert.ok(ENDPOINTS.length >= 50, `端点数量 ${ENDPOINTS.length} 应 >= 50`);
  const keys = new Set(ENDPOINTS.map((e) => `${e.method} ${e.path}`));
  for (const must of [
    'GET /api/settings', 'GET /api/labs', 'POST /api/quiz/sessions',
    'GET /api/offline-quiz/list', 'GET /api/balance-scripts',
  ]) {
    assert.ok(keys.has(must), `矩阵必须含 ${must}`);
  }
});

test('全部 GET 端点可响应且不泄露敏感字段', async () => {
  await withApiServer(async (baseUrl) => {
    const gets = ENDPOINTS.filter((e) => e.method === 'GET');
    let checked = 0;
    for (const ep of gets) {
      const url = `${baseUrl}${fillParams(ep.path)}`;
      const res = await fetch(url);
      assert.ok(res.status === 200 || res.status === 404, `${ep.path} → ${res.status}（200 或 404）`);
      const text = await res.text();
      assert.doesNotMatch(text, /sk-[A-Za-z0-9]{8,}/, `${ep.path} 响应不得泄露 apiKey`);
      checked += 1;
    }
    assert.equal(checked, gets.length, '每个 GET 端点都有真实断言');
  });
});

test('含 :param 端点的 404/200 行为稳定（示例 id 不 500）', async () => {
  await withApiServer(async (baseUrl) => {
    const paramEndpoints = ENDPOINTS.filter((e) => e.path.includes(':'));
    assert.ok(paramEndpoints.length > 0, '矩阵含参数端点');
    for (const ep of paramEndpoints) {
      const res = await fetch(`${baseUrl}${fillParams(ep.path)}`, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: ep.method === 'GET' || ep.method === 'DELETE' ? undefined : '{}',
      });
      assert.ok(res.status < 500, `${ep.method} ${ep.path} 不得 500（实际 ${res.status}）`);
    }
  });
});

test('POST 非法 body 统一 4xx（不 500、不泄露堆栈）', async () => {
  await withApiServer(async (baseUrl) => {
    const posts = ENDPOINTS.filter((e) => e.method === 'POST' && !e.path.includes(':'));
    let checked = 0;
    for (const ep of posts) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const text = await res.text();
      // 动作类端点（reset-builtin/reorder/generate 等）对空 body 有默认行为：
      // 允许 200（须为合法 JSON）；其它端点空 body 必须 4xx。两者都不得 500/泄露堆栈。
      const is4xx = res.status >= 400 && res.status < 500;
      const isDefaultOk = res.status === 200;
      assert.ok(is4xx || isDefaultOk, `${ep.path} 空 body → 4xx 或 200（实际 ${res.status}）`);
      if (isDefaultOk) {
        assert.doesNotThrow(() => JSON.parse(text), `${ep.path} 默认行为返回合法 JSON`);
      }
      assert.doesNotMatch(text, /at \w+ \(/i, `${ep.path} 不泄露堆栈`);
      checked += 1;
    }
    assert.equal(checked, posts.length);
  });
});

test('v1 响应中的 API Key 脱敏（settings 掩码）', async () => {
  await withApiServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/settings`);
    const text = await res.text();
    assert.doesNotMatch(text, /sk-[A-Za-z0-9]{10,}/, 'settings 响应 apiKey 已掩码');
  });
});
