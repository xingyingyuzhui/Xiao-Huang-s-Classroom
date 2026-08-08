/**
 * database lock 合同（D-test 批次：node:test → vitest 迁移，行为逐字保持）。
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
  acquireDatabaseLock,
  releaseDatabaseLock,
} = require(path.join(dirname, '../src/db/sqlite'));

test('database lock prevents a second writer and is released cleanly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-lock-test-'));
  const dbPath = path.join(dir, 'chem-lab.db');
  try {
    acquireDatabaseLock(dbPath);
    assert.throws(
      () => acquireDatabaseLock(dbPath),
      /正在被另一个实例使用/,
    );
    releaseDatabaseLock();

    assert.doesNotThrow(() => acquireDatabaseLock(dbPath));
  } finally {
    releaseDatabaseLock();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
