/**
 * 账户/云同步 Program Task 1 文档合同：边界文档、14 类资源登记、secret 忽略规则。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const DOCS = path.join(root, 'docs/operations');
const REQUIRED_DOCS = [
  'account-data-boundaries.md',
  'account-threat-model.md',
  'sync-resource-inventory.md',
  'web-offline-capability-matrix.md',
];

/** 14 类同步资源（Wave 1–4） */
const SYNC_RESOURCE_TYPES = [
  'teacher-settings',
  'class-settings',
  'student-roster',
  'rollcall-records',
  'teaching-progress',
  'mastery-wrong-book',
  'chem-custom-labs',
  'chem-custom-molecules',
  'chem-custom-reactions',
  'math-problems',
  'physics-sim-config',
  'math-graph-document',
  'ai-conversation-history',
  'classroom-drafts',
];

/** 六类数据分类 */
const DATA_CATEGORIES = [
  'devicePreference',
  'accountSetting',
  'personalSubjectWorkspace',
  'classSubjectWorkspace',
  'localOnly',
  'cloudSecret',
];

test('Task 1 operations docs exist', () => {
  for (const name of REQUIRED_DOCS) {
    const abs = path.join(DOCS, name);
    assert.ok(fs.existsSync(abs), `missing ${name}`);
    assert.ok(fs.statSync(abs).size > 500, `${name} too short`);
  }
});

test('account-data-boundaries lists six data categories', () => {
  const text = fs.readFileSync(path.join(DOCS, 'account-data-boundaries.md'), 'utf8');
  for (const cat of DATA_CATEGORIES) {
    assert.match(text, new RegExp(cat), `missing category ${cat}`);
  }
});

test('sync-resource-inventory registers all 14 resource types', () => {
  const text = fs.readFileSync(path.join(DOCS, 'sync-resource-inventory.md'), 'utf8');
  for (const type of SYNC_RESOURCE_TYPES) {
    assert.match(text, new RegExp(type.replace(/-/g, '[-_]'), 'i'), `missing resource ${type}`);
  }
});

test('account-threat-model covers STRIDE themes', () => {
  const text = fs.readFileSync(path.join(DOCS, 'account-threat-model.md'), 'utf8');
  for (const theme of ['Spoofing', 'Tampering', 'Repudiation', 'Information disclosure', 'Denial of service', 'Elevation of privilege']) {
    assert.match(text, new RegExp(theme, 'i'), `missing STRIDE theme ${theme}`);
  }
});

test('web-offline-capability-matrix inventories /api usage classes', () => {
  const text = fs.readFileSync(path.join(DOCS, 'web-offline-capability-matrix.md'), 'utf8');
  for (const cls of [
    'bundled-readonly',
    'local-repository',
    'cloud-only-ai',
    'cloud-sync',
    'must-migrate',
  ]) {
    assert.match(text, new RegExp(cls), `missing API class ${cls}`);
  }
});

test('.gitignore blocks secrets and env files', () => {
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const rule of ['.env', '.env.*', '!.env.example', '*.pem', '*.key', '*.p12', '*.pfx']) {
    assert.match(gi, new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing gitignore rule ${rule}`);
  }
});
