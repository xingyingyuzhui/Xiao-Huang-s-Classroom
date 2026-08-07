/**
 * Seed versioning（Program 5 Task 5.6；spec §11.3「Seed 使用内容版本和幂等 upsert」）。
 *
 * - seed_versions 表记录内容版本（seedKey → contentVersion + appliedAt）。
 * - applySeed：版本相同则跳过（幂等）；不同则执行 upsert 并更新版本。
 * - 与 migration 分离：migration 管 schema，seed 管内容。
 */
function ensureSeedVersionsTable(exec) {
  exec(`CREATE TABLE IF NOT EXISTS seed_versions (
    seed_key TEXT PRIMARY KEY,
    content_version TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
}

/**
 * @param {{
 *   exec: (sql: string) => unknown,
 *   run: (sql: string, params?: unknown[]) => unknown,
 *   queryOne: (sql: string, params?: unknown[]) => { value?: unknown } | null,
 * }} db
 * @param {string} seedKey
 * @param {string} contentVersion
 * @param {() => void} upsert
 * @returns {{ applied: boolean, version: string }}
 */
function applySeed(db, seedKey, contentVersion, upsert) {
  ensureSeedVersionsTable(db.exec);
  const row = db.queryOne('SELECT content_version FROM seed_versions WHERE seed_key = ?', [seedKey]);
  const stored = row ? (row.value ?? row.content_version) : null;
  if (stored === contentVersion) {
    return { applied: false, version: contentVersion };
  }
  upsert();
  db.run(
    `INSERT INTO seed_versions (seed_key, content_version, applied_at) VALUES (?, ?, ?)
     ON CONFLICT(seed_key) DO UPDATE SET content_version = excluded.content_version, applied_at = excluded.applied_at`,
    [seedKey, contentVersion, Date.now()],
  );
  return { applied: true, version: contentVersion };
}

module.exports = { applySeed, ensureSeedVersionsTable };
