/**
 * 数据库 migration 框架（Program 5 Task 5.5；spec §11.3）。
 *
 * - schema version 用 SQLite PRAGMA user_version（sql.js 支持）。
 * - 每个 migration：编号、up、precondition、postcondition、backwardReadable。
 * - 启动时版本高于应用最大支持版本 → 只读失败，禁止降级/写入。
 * - backup：复制到同目录带时间戳/checksum 的可恢复备份；restore 用
 *   「复制到临时文件 → 完整性校验 → 原子 rename」，失败保留原 DB 与备份。
 *
 * 本模块是新增能力，不改动现有 initDatabase 的既有建表路径
 * （既有库保持原行为；迁移由调用方显式接入）。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/** 应用当前支持的 DB schema 最大版本（与 MIGRATIONS 编号一致）。 */
const MAX_SCHEMA_VERSION = 0;

/** 迁移注册表：按编号递增；expand 优先（先加表/列），破坏性删除至少延后一版。 */
const MIGRATIONS = [];

/**
 * 读取当前 schema 版本。
 * @param {{ queryOne: (sql: string) => { value?: unknown } | null }} db
 */
function readSchemaVersion(db) {
  const row = db.queryOne('PRAGMA user_version');
  const raw = row ? (row.value ?? row.user_version ?? 0) : 0;
  return Number(raw) || 0;
}

/**
 * 迁移到最新：版本高于应用最大 → 返回失败（只读，禁止降级）。
 * @param {{ exec: (sql: string) => unknown, queryOne: (sql: string) => { value?: unknown } | null }} db
 * @returns {{ ok: true, from: number, to: number } | { ok: false, reason: 'DB_NEWER_THAN_APP', version: number }}
 */
function migrateToLatest(db) {
  const current = readSchemaVersion(db);
  if (current > MAX_SCHEMA_VERSION) {
    return { ok: false, reason: 'DB_NEWER_THAN_APP', version: current };
  }
  const from = current;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    // precondition：不满足则跳过/失败（默认要求前序版本就位）
    const pre = migration.precondition ? migration.precondition(db) : true;
    if (!pre) {
      return { ok: false, reason: 'PRECONDITION_FAILED', version: migration.version };
    }
    db.exec(migration.up);
    db.exec(`PRAGMA user_version = ${migration.version}`);
    const post = migration.postcondition ? migration.postcondition(db) : true;
    if (!post) {
      return { ok: false, reason: 'POSTCONDITION_FAILED', version: migration.version };
    }
  }
  return { ok: true, from, to: readSchemaVersion(db) };
}

/**
 * 备份：同目录复制 + 时间戳 + checksum。
 * @param {string} dbPath
 * @returns {{ backupPath: string, checksum: string }}
 */
function backupDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(dir, `${path.basename(dbPath)}.bak-${stamp}`);
  fs.copyFileSync(dbPath, backupPath);
  const checksum = sha256File(backupPath);
  fs.writeFileSync(`${backupPath}.sha256`, checksum);
  return { backupPath, checksum };
}

/**
 * restore：复制到临时文件 → 校验 → 原子 rename；失败保留原 DB 与备份。
 * @param {string} dbPath
 * @param {string} backupPath
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function restoreDatabase(dbPath, backupPath) {
  if (!fs.existsSync(backupPath)) return { ok: false, reason: 'BACKUP_MISSING' };
  const tmpPath = `${dbPath}.restore-tmp`;
  try {
    fs.copyFileSync(backupPath, tmpPath);
    const expected = fs.existsSync(`${backupPath}.sha256`)
      ? fs.readFileSync(`${backupPath}.sha256`, 'utf8').trim()
      : null;
    if (expected && sha256File(tmpPath) !== expected) {
      fs.rmSync(tmpPath, { force: true });
      return { ok: false, reason: 'CHECKSUM_MISMATCH' };
    }
    fs.renameSync(tmpPath, dbPath); // 原子替换
    return { ok: true };
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    return { ok: false, reason: `RESTORE_FAILED:${String(err)}` };
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

module.exports = {
  MAX_SCHEMA_VERSION,
  MIGRATIONS,
  readSchemaVersion,
  migrateToLatest,
  backupDatabase,
  restoreDatabase,
  sha256File,
};
