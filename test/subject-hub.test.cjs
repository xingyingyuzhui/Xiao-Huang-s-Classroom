const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');

test('subject catalog exports all four subjects as enterable shells', async () => {
  const mod = await import(pathToFileURL(path.join(root, 'apps/web/src/subjects/catalog.js')).href);
  const ready = mod.SUBJECTS.filter((s) => s.status === 'ready');
  assert.equal(ready.length, 4);
  assert.equal(ready.find((s) => s.id === 'chemistry')?.status, 'ready');
  assert.ok(mod.getSubject('physics')?.status === 'ready');
  assert.ok(mod.getSubject('biology')?.status === 'ready');
  assert.ok(mod.getSubject('math')?.status === 'ready');
  for (const s of mod.SUBJECTS) {
    assert.ok(s.blurb && s.blurb.length > 20, `${s.id} blurb`);
    assert.ok(s.en, `${s.id} en`);
    assert.ok(Array.isArray(s.modules) && s.modules.length > 0, `${s.id} modules`);
  }
});

test('app shell wires subject hub and classroom registry', () => {
  const src = fs.readFileSync(path.join(root, 'apps/web/src/app/shell.js'), 'utf8');
  assert.match(src, /from '\.\.\/subjects\/hub\.js'/);
  assert.match(src, /from '\.\.\/subjects\/chrome\.js'/);
  assert.match(src, /from '\.\.\/subjects\/classrooms\/registry\.js'/);
  assert.match(src, /showHub\(/);
  assert.match(src, /enterSubject\(/);
  assert.match(src, /syncClassroomTabChrome/);
});

test('classroom registry maps ready subjects to classroom runtimes', () => {
  assert.ok(
    fs.existsSync(path.join(root, 'apps/web/src/subjects/classrooms/registry.js')),
  );
  assert.ok(
    fs.existsSync(path.join(root, 'apps/web/src/subjects/classrooms/chemistry-classroom.js')),
  );
  const registry = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/classrooms/registry.js'),
    'utf8',
  );
  assert.match(registry, /createChemistryClassroom/);
  assert.match(registry, /createPhysicsClassroom/);
  assert.match(registry, /createBiologyClassroom/);
  assert.match(registry, /createMathClassroom/);
  assert.match(registry, /CLASSROOM_FACTORIES/);
  assert.match(registry, /syncClassroomTabChrome/);
  assert.ok(fs.existsSync(path.join(root, 'packages/subject-settings/index.cjs')));
});

test('index.html has subject hub bookshelf and chrome hooks', () => {
  const html = fs.readFileSync(path.join(root, 'apps/web/index.html'), 'utf8');
  assert.match(html, /id="subjectHub"/);
  assert.match(html, /id="bookshelfGl"/);
  assert.doesNotMatch(html, /id="bookshelfOpenPill"/);
  assert.match(html, /id="bookshelfPageFx"/);
  assert.match(html, /id="panel-subject-home"/);
  assert.match(html, /id="lab-chemistry-chrome"/);
  assert.match(html, /id="lab-panels-root"/);
  assert.doesNotMatch(html, /id="panel-table"/);
  assert.ok(
    fs.existsSync(
      path.join(root, 'apps/web/src/subjects/classrooms/partials/chemistry-panels.partial.html'),
    ),
  );
  assert.ok(
    fs.existsSync(
      path.join(root, 'apps/web/src/subjects/classrooms/partials/chemistry-modals.partial.html'),
    ),
  );
  const enterFxSrc = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/bookshelf/enter-fx.js'),
    'utf8',
  );
  assert.match(enterFxSrc, /playExit/);
  assert.match(enterFxSrc, /onProgress|bookRect/);
  assert.match(enterFxSrc, /onOpaque/);
  assert.match(enterFxSrc, /holdNeutral/);
  assert.match(enterFxSrc, /drawVeil|OPAQUE_THRESHOLD/);
  assert.match(
    fs.readFileSync(path.join(root, 'apps/web/src/subjects/bookshelf/dissolve.js'), 'utf8'),
    /attachDissolve|uDissolve/,
  );
  assert.ok(
    fs.existsSync(path.join(root, 'apps/web/src/subjects/bookshelf/transition-machine.js')),
  );
  assert.ok(
    fs.existsSync(path.join(root, 'apps/web/src/subjects/bookshelf/transition-controller.js')),
  );
  assert.match(html, /小黄的教室<\/span>/);
  assert.match(html, /id="btnSubjectChip"/);
  assert.match(html, /id="btnSettingsSubjectHub"/);
  assert.match(html, /data-dp-en/);
  assert.match(html, /id="bookshelfPeek"/);
  assert.match(html, /bookshelf-detail-actions/);
});

