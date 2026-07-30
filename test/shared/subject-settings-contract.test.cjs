const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  READY_SUBJECT_IDS,
  SUBJECT_TAB_CATALOG,
  createDefaultSubjectSettings,
  normalizeSubjectSettings,
  getSubjectCapabilities,
  getDefaultPageOptions,
  isValidDefaultPage,
} = require('../../packages/subject-settings');

const { app } = require('../../apps/server/src');
const {
  initDatabase,
  closeDatabase,
  queryOne,
} = require('../../apps/server/src/db/sqlite');

test('subject tab catalog covers all ready subjects with valid default tabs', () => {
  assert.deepEqual(READY_SUBJECT_IDS, ['chemistry', 'physics', 'biology', 'math']);
  for (const subjectId of READY_SUBJECT_IDS) {
    const meta = SUBJECT_TAB_CATALOG[subjectId];
    assert.ok(meta?.name, `${subjectId} name`);
    assert.ok(meta.tabs.length >= 1, `${subjectId} tabs`);
    assert.ok(isValidDefaultPage(subjectId, meta.defaultTabId), `${subjectId} defaultTabId`);
    for (const tab of meta.tabs) {
      assert.ok(tab.id && tab.label && tab.panelId, `${subjectId} tab shape`);
    }
  }
});

test('getSubjectCapabilities reflects tab catalog', () => {
  const chem = getSubjectCapabilities('chemistry');
  assert.equal(chem.brand, true);
  assert.equal(chem.defaultPage, true);
  assert.equal(chem.ai, true);

  const physics = getSubjectCapabilities('physics');
  assert.equal(physics.brand, true);
  assert.equal(physics.defaultPage, false);
  assert.equal(physics.ai, true);

  const unknown = getSubjectCapabilities('astronomy');
  assert.deepEqual(unknown, { brand: false, defaultPage: false, ai: false });
});

test('normalizeSubjectSettings roundtrip preserves per-subject slices', () => {
  const defaults = createDefaultSubjectSettings();
  const patch = {
    chemistry: {
      brand: { title: '测试化学教室', iconDataUrl: null },
      defaultPage: 'molecule',
      ai: {
        apiBase: 'https://api.deepseek.com',
        apiKey: 'sk-test-key',
        model: 'deepseek-v4-pro',
      },
      electronOrder: [1, 2, 3],
    },
    physics: {
      brand: { title: '小黄的物理教室', iconDataUrl: null },
      ai: { apiKey: 'sk-physics' },
    },
  };

  const merged = normalizeSubjectSettings(patch);
  assert.equal(merged.chemistry.brand.title, '测试化学教室');
  assert.equal(merged.chemistry.defaultPage, 'molecule');
  assert.equal(merged.chemistry.ai.model, 'deepseek-v4-pro');
  assert.deepEqual(merged.chemistry.electronOrder, [1, 2, 3]);
  assert.equal(merged.physics.brand.title, '小黄的物理教室');
  assert.equal(merged.physics.ai.apiKey, 'sk-physics');
  assert.equal(merged.physics.defaultPage, defaults.physics.defaultPage);

  const options = getDefaultPageOptions('chemistry');
  assert.ok(options.some((o) => o.id === 'molecule'));
  assert.ok(!isValidDefaultPage('physics', 'table'));
});

test('settings PUT rejects legacy top-level keys', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subject-settings-legacy-'));
  const dbPath = path.join(dir, 'chem-lab.db');
  let server;
  try {
    await initDatabase(dbPath);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const legacyBrand = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand: { title: '旧字段' } }),
    });
    const legacyPayload = await legacyBrand.json();
    assert.equal(legacyPayload.success, false);

    const ok = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectSettings: {
          chemistry: { brand: { title: '新结构化学教室' } },
        },
      }),
    });
    const okPayload = await ok.json();
    assert.equal(okPayload.success, true);

    const row = queryOne('SELECT value FROM settings WHERE key = ?', ['subjectSettings']);
    const stored = JSON.parse(row.value);
    assert.equal(stored.chemistry.brand.title, '新结构化学教室');
    assert.equal(queryOne('SELECT key FROM settings WHERE key = ?', ['brand']), null);
  } finally {
    if (server) {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveAiSubjectId reads body and header with chemistry fallback', () => {
  const { resolveAiSubjectId } = require('../../apps/server/src/utils/ai-request');

  assert.equal(
    resolveAiSubjectId({ body: { subjectId: 'physics' }, headers: {} }),
    'physics',
  );
  assert.equal(
    resolveAiSubjectId({
      body: {},
      headers: { 'x-subject-id': 'biology' },
    }),
    'biology',
  );
  assert.equal(resolveAiSubjectId({ body: {}, headers: {} }), 'chemistry');
  assert.equal(
    resolveAiSubjectId({ body: { subjectId: 'invalid' }, headers: {} }),
    'chemistry',
  );
});
