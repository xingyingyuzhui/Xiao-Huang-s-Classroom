/**
 * quiz schema 合同（D-test 批次：node:test → vitest 迁移，行为逐字保持）。
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
} = require(path.join(dirname, '../src/db/sqlite'));
const { ensureQuizSchema } = require(path.join(dirname, '../src/db/ensure-quiz-schema'));

async function withTempDb(fn: () => unknown): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-quiz-schema-'));
  const dbPath = path.join(dir, 'chem-lab.db');
  try {
    await initDatabase(dbPath);
    await fn();
  } finally {
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('ensureQuizSchema is idempotent and owns quiz tables + source_type', async () => {
  await withTempDb(() => {
    ensureQuizSchema();
    ensureQuizSchema();

    const tables = query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('quiz_sessions','quiz_items','quiz_wrong_book') ORDER BY name`,
    ).map((r: { name: string }) => r.name);
    assert.deepEqual(tables, ['quiz_items', 'quiz_sessions', 'quiz_wrong_book']);

    const cols = query('PRAGMA table_info(quiz_sessions)');
    assert.ok(
      cols.some((c: { name: string }) => c.name === 'source_type'),
      'quiz_sessions.source_type must exist after ensureQuizSchema',
    );
  });
});
