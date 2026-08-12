/**
 * Source contract: public account-cloud mode must not require anonymous lab /api/settings.
 * Behavioral coverage: test/web/local-settings.vitest.ts + settings-toast / settings-focus-busy.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const settingsSrc = fs.readFileSync(
  path.join(root, 'apps/web/src/shared/ui/settings.js'),
  'utf8',
);
const clientSrc = fs.readFileSync(
  path.join(root, 'apps/web/src/shared/api/client.js'),
  'utf8',
);
const localSettingsPath = path.join(
  root,
  'apps/web/src/shared/persistence/local-settings.js',
);

test('local-settings helper exists for device prefs', () => {
  assert.ok(fs.existsSync(localSettingsPath), 'local-settings.js must exist');
  const src = fs.readFileSync(localSettingsPath, 'utf8');
  assert.match(src, /xh-theme-id/);
  assert.match(src, /此数据当前仅保存在本机/);
  assert.match(src, /export function readLocalSettings/);
  assert.match(src, /export function writeLocalSettings/);
});

test('client.js settingsApi uses local fallback when accountCloudProgram is on', () => {
  assert.match(clientSrc, /isFeatureEnabled\(['"]accountCloudProgram['"]\)/);
  assert.match(clientSrc, /from '\.\.\/persistence\/local-settings\.js'/);
  assert.match(clientSrc, /readLocalSettings\(/);
  assert.match(clientSrc, /writeLocalSettings\(/);
  const getBlock = clientSrc.match(/async get\(\)\s*\{([\s\S]*?)\n  \},/);
  assert.ok(getBlock, 'settingsApi.get body');
  assert.match(getBlock[1], /usePublicCloudSettings\(\)|accountCloudProgram/);
  assert.match(getBlock[1], /readLocalSettings\(/);
  assert.match(getBlock[1], /return request\('\/settings'\)/);
});

test('settings.js does not unconditionally require lab settingsApi in cloud mode', () => {
  assert.match(settingsSrc, /isFeatureEnabled\(['"]accountCloudProgram['"]\)/);
  assert.match(settingsSrc, /LOCAL_ONLY_HINT/);
  assert.match(settingsSrc, /hint\.textContent = LOCAL_ONLY_HINT/);
  assert.match(settingsSrc, /writeLocalThemeId\(/);
  assert.match(settingsSrc, /readLocalThemeId\(/);
  assert.doesNotMatch(
    settingsSrc,
    /fetch\(['"`]\/api\/settings/,
    'settings.js must not fetch lab /api/settings directly',
  );
  assert.match(settingsSrc, /ensureLocalOnlyHint\(subjectSection\)/);
});