test('hub shell keeps a main grid row for the named main area', () => {
  const css = fs.readFileSync(
    path.join(root, 'apps/web/src/shared/styles/_subject-hub.css'),
    'utf8',
  );
  assert.doesNotMatch(
    css,
    /html\[data-shell='hub'\]\s+#app\s*\{[^}]*grid-template-rows\s*:\s*minmax\(0\s*,\s*1fr\)/,
    'the hub must not remove the main row defined by the app grid',
  );
});

test('bookshelf stage module is wired from hub', () => {
  const hub = fs.readFileSync(path.join(root, 'apps/web/src/subjects/hub.js'), 'utf8');
  assert.match(hub, /createBookshelfStage/);
  assert.match(hub, /bookshelf\/stage\.js/);
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/subjects/bookshelf/stage.js')));
  assert.ok(fs.existsSync(path.join(root, 'apps/web/src/subjects/bookshelf/covers.js')));
});

test('theme cover art packs are shipped and wired', () => {
  const covers = path.join(root, 'apps/web/public/assets/subject-covers');
  const stems = ['chemistry', 'physics', 'biology', 'mathematics'];
  for (let ver = 1; ver <= 5; ver += 1) {
    for (const stem of stems) {
      const name = `${stem}-cover-v${ver}.png`;
      assert.ok(fs.existsSync(path.join(covers, name)), name);
    }
  }
  const stage = fs.readFileSync(path.join(root, 'apps/web/src/subjects/bookshelf/stage.js'), 'utf8');
  assert.match(stage, /enterFromDetail/);
  assert.match(stage, /THEME_COVER_VERSION/);
  assert.match(stage, /coverUrlForTheme/);
  assert.match(stage, /stationery:\s*2/);
  assert.match(stage, /reagent:\s*3/);
  assert.match(stage, /blackboard:\s*4/);
  assert.match(stage, /pixel:\s*5/);
  assert.match(stage, /transitionSeq|onOpaque/);
  assert.match(stage, /tid !== transitionSeq|id !== tid/);
  // 返回大厅不得遮蔽构造时的 onRevealHub（曾导致溶解后无法露壳）
  assert.match(stage, /const onRevealHub\s*=/);
  assert.match(stage, /playReturnFromLab\(returnOpts/);
  assert.match(stage, /revealHubShell/);
});

test('transition dissolve palette follows theme × subject boards', async () => {
  const { transitionPaletteFor } = await import(
    pathToFileURL(path.join(root, 'apps/web/src/subjects/bookshelf/covers.js')).href
  );
  const def = transitionPaletteFor('chemistry', 'default');
  const reagent = transitionPaletteFor('chemistry', 'reagent');
  assert.equal(def.length, 6);
  assert.equal(reagent.length, 6);
  assert.notEqual(def[0], reagent[0], 'edge glow should differ per theme');
  assert.notEqual(def[4], reagent[4], 'veil base should differ per theme');

  const enterFx = fs.readFileSync(
    path.join(root, 'apps/web/src/subjects/bookshelf/enter-fx.js'),
    'utf8',
  );
  assert.match(enterFx, /transitionPaletteFor/);
  assert.match(enterFx, /opts\.themeId/);
  assert.doesNotMatch(enterFx, /PALETTE\s*=\s*\{/);

  const stage = fs.readFileSync(path.join(root, 'apps/web/src/subjects/bookshelf/stage.js'), 'utf8');
  assert.match(stage, /syncBookDissolveForTransition/);
  assert.match(stage, /themeId,/);
});

test('detail floaters module maps motifs per subject', () => {
  const floaters = fs.readFileSync(path.join(root, 'apps/web/src/subjects/bookshelf/floaters.js'), 'utf8');
  assert.match(floaters, /createDetailFloaters/);
  assert.match(floaters, /chemistry/);
  assert.match(floaters, /math/);
  assert.match(floaters, /biology/);
  assert.match(floaters, /physics/);
  assert.match(floaters, /SpriteMaterial/);
  assert.match(floaters, /nudge/);
  assert.match(floaters, /makeChemSprite|磨砂|元素/);
  const stage = fs.readFileSync(path.join(root, 'apps/web/src/subjects/bookshelf/stage.js'), 'utf8');
  assert.match(stage, /createDetailFloaters/);
  assert.match(stage, /leaves\.nudge/);
});
