/**
 * migration 生产接线（R5.2）：真实 sql.js DB 通过 initDatabase 升级。
 * （D-test 批次：node:test → vitest 迁移，行为逐字保持）
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

const { initDatabase, closeDatabase, query } = require(path.join(root, 'apps/server/src/db/sqlite.js'));
const { MAX_SCHEMA_VERSION } = require(path.join(root, 'apps/server/src/db/migrator.js'));

function withDb(fn: (dbPath: string, dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-mig-int-'));
  const dbPath = path.join(dir, 'chem.db');
  return initDatabase(dbPath).then(async () => {
    try {
      await fn(dbPath, dir);
    } finally {
      closeDatabase();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('空库升级：initDatabase 后 schema version=1 且 app_meta 表存在', async () => {
  await withDb(async () => {
    const v = query('PRAGMA user_version')[0];
    assert.equal(v.user_version ?? v.value, MAX_SCHEMA_VERSION, '空库升级到最新版本');
    const meta = query("SELECT name FROM sqlite_master WHERE type='table' AND name='app_meta'");
    assert.equal(meta.length, 1, 'app_meta 表由 migration v1 创建');
  });
});

test('重复初始化幂等：二次 init 不重复迁移', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-mig-int-'));
  const dbPath = path.join(dir, 'chem.db');
  await initDatabase(dbPath);
  const bakCount = () => fs.readdirSync(dir).filter((n) => n.includes('.bak-')).length;
  const before = bakCount();
  closeDatabase();
  await initDatabase(dbPath);
  const v = query('PRAGMA user_version')[0];
  assert.equal(v.user_version ?? v.value, MAX_SCHEMA_VERSION);
  const after = bakCount();
  closeDatabase();
  assert.equal(after, before, '幂等：二次初始化不重复备份');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('高版本 DB 拒绝写入（只读失败）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-mig-int-'));
  const dbPath = path.join(dir, 'future.db');
  // 构造一个版本高于应用最大支持的 DB
  const SQL = require(path.join(root, 'node_modules/sql.js'));
  return SQL().then((sqlModule: { Database: new () => { run: (sql: string) => void; export: () => Uint8Array; close: () => void } }) => {
    const db = new sqlModule.Database();
    db.run('CREATE TABLE t (x INTEGER)');
    db.run(`PRAGMA user_version = ${MAX_SCHEMA_VERSION + 1}`);
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    db.close();
    // initDatabase 必须拒绝（迁移失败 → 抛错）
    return initDatabase(dbPath)
      .then(() => {
        closeDatabase();
        assert.fail('高版本 DB 必须拒绝启动');
      })
      .catch((err: { message?: unknown }) => {
        closeDatabase();
        assert.match(String(err.message), /数据库迁移失败.*DB_NEWER_THAN_APP/, '拒绝原因含 DB_NEWER_THAN_APP');
      })
      .finally(() => fs.rmSync(dir, { recursive: true, force: true }));
  });
});

test('升级前创建 checksum backup（旧版本升级路径）', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-mig-int-'));
  const dbPath = path.join(dir, 'old.db');
  const SQL = require(path.join(root, 'node_modules/sql.js'));
  return SQL().then(async (sqlModule: { Database: new () => { run: (sql: string) => void; export: () => Uint8Array; close: () => void } }) => {
    const db = new sqlModule.Database();
    db.run('CREATE TABLE old_table (x INTEGER)');
    db.run('PRAGMA user_version = 0');
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    db.close();
    await initDatabase(dbPath);
    const baks = fs.readdirSync(dir).filter((n) => n.includes('.bak-') && n.endsWith('.sha256'));
    assert.ok(baks.length >= 1, '升级前必须创建 checksum 备份');
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
