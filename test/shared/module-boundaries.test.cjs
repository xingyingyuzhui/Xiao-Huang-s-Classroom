/**
 * 模块结构合同测试（D10 收口后定位：补充 lint:arch）。
 *
 * 依赖方向已由 tooling/architecture/check-dependencies.mjs 脚本化扫描
 * （337 文件，无人工清单）；本文件保留**结构合同**断言：组合根薄转发、
 * 命名空间归属、动态加载纪律（重型 feature 不静态 import）。
 */
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = require('../helpers/repo-root.js');

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

test('chemistry domain routes and services live under chemistry/ namespaces', () => {
  const index = source('apps/server/src/index.js');
  assert.match(index, /routes\/chemistry\/molecules/);
  assert.match(index, /routes\/chemistry\/quiz/);
  assert.match(index, /routes\/chemistry\/labs/);
  assert.ok(fs.existsSync(path.join(root, 'apps/server/src/routes/chemistry/molecules.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/server/src/services/chemistry/ai-service.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/server/src/services/chemistry/quiz/sessions.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/server/src/routes/settings.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/server/src/routes/ai.js')));
});

test('chemistry web shared modules are not left at chemistry/ root', () => {
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/chemistry/chem/equation-balance.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/chemistry/shared/chem-keypad.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/chemistry/ai-classroom/rollcall.js')));
  assert.equal(fs.existsSync(path.join(root, 'apps/web/src/chemistry/equation-balance.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'apps/web/src/chemistry/chem-keypad.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'apps/web/src/chemistry/classroom-rollcall.js')), false);
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

test('math classroom mounts multi-tab panels like chemistry', () => {
  const classroom = source('apps/web/src/subjects/classrooms/math-classroom.js');
  assert.match(classroom, /lab-math-root/);
  assert.match(classroom, /math-panels\.partial\.html/);
  assert.match(classroom, /createTabbedClassroom/);
  assert.match(classroom, /showTabBar:\s*true/);
  assert.match(classroom, /math\/graph\//);
  assert.match(classroom, /math\/plane\//);
  assert.match(classroom, /math\/trig\//);
  assert.match(classroom, /math\/sequence\//);
  assert.match(classroom, /math\/solid\//);
  assert.match(classroom, /math\/classroom\//);
  assert.ok(
    fs.existsSync(
      path.join(root, 'apps/web/src/subjects/classrooms/partials/math-panels.partial.html'),
    ),
  );
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/math/classroom/entry.js')));
  const panels = source(
    'apps/web/src/subjects/classrooms/partials/math-panels.partial.html',
  );
  assert.match(panels, /id="panel-math-graph"/);
  assert.match(panels, /id="panel-math-plane"/);
  assert.match(panels, /id="panel-math-trig"/);
  assert.match(panels, /id="panel-math-sequence"/);
  assert.match(panels, /id="panel-math-solid"/);
  assert.match(panels, /id="panel-math-ai"/);
  assert.match(panels, /side-drawer/);
  assert.match(panels, /函数画布/);
  assert.match(panels, /直线与圆/);
  assert.match(panels, /概念讲解/);
  assert.doesNotMatch(panels, /二次一族/);
  assert.doesNotMatch(panels, /知识地图/);
  const catalog = source('packages/subject-settings/src/tab-catalog.ts');
  assert.match(catalog, /defaultTabId: 'graph'/);
  assert.match(catalog, /showTabBar: true/);
  assert.match(catalog, /panel-math-graph/);
  assert.match(catalog, /panel-math-trig/);
  assert.match(catalog, /panel-math-ai/);
  assert.match(catalog, /label: '课堂'/);
  assert.doesNotMatch(catalog, /知识地图/);
});
