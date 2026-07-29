const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');

test('subject catalog exports chemistry as the only ready subject', async () => {
  const mod = await import(pathToFileURL(path.join(root, 'src/subjects/catalog.js')).href);
  const ready = mod.SUBJECTS.filter((s) => s.status === 'ready');
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, 'chemistry');
  assert.ok(mod.getSubject('physics')?.status === 'soon');
});

test('main.js wires subject hub modules', () => {
  const src = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  assert.match(src, /from '\.\/subjects\/hub\.js'/);
  assert.match(src, /from '\.\/subjects\/chrome\.js'/);
  assert.match(src, /showHub\(/);
  assert.match(src, /enterSubject\(/);
});

test('index.html has subject hub and chrome hooks', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="subjectHub"/);
  assert.match(html, /id="btnSubjectChip"/);
  assert.match(html, /id="btnSettingsSubjectHub"/);
});
