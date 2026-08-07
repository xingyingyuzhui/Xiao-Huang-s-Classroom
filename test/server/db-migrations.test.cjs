/**
 * DB migration 框架合同（Program 5 Task 5.5；spec §11.3）。
 *
 * 断言：版本读取/迁移/高版本只读拒绝；backup 带 checksum；
 * restore 复制→校验→原子 rename，失败保留原 DB 与备份。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const {
  MAX_SCHEMA_VERSION,
  readSchemaVersion,
  migrateToLatest,
  backupDatabase,
  restoreDatabase,
  sha256File,
} = require(path.join(root, 'apps/server/src/db/migrator.js'));

function fakeDb(version, execImpl) {
  let v = version;
  return {
    queryOne: () => ({ value: v }),
    exec(sql) {
      if (/user_version = (\d+)/.test(sql)) {
        v = Number(/user_version = (\d+)/.exec(sql)[1]);
      } else if (execImpl) {
        execImpl(sql);
      }
    },
  };
}

test('版本读取与迁移（无 migration 时 from=to）', () => {
  const db = fakeDb(0);
  assert.equal(readSchemaVersion(db), 0);
  const r = migrateToLatest(db);
  assert.equal(r.ok, true);
  assert.equal(r.from, 0);
  assert.equal(r.to, 0);
});

test('版本高于应用最大支持 → 只读失败（禁止降级写入）', () => {
  const db = fakeDb(MAX_SCHEMA_VERSION + 1);
  const r = migrateToLatest(db);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, 'DB_NEWER_THAN_APP');
    assert.equal(r.version, MAX_SCHEMA_VERSION + 1);
  }
});

test('backup 生成带 checksum 的可恢复备份', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-mig-test-'));
  const dbPath = path.join(dir, 'test.db');
  fs.writeFileSync(dbPath, 'fake-db-content');
  const { backupPath, checksum } = backupDatabase(dbPath);
  assert.ok(fs.existsSync(backupPath), '备份文件存在');
  assert.equal(checksum, sha256File(backupPath));
  assert.equal(fs.readFileSync(`${backupPath}.sha256`, 'utf8').trim(), checksum);
  // restore：内容一致
  const r = restoreDatabase(dbPath, backupPath);
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(dbPath, 'utf8'), 'fake-db-content');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('restore：checksum 不匹配失败且保留原 DB', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-mig-test-'));
  const dbPath = path.join(dir, 'test.db');
  fs.writeFileSync(dbPath, 'original');
  const { backupPath } = backupDatabase(dbPath);
  // 篡改备份内容（checksum 文件不更新）
  fs.writeFileSync(backupPath, 'tampered');
  const r = restoreDatabase(dbPath, backupPath);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'CHECKSUM_MISMATCH');
  assert.equal(fs.readFileSync(dbPath, 'utf8'), 'original', '原 DB 未被覆盖');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('restore：备份缺失返回 BACKUP_MISSING', () => {
  const r = restoreDatabase('/nonexistent/db.sqlite', '/nonexistent/backup.sqlite');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'BACKUP_MISSING');
});
