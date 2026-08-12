const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function isExecutable(rel) {
  try {
    fs.accessSync(path.join(ROOT, rel), fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('deploy-contract', () => {
  it('Dockerfile exists', () => {
    assert.ok(exists('apps/cloud-server/Dockerfile'));
    assert.ok(exists('apps/server/Dockerfile'));
  });

  it('compose.yml is parseable YAML', () => {
    assert.ok(exists('deploy/compose.yml'));
    const content = read('deploy/compose.yml');
    assert.ok(content.includes('services:'));
    assert.ok(content.includes('postgres:'));
    assert.ok(content.includes('cloud-server:'));
  });

  it('compose.prod.yml is an override without :latest', () => {
    assert.ok(exists('deploy/compose.prod.yml'));
    const prod = read('deploy/compose.prod.yml');
    assert.match(prod, /CLOUD_IMAGE_TAG/);
    assert.match(prod, /LAB_IMAGE_TAG/);
    assert.doesNotMatch(prod, /:latest\b/);
  });

  it('Dockerfiles declare OCI revision labels and bake GIT_SHA env', () => {
    for (const rel of ['apps/cloud-server/Dockerfile', 'apps/server/Dockerfile']) {
      const content = read(rel);
      assert.match(content, /org\.opencontainers\.image\.revision/);
      assert.match(content, /org\.opencontainers\.image\.created/);
      assert.match(content, /org\.opencontainers\.image\.version/);
      assert.match(content, /org\.opencontainers\.image\.source/);
      assert.match(content, /ENV GIT_SHA=/);
    }
  });

  it('deploy workflow is not a placeholder and verifies SHA images', () => {
    const content = read('.github/workflows/deploy.yml');
    assert.doesNotMatch(content, /Post-deploy health check placeholder/);
    assert.match(content, /Release Verify/);
    assert.match(content, /npm run quality/);
    assert.match(content, /xiaohuang-cloud-server:\$\{GIT_SHA\}/);
    assert.match(content, /does not deploy/i);
  });

  it('env.example has required keys', () => {
    const content = read('deploy/env.example');
    const required = [
      'POSTGRES_USER',
      'POSTGRES_PASSWORD',
      'POSTGRES_DB',
      'DATABASE_URL',
      'CLOUD_TOKEN_SIGNING_KEY',
      'CLOUD_AI_KEK',
      'CLOUD_PUBLIC_ORIGIN',
      'CLOUD_REGISTRATION_MODE',
      'NODE_ENV',
    ];
    for (const key of required) {
      assert.ok(content.includes(key), `missing key: ${key}`);
    }
  });

  it('nginx config exists and does not proxy public /api/ to lab', () => {
    assert.ok(exists('deploy/nginx/xiaohuang.conf'));
    const content = read('deploy/nginx/xiaohuang.conf');
    assert.ok(content.includes('proxy_pass'));
    assert.ok(content.includes('/api/cloud/'));
    assert.doesNotMatch(content, /proxy_pass\s+http:\/\/127\.0\.0\.1:3001/);
    assert.match(content, /HTTPS GATE/);
  });

  it('deploy scripts are executable', () => {
    const scripts = [
      'deploy/scripts/deploy.sh',
      'deploy/scripts/rollback.sh',
      'deploy/scripts/backup-postgres.sh',
      'deploy/scripts/backup-lab-sqlite.sh',
      'deploy/scripts/backup-daily.sh',
      'deploy/scripts/restore-postgres.sh',
      'deploy/scripts/verify-release.sh',
    ];
    for (const s of scripts) {
      assert.ok(exists(s), `missing: ${s}`);
      assert.ok(isExecutable(s), `not executable: ${s}`);
    }
  });

  it('operations docs exist', () => {
    assert.ok(exists('docs/operations/cloud-deployment.md'));
    assert.ok(exists('docs/operations/backup-restore.md'));
    assert.ok(exists('docs/operations/deploy-rollback-runbook.md'));
  });
});
