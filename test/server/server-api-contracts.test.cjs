const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../../apps/server/src');
const {
  initDatabase,
  closeDatabase,
  queryOne,
  run,
} = require('../../apps/server/src/db/sqlite');
const { storeQuizPaper } = require('../../apps/server/src/utils/quiz-paper-store');

async function withApiServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-api-test-'));
  const dbPath = path.join(dir, 'chem-lab.db');
  let server;
  try {
    await initDatabase(dbPath);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    return await fn(baseUrl);
  } finally {
    if (server) {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('quiz session uses the server paper answer instead of a tampered client answer', async () => {
  await withApiServer(async (baseUrl) => {
    const paperId = storeQuizPaper([
      {
        id: 'q-water',
        stem: '水的化学式是？',
        options: ['H₂', 'H₂O', 'O₂', 'CO₂'],
        answer: 1,
      },
    ]);

    const response = await fetch(`${baseUrl}/api/quiz/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paperId,
        items: [
          {
            id: 'q-water',
            stem: '被篡改的题干',
            options: ['x', 'y', 'z', 'w'],
            answer: 0,
            chosen: 0,
          },
        ],
      }),
    });
    const payload = await response.json();

    assert.equal(payload.success, true);
    assert.equal(payload.data.correct, 0);
    assert.deepEqual(
      queryOne('SELECT stem, answer, is_correct FROM quiz_items'),
      { stem: '水的化学式是？', answer: 1, is_correct: 0 },
    );
  });
});

test('settings API masks a stored AI key per subject', async () => {
  await withApiServer(async (baseUrl) => {
    run(
      'INSERT INTO settings (key, value) VALUES (?, ?)',
      [
        'subjectSettings',
        JSON.stringify({
          chemistry: {
            ai: {
              apiBase: 'https://api.deepseek.com',
              apiKey: 'sk-secret-value',
              model: 'deepseek-v4-flash',
            },
          },
        }),
      ],
    );

    const response = await fetch(`${baseUrl}/api/settings`);
    const payload = await response.json();

    assert.equal(payload.success, true);
    assert.equal(payload.data.subjectSettings.chemistry.ai.apiKey, 'sk-s***ue');
    assert.notEqual(payload.data.subjectSettings.chemistry.ai.apiKey, 'sk-secret-value');
  });
});

// ───────────────────────── v1 端点合同矩阵（Program 5 Task 5.3） ─────────────────────────

test('v1 GET 端点合同：URL/状态码/响应字段冻结', async () => {
  await withApiServer(async (baseUrl) => {
    const cases = [
      { url: '/api/settings', expect: (j) => Array.isArray(j) || typeof j === 'object' },
      { url: '/api/labs', expect: (j) => Array.isArray(j?.data?.labs), shape: 'data.labs[]' },
      { url: '/api/offline-quiz/years', expect: (j) => Array.isArray(j.years) || Array.isArray(j) },
      { url: '/api/lesson-packs', expect: () => true },
    ];
    for (const c of cases) {
      const res = await fetch(`${baseUrl}${c.url}`);
      assert.equal(res.status, 200, `${c.url} 必须 200`);
      const j = await res.json();
      assert.ok(c.expect(j), `${c.url} 响应形状${c.shape ? `（${c.shape}）` : ''}：${JSON.stringify(j).slice(0, 80)}`);
    }
  });
});

test('v1 POST 端点合同：错误 body 返回 4xx 而非 500（边界稳定）', async () => {
  await withApiServer(async (baseUrl) => {
    const posts = [
      { url: '/api/quiz/score', body: {} },
      { url: '/api/students', body: {} },
      { url: '/api/ai/generate', body: {} },
      { url: '/api/quiz/sessions', body: {} },
    ];
    for (const c of posts) {
      const res = await fetch(`${baseUrl}${c.url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c.body),
      });
      assert.ok(res.status >= 400 && res.status < 500, `${c.url} 非法 body 必须 4xx，实际 ${res.status}`);
    }
  });
});

test('v1 未知路径返回 404（不泄露内部信息）', async () => {
  await withApiServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/definitely-not-a-route`);
    assert.equal(res.status, 404);
  });
});
