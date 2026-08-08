/**
 * Seed versioning 合同（Program 5 Task 5.6）。
 * （D-test 批次：node:test → vitest 迁移，行为逐字保持）
 *
 * 断言：幂等 upsert（同版本跳过、新版本重放）；版本记录持久化；
 * 与 migration 分离（不依赖 schema migration）。
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
const root = require(path.join(dirname, '../../../test/helpers/repo-root.js'));

const { initDatabase, closeDatabase, query, run, exec } = require(path.join(
  root,
  'apps/server/src/db/sqlite.js',
));
const { applySeed } = require(path.join(root, 'apps/server/src/db/seed-versioning.js'));
const { MAX_SCHEMA_VERSION } = require(path.join(root, 'apps/server/src/db/migrator.js'));

function withDb(fn: () => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-seed-test-'));
  const dbPath = path.join(dir, 'seed.db');
  return initDatabase(dbPath).then(async () => {
    try {
      await fn();
    } finally {
      closeDatabase();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

const db = { exec, run, queryOne: (sql: string, params?: unknown[]) => query(sql, params)[0] ?? null };

test('seed 幂等：同版本只应用一次，内容版本变化时重放', async () => {
  await withDb(async () => {
    let upserts = 0;
    const upsert = () => {
      upserts += 1;
      run('INSERT OR REPLACE INTO lab_experiments (id, title, sort_order, source, created_at, updated_at) VALUES (?, ?, 0, ?, 0, 0)', ['lab-seed-1', 'title', 'builtin']);
    };
    const first = applySeed(db, 'labs', 'v1', upsert);
    assert.equal(first.applied, true);
    const second = applySeed(db, 'labs', 'v1', upsert);
    assert.equal(second.applied, false, '同版本跳过');
    assert.equal(upserts, 1, '同版本不重复 upsert');

    const third = applySeed(db, 'labs', 'v2', upsert);
    assert.equal(third.applied, true, '新版本重放');
    assert.equal(upserts, 2);
    const row = query('SELECT content_version FROM seed_versions WHERE seed_key = ?', ['labs'])[0];
    assert.equal(row.content_version, 'v2');
  });
});

test('seed 与 migration 分离：seed 版本表独立于 schema version', async () => {
  await withDb(async () => {
    const v = query('PRAGMA user_version')[0];
    assert.equal(v.user_version ?? v.value, MAX_SCHEMA_VERSION, 'seed 应用不改 schema version（保持迁移后的最新版本）');
    applySeed(db, 'quiz-bank', '2026-08-01', () => {});
    const v2 = query('PRAGMA user_version')[0];
    assert.equal(v2.user_version ?? v2.value, MAX_SCHEMA_VERSION, 'schema version 保持');
  });
});

test('启动 seed（builtin-molecules）走统一版本框架：同版本跳过主体、性质补齐保留', async () => {
  const { syncBuiltinMolecules } = require(path.join(root, 'apps/server/src/seed/import-builtin.js'));
  await withDb(async () => {
    const first = syncBuiltinMolecules();
    assert.ok(first.inserted > 0, '首次导入内置分子');
    const second = syncBuiltinMolecules();
    assert.equal(second.inserted, 0, '同版本不重复插入');
    assert.ok(second.propertiesUpdated >= 0);
    const row = query('SELECT content_version FROM seed_versions WHERE seed_key = ?', ['builtin-molecules'])[0];
    assert.equal(row.content_version, '2', 'seed_versions 记录内容版本');
  });
});
