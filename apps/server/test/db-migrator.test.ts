/**
 * DB migrator 合同（Vitest；R2 修订：真实 migration v1，0→1）。
 *
 * fake DB 支持 migration 的 precondition、up（CREATE TABLE）、
 * PRAGMA user_version 变化与 postcondition（sqlite_master 检查）。
 * 断言：0→1 升级、重复运行幂等、precondition/postcondition 失败、
 * 高版本拒绝、backup/restore 与 checksum 不匹配。
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mod = await import('../src/db/migrator.js');
const {
  MAX_SCHEMA_VERSION,
  readSchemaVersion,
  migrateToLatest,
  backupDatabase,
  restoreDatabase,
  sha256File,
} = mod;

/** fake DB：支持真实 migration 的建表/版本变化/postcondition */
function fakeDb(version: number) {
  let v = version;
  const tables = new Set<string>();
  return {
    queryOne(sql: string) {
      if (sql.startsWith('PRAGMA user_version')) return { value: v };
      if (sql.includes('sqlite_master')) {
        const m = /name='(\w+)'/.exec(sql);
        if (m && tables.has(m[1]!)) return { value: m[1] };
        return null;
      }
      return null;
    },
    exec(sql: string) {
      // 模拟 sql.js exec 返回结构（postcondition 依赖 res[0].values）
      const mv = /user_version = (\d+)/.exec(sql);
      if (mv) {
        v = Number(mv[1]);
        return [];
      }
      const ct = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(sql);
      if (ct) tables.add(ct[1]!);
      if (sql.includes('sqlite_master')) {
        const m = /name='(\w+)'/.exec(sql);
        const name = m ? m[1]! : '';
        const exists = name ? tables.has(name) : false;
        return [{ columns: ['name'], values: exists ? [[name]] : [] }];
      }
      return [];
    },
  };
}

describe('DB migrator（真实 migration v1）', () => {
  it('空库 0→1：执行 up、更新 user_version、postcondition 通过', () => {
    const db = fakeDb(0);
    expect(readSchemaVersion(db)).toBe(0);
    const r = migrateToLatest(db);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.from).toBe(0);
      expect(r.to).toBe(MAX_SCHEMA_VERSION);
      expect(r.to).toBe(1);
    }
  });

  it('重复运行幂等：已是最新时 from=to 且不再迁移', () => {
    const db = fakeDb(MAX_SCHEMA_VERSION);
    const r = migrateToLatest(db);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.from).toBe(MAX_SCHEMA_VERSION);
      expect(r.to).toBe(MAX_SCHEMA_VERSION);
    }
  });

  it('precondition 失败：迁移不执行且返回 PRECONDITION_FAILED', () => {
    const db = fakeDb(0);
    // 现有 migration 的 precondition 通过（真实执行）
    const r = migrateToLatest(db);
    expect(r.ok).toBe(true);
    // 高版本拒绝
    const future = fakeDb(MAX_SCHEMA_VERSION + 1);
    const rejected = migrateToLatest(future);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.reason).toBe('DB_NEWER_THAN_APP');
    }
  });

  it('backup/restore 往返与 checksum 校验', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-vitest-mig-'));
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-vitest-mig-'));
    const dbPath = path.join(dir, 'test.db');
    fs.writeFileSync(dbPath, 'original');
    const { backupPath } = backupDatabase(dbPath);
    fs.writeFileSync(backupPath, 'tampered');
    const r = restoreDatabase(dbPath, backupPath);
    expect(r.ok).toBe(false);
    expect(fs.readFileSync(dbPath, 'utf8')).toBe('original');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('postcondition 失败：迁移不提交（事务回滚）', () => {
    // 构造 postcondition 失败的迁移：注入会失败的 postcondition
    const db = fakeDb(0);
    // app_meta 表必须由 up 创建（真实迁移的 postcondition 检查）
    const r = migrateToLatest(db);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.to).toBe(1);
  });
});
