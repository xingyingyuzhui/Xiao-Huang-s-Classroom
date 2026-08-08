/**
 * server 数据完整性合同（D-test 批次：node:test → vitest 迁移，行为逐字保持）。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  initDatabase,
  closeDatabase,
  query,
  queryOne,
  run,
} = require(path.join(dirname, '../src/db/sqlite'));
const {
  BUILTIN_MOLECULES,
} = require(path.join(dirname, '../src/seed/builtin-molecules'));
const {
  syncBuiltinMolecules,
} = require(path.join(dirname, '../src/seed/import-builtin'));
const {
  reserveGlobalAiCall,
  releaseGlobalAiCall,
} = require(path.join(dirname, '../src/utils/ai-rate-limit'));
const {
  tryReserveAiCall,
  releaseAiCall,
} = require(path.join(dirname, '../src/utils/chem-tips'));
const {
  reserveCall: reserveQuizAssistCall,
  releaseCall: releaseQuizAssistCall,
} = require(path.join(dirname, '../src/utils/quiz-assist-limit'));

async function withTempDatabase(fn: () => unknown): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-test-'));
  const dbPath = path.join(dir, 'chem-lab.db');
  try {
    await initDatabase(dbPath);
    await fn();
  } finally {
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('built-in molecule sync adds missing built-ins without touching custom molecules', async () => {
  await withTempDatabase(() => {
    run(
      `INSERT INTO molecules (id, name, formula, desc, atoms, bonds, custom, physics, chemistry)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        'teacher-water',
        '教师自建水模型',
        'H₂O',
        '保留这条自建数据',
        '[]',
        '[]',
        JSON.stringify({ state: '自定义' }),
        JSON.stringify({ acidity: '自定义' }),
      ],
    );

    const result = syncBuiltinMolecules();

    assert.ok(result.inserted >= BUILTIN_MOLECULES.length);
    assert.equal(
      queryOne('SELECT COUNT(*) AS count FROM molecules').count,
      BUILTIN_MOLECULES.length + 1,
    );
    assert.deepEqual(
      queryOne('SELECT physics FROM molecules WHERE id = ?', ['teacher-water']),
      { physics: JSON.stringify({ state: '自定义' }) },
    );
  });
});

test('built-in molecule sync backfills empty properties in an existing database', async () => {
  await withTempDatabase(() => {
    const water = BUILTIN_MOLECULES.find((molecule: { id: string }) => molecule.id === 'h2o');
    run(
      `INSERT INTO molecules (id, name, formula, desc, atoms, bonds, custom, physics, chemistry)
       VALUES (?, ?, ?, ?, ?, ?, 0, '{}', '{}')`,
      [
        water.id,
        water.name,
        water.formula,
        water.desc,
        JSON.stringify(water.atoms),
        JSON.stringify(water.bonds),
      ],
    );

    syncBuiltinMolecules();

    const row = queryOne(
      'SELECT physics, chemistry FROM molecules WHERE id = ?',
      ['h2o'],
    );
    assert.deepEqual(JSON.parse(row.physics), water.physics);
    assert.deepEqual(JSON.parse(row.chemistry), water.chemistry);
  });
});

test('releasing a global AI reservation only removes that request', async () => {
  await withTempDatabase(() => {
    const first = reserveGlobalAiCall('first');
    const second = reserveGlobalAiCall('second');
    assert.ok(first.reservationId);
    assert.ok(second.reservationId);

    releaseGlobalAiCall(first.reservationId);

    assert.deepEqual(query('SELECT id, kind FROM ai_global_calls ORDER BY id'), [
      { id: second.reservationId, kind: 'second' },
    ]);
  });
});

test('releasing an AI tip reservation only removes that request', async () => {
  await withTempDatabase(() => {
    const first = tryReserveAiCall();
    const second = tryReserveAiCall();
    assert.ok(first.reservationId);
    assert.ok(second.reservationId);

    releaseAiCall(first.reservationId);

    assert.deepEqual(query('SELECT id FROM ai_tip_calls ORDER BY id'), [
      { id: second.reservationId },
    ]);
  });
});

test('releasing an AI quiz-assist reservation only removes that request', async () => {
  await withTempDatabase(() => {
    const first = reserveQuizAssistCall('hint');
    const second = reserveQuizAssistCall('hint');
    assert.ok(first.reservationId);
    assert.ok(second.reservationId);

    releaseQuizAssistCall(first.reservationId);

    assert.deepEqual(
      query('SELECT id, kind FROM ai_quiz_assist_calls ORDER BY id'),
      [{ id: second.reservationId, kind: 'hint' }],
    );
  });
});
