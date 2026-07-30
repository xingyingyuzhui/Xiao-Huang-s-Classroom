const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('AI router is a thin composition root for feature route modules', () => {
  const entry = source('apps/server/src/routes/ai.js');

  assert.match(entry, /require\('\.\/ai\/molecules'\)/);
  assert.match(entry, /require\('\.\/ai\/quiz'\)/);
  assert.match(entry, /require\('\.\/ai\/chemistry'\)/);
  assert.ok(fs.existsSync(path.join(root, 'apps/server/src/routes/ai/molecules.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/server/src/routes/ai/quiz.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/server/src/routes/ai/chemistry.js')));
});

test('AI classroom entry delegates focused UI concerns to feature modules', () => {
  const entry = source('apps/web/src/chemistry/ai-classroom/entry.js');

  assert.match(entry, /from '\.\/quiz-config\.js'/);
  assert.match(entry, /from '\.\/lab-shell\.js'/);
  assert.match(entry, /from '\.\/wrong-book\.js'/);
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/chemistry/ai-classroom/quiz-config.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/chemistry/ai-classroom/lab-shell.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/chemistry/ai-classroom/wrong-book.js')));
});

test('AI classroom quiz engine lives under chemistry/ai-classroom/quiz-* modules', () => {
  const entry = source('apps/web/src/chemistry/ai-classroom/entry.js');
  assert.match(entry, /from '\.\/quiz-shell\.js'/);
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/chemistry/ai-classroom/quiz-shell.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/chemistry/ai-classroom/quiz-model.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/chemistry/ai-classroom/quiz-views.js')));
  assert.equal(/function renderPaper\(/.test(entry), false);
  assert.equal(/function renderResultList\(/.test(entry), false);
  assert.equal(/async function generateQuiz\(/.test(entry), false);
});

test('app shell does not static-import heavy modules (Three.js, battle, classroom)', () => {
  const entry = source('apps/web/src/app/shell.js');
  const chemistry = source('apps/web/src/subjects/classrooms/chemistry-classroom.js');

  assert.equal(
    /import\s+.*from\s+['"].*molecule-list\.js['"]/.test(entry),
    false,
    'shell must not static-import molecule-list',
  );
  assert.equal(
    /import\s+.*from\s+['"].*molecule-list\.js['"]/.test(chemistry),
    false,
    'molecule-list must be dynamically imported',
  );
  assert.equal(
    /import\s+.*from\s+['"].*molecule-ai\.js['"]/.test(chemistry),
    false,
    'molecule-ai must be dynamically imported',
  );
  assert.equal(
    /import\s+.*from\s+['"].*molecule-reactions\.js['"]/.test(chemistry),
    false,
    'molecule-reactions must be dynamically imported',
  );
  assert.equal(
    /import\s+.*from\s+['"].*electron-renderer\.js['"]/.test(chemistry),
    false,
    'electron-renderer must be dynamically imported',
  );
  assert.equal(
    /import\s+.*from\s+['"].*ai-classroom\.js['"]/.test(chemistry),
    false,
    'ai-classroom must be dynamically imported',
  );
  assert.equal(
    /import\s+.*from\s+['"].*element-battle\.js['"]/.test(chemistry),
    false,
    'element-battle must be dynamically imported',
  );

  assert.match(entry, /subjects\/classrooms\/registry/);
  assert.match(entry, /shared\/ui\/settings/);
  assert.match(entry, /shared\/ui\/brand-tip/);
  assert.match(entry, /shared\/ui\/side-drawer/);
  assert.doesNotMatch(entry, /chemistry\/periodic-table/);
  assert.match(entry, /onAppRevealed/);
  assert.match(chemistry, /chemistry\/periodic-table/);
  assert.match(chemistry, /chemistry\/molar\/ui/);
  assert.match(chemistry, /@xiaohuang\/subject-settings/);
  assert.match(chemistry, /tabbed-classroom\.js/);
  const tabbed = source('apps/web/src/subjects/classrooms/tabbed-classroom.js');
  assert.match(tabbed, /feature-loader\.js/);
});

test('panel-loading module exists and is used for lazy tab overlay', () => {
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/app/panel-loading.js')));
  const loading = source('apps/web/src/app/panel-loading.js');
  assert.match(loading, /export function showPanelLoading/);
  assert.match(loading, /export function hidePanelLoading/);
  assert.match(loading, /export function showPanelError/);
  assert.match(loading, /\.hidden\s*=\s*true/);
});

test('molecule feature is packaged under chemistry/molecule/', () => {
  const entry = source('apps/web/src/subjects/classrooms/chemistry-classroom.js');
  assert.match(entry, /import\(['"].*chemistry\/molecule\//);
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/chemistry/molecule/index.js')));
});
