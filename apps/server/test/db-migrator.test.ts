/**
 * DB migrator 合同（Program 7 Task 7.1：Vitest 迁移试点）。
 *
 * 从 test/server/db-migrations.test.cjs 迁移；同一目录迁移完成后
 * 删除旧 runner 重复用例（不双跑）。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mod = await import('../src/db/migrator.js');
const { MAX_SCHEMA_VERSION, readSchemaVersion, migrateToLatest, backupDatabase, restoreDatabase, sha256File } = mod;

function fakeDb(version: number) {
  let v = version;
  return {
    queryOne: () => ({ value: v }),
    exec(sql: string) {
      const m = /user_version = (\d+)/.exec(sql);
      if (m) v = Number(m[1]);
    },
  };
}

describe('DB migrator（Vitest 迁移试点）', () => {
  it('版本读取与迁移（无 migration 时 from=to）', () => {
    const db = fakeDb(0);
    expect(readSchemaVersion(db)).toBe(0);
    const r = migrateToLatest(db);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.from).toBe(0);
      expect(r.to).toBe(0);
    }
  });

  it('版本高于应用最大支持 → 只读失败', () => {
    const db = fakeDb(MAX_SCHEMA_VERSION + 1);
    const r = migrateToLatest(db);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('DB_NEWER_THAN_APP');
      expect(r.version).toBe(MAX_SCHEMA_VERSION + 1);
    }
  });

  it('backup/restore 往返与 checksum 校验', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-vitest-mig-'));
    const dbPath = path.join(dir, 'test.db');
    fs.writeFileSync(dbPath, 'content-v1');
    const { backupPath, checksum } = backupDatabase(dbPath);
    expect(checksum).toBe(sha256File(backupPath));
    const r = restoreDatabase(dbPath, backupPath);
    expect(r.ok).toBe(true);
    expect(fs.readFileSync(dbPath, 'utf8')).toBe('content-v1');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('restore checksum 不匹配失败且保留原 DB', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-vitest-mig-'));
    const dbPath = path.join(dir, 'test.db');
    fs.writeFileSync(dbPath, 'original');
    const { backupPath } = backupDatabase(dbPath);
    fs.writeFileSync(backupPath, 'tampered');
    const r = restoreDatabase(dbPath, backupPath);
    expect(r.ok).toBe(false);
    expect(fs.readFileSync(dbPath, 'utf8')).toBe('original');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
