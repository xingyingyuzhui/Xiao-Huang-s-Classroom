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
  } catch { return false; }
}

describe('deploy-contract', () => {
  it('Dockerfile exists', () => {
    assert.ok(exists('apps/cloud-server/Dockerfile'));
  });

  it('compose.yml is parseable YAML', () => {
    assert.ok(exists('deploy/compose.yml'));
    const content = fs.readFileSync(path.join(ROOT, 'deploy/compose.yml'), 'utf8');
    assert.ok(content.includes('services:'));
    assert.ok(content.includes('postgres:'));
    assert.ok(content.includes('cloud-server:'));
  });

  it('env.example has required keys', () => {
    const content = fs.readFileSync(path.join(ROOT, 'deploy/env.example'), 'utf8');
    const required = [
      'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB',
      'DATABASE_URL', 'CLOUD_TOKEN_SIGNING_KEY', 'CLOUD_AI_KEK',
      'CLOUD_PUBLIC_ORIGIN', 'CLOUD_REGISTRATION_MODE', 'NODE_ENV',
    ];
    for (const key of required) {
      assert.ok(content.includes(key), `missing key: ${key}`);
    }
  });

  it('nginx config exists', () => {
    assert.ok(exists('deploy/nginx/xiaohuang.conf'));
    const content = fs.readFileSync(path.join(ROOT, 'deploy/nginx/xiaohuang.conf'), 'utf8');
    assert.ok(content.includes('proxy_pass'));
    assert.ok(content.includes('/api/cloud/'));
  });

  it('deploy scripts are executable', () => {
    const scripts = [
      'deploy/scripts/deploy.sh',
      'deploy/scripts/rollback.sh',
      'deploy/scripts/backup-postgres.sh',
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
  });
});
