const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const WORKFLOWS_DIR = path.join(REPO_ROOT, '.github/workflows');

function readWorkflow(name) {
  const filePath = path.join(WORKFLOWS_DIR, name);
  assert.ok(fs.existsSync(filePath), `Workflow ${name} must exist`);
  return fs.readFileSync(filePath, 'utf8');
}

describe('CI workflow contracts', () => {
  it('quality.yml has cloud-server test job', () => {
    const content = readWorkflow('quality.yml');
    assert.ok(content.includes('cloud-server'), 'must have cloud-server job');
    assert.ok(content.includes('postgres:16-alpine'), 'must use postgres service');
    assert.ok(content.includes('permissions:'), 'must set permissions');
  });

  it('container.yml has concurrency and timeout', () => {
    const content = readWorkflow('container.yml');
    assert.ok(content.includes('concurrency:'), 'must have concurrency');
    assert.ok(content.includes('timeout-minutes:'), 'must have timeout');
    assert.ok(content.includes('permissions:'), 'must set permissions');
  });

  it('release.yml has version check step', () => {
    const content = readWorkflow('release.yml');
    assert.ok(content.includes('Check version tags'), 'must have version check step');
    assert.ok(content.includes('concurrency:'), 'must have concurrency');
    assert.ok(content.includes('permissions:'), 'must set permissions');
    assert.ok(content.includes('timeout-minutes:'), 'must have timeout on all jobs');
  });

  it('deploy.yml has environment protection', () => {
    const content = readWorkflow('deploy.yml');
    assert.ok(content.includes('environment:'), 'must have environment protection');
    assert.ok(content.includes('workflow_dispatch'), 'must be manual trigger');
    assert.ok(content.includes('concurrency:'), 'must have concurrency');
    assert.ok(content.includes('permissions:'), 'must set permissions');
    assert.ok(content.includes('timeout-minutes:'), 'must have timeout');
  });

  it('no workflow stores secrets in artifacts', () => {
    for (const name of ['quality.yml', 'container.yml', 'release.yml', 'deploy.yml']) {
      const content = readWorkflow(name);
      assert.ok(
        !content.includes('SSH_PRIVATE_KEY') || !content.includes('upload-artifact'),
        `${name} must not upload secrets as artifacts`
      );
    }
  });
});
