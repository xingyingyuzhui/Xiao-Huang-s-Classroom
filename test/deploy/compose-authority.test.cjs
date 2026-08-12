/**
 * Phase 9: one compose base + prod override; prod never deploys :latest;
 * nginx public allowlist stays closed; migrate CLI is a real exit path.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

describe('compose authority', () => {
  const base = read('deploy/compose.yml');
  const prod = read('deploy/compose.prod.yml');

  it('keeps a single base + prod override (not two full stacks)', () => {
    assert.match(base, /^services:/m);
    assert.match(base, /^\s+postgres:/m);
    assert.match(base, /^\s+cloud-server:/m);
    assert.match(base, /^\s+lab-server:/m);
    assert.match(prod, /Production override/);
    assert.doesNotMatch(prod, /^\s+build:/m);
    assert.doesNotMatch(prod, /cloud_pg_data|lab_sqlite_data/);
  });

  it('does not tag app images as latest in base or prod', () => {
    assert.doesNotMatch(base, /xiaohuang-(cloud|lab)-server:latest/);
    assert.doesNotMatch(prod, /:latest\b/);
    assert.doesNotMatch(prod, /\blatest\b/);
  });

  it('pins prod app images to CLOUD_IMAGE_TAG / LAB_IMAGE_TAG', () => {
    assert.match(prod, /xiaohuang-cloud-server:\$\{CLOUD_IMAGE_TAG:/);
    assert.match(prod, /xiaohuang-lab-server:\$\{LAB_IMAGE_TAG:/);
  });

  it('does not publish postgres on the host', () => {
    assert.doesNotMatch(base, /['"]?\d+:5432['"]?/);
    assert.doesNotMatch(prod, /['"]?\d+:5432['"]?/);
    assert.match(base, /Never publish 5432|expose:\s*\n\s+- ['"]5432['"]/s);
  });

  it('hardens running services', () => {
    for (const name of ['no-new-privileges', 'cap_drop', 'read_only', 'pids_limit', 'healthcheck']) {
      assert.match(base, new RegExp(name));
    }
    assert.match(base, /user:\s+'1001:1001'/);
    assert.match(base, /max-size:/);
  });

  it('uses explicit volume names matching the live host', () => {
    assert.match(base, /name:\s+deploy_pgdata/);
    assert.match(base, /name:\s+deploy_labdata/);
  });
});

describe('deploy scripts use the same compose paths', () => {
  const lib = read('deploy/scripts/lib.sh');
  const deploy = read('deploy/scripts/deploy.sh');
  const rollback = read('deploy/scripts/rollback.sh');

  it('lib.sh points at deploy/compose.yml + compose.prod.yml', () => {
    assert.match(lib, /compose\.yml/);
    assert.match(lib, /compose\.prod\.yml/);
  });

  it('deploy.sh runs node dist/migrate.js and never --migrate-only', () => {
    assert.match(deploy, /node dist\/migrate\.js/);
    assert.doesNotMatch(deploy, /--migrate-only/);
    assert.doesNotMatch(deploy, /dist\/server\.js/);
  });

  it('rollback.sh requires web + cloud + lab shas and does not migrate', () => {
    assert.match(rollback, /web-sha/);
    assert.match(rollback, /cloud-sha/);
    assert.match(rollback, /lab-sha/);
    assert.doesNotMatch(rollback, /dist\/migrate\.js/);
    assert.doesNotMatch(rollback, /--migrate-only/);
    assert.match(rollback, /no automatic down-migration/);
  });

  it('backup scripts exist and do not echo dump contents', () => {
    for (const rel of [
      'deploy/scripts/backup-postgres.sh',
      'deploy/scripts/backup-lab-sqlite.sh',
      'deploy/scripts/backup-daily.sh',
    ]) {
      assert.ok(exists(rel), rel);
      const body = read(rel);
      assert.doesNotMatch(body, /SELECT \*/i);
      assert.doesNotMatch(body, /pg_dump[^\n]*\|[^\n]*cat/);
    }
  });
});

describe('migrate CLI entry', () => {
  it('tsup builds src/migrate.ts', () => {
    const tsup = read('apps/cloud-server/tsup.config.ts');
    assert.match(tsup, /src\/migrate\.ts/);
    assert.match(tsup, /src\/server\.ts/);
  });

  it('migrate.ts applies migrations and exits without listen', () => {
    const src = read('apps/cloud-server/src/migrate.ts');
    assert.match(src, /migrateToLatest/);
    assert.match(src, /process\.exitCode = 1/);
    assert.doesNotMatch(src, /\.listen\(/);
    assert.doesNotMatch(src, /createServer/);
    assert.doesNotMatch(src, /startCloudServer/);
  });

  it('Dockerfiles declare OCI label build args', () => {
    for (const rel of ['apps/cloud-server/Dockerfile', 'apps/server/Dockerfile']) {
      const df = read(rel);
      assert.match(df, /ARG GIT_SHA=/);
      assert.match(df, /ARG BUILD_TIME=/);
      assert.match(df, /ARG APP_VERSION=/);
      assert.match(df, /ARG SOURCE_REPO=/);
      assert.match(df, /org\.opencontainers\.image\.revision/);
      assert.match(df, /org\.opencontainers\.image\.created/);
      assert.match(df, /org\.opencontainers\.image\.version/);
      assert.match(df, /org\.opencontainers\.image\.source/);
    }
  });
});
