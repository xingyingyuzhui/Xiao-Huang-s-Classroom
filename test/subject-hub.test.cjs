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
  for (const s of mod.SUBJECTS) {
    assert.ok(s.blurb && s.blurb.length > 20, `${s.id} blurb`);
    assert.ok(s.en, `${s.id} en`);
    assert.ok(Array.isArray(s.modules) && s.modules.length > 0, `${s.id} modules`);
  }
});

test('main.js wires subject hub modules', () => {
  const src = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  assert.match(src, /from '\.\/subjects\/hub\.js'/);
  assert.match(src, /from '\.\/subjects\/chrome\.js'/);
  assert.match(src, /showHub\(/);
  assert.match(src, /enterSubject\(/);
});

test('index.html has subject hub bookshelf and chrome hooks', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="subjectHub"/);
  assert.match(html, /id="bookshelfGl"/);
  assert.doesNotMatch(html, /id="bookshelfOpenPill"/);
  assert.match(html, /id="bookshelfPageFx"/);
  const enterFxSrc = fs.readFileSync(
    path.join(root, 'src/subjects/bookshelf/enter-fx.js'),
    'utf8',
  );
  assert.match(enterFxSrc, /playExit/);
  assert.match(enterFxSrc, /onProgress|bookRect/);
  assert.match(enterFxSrc, /onOpaque/);
  assert.match(enterFxSrc, /holdNeutral/);
  assert.match(enterFxSrc, /drawVeil|OPAQUE_THRESHOLD/);
  assert.match(
    fs.readFileSync(path.join(root, 'src/subjects/bookshelf/dissolve.js'), 'utf8'),
    /attachDissolve|uDissolve/,
  );
  assert.ok(
    fs.existsSync(path.join(root, 'src/subjects/bookshelf/transition-machine.js')),
  );
  assert.ok(
    fs.existsSync(path.join(root, 'src/subjects/bookshelf/transition-controller.js')),
  );
  assert.match(html, /小黄的教室<\/span>/);
  assert.match(html, /id="btnSubjectChip"/);
  assert.match(html, /id="btnSettingsSubjectHub"/);
  assert.match(html, /data-dp-en/);
  assert.match(html, /id="bookshelfPeek"/);
  assert.match(html, /bookshelf-detail-actions/);
});

test('bookshelf stage module is wired from hub', () => {
  const hub = fs.readFileSync(path.join(root, 'src/subjects/hub.js'), 'utf8');
  assert.match(hub, /createBookshelfStage/);
  assert.match(hub, /bookshelf\/stage\.js/);
  assert.ok(fs.existsSync(path.join(root, 'src/subjects/bookshelf/stage.js')));
  assert.ok(fs.existsSync(path.join(root, 'src/subjects/bookshelf/covers.js')));
});

test('theme cover art packs are shipped and wired', () => {
  const covers = path.join(root, 'public/assets/subject-covers');
  const stems = ['chemistry', 'physics', 'biology', 'mathematics'];
  for (let ver = 1; ver <= 5; ver += 1) {
    for (const stem of stems) {
      const name = `${stem}-cover-v${ver}.png`;
      assert.ok(fs.existsSync(path.join(covers, name)), name);
    }
  }
  const stage = fs.readFileSync(path.join(root, 'src/subjects/bookshelf/stage.js'), 'utf8');
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

test('detail floaters module maps motifs per subject', () => {
  const floaters = fs.readFileSync(path.join(root, 'src/subjects/bookshelf/floaters.js'), 'utf8');
  assert.match(floaters, /createDetailFloaters/);
  assert.match(floaters, /chemistry/);
  assert.match(floaters, /math/);
  assert.match(floaters, /biology/);
  assert.match(floaters, /physics/);
  assert.match(floaters, /SpriteMaterial/);
  assert.match(floaters, /nudge/);
  assert.match(floaters, /makeChemSprite|磨砂|元素/);
  const stage = fs.readFileSync(path.join(root, 'src/subjects/bookshelf/stage.js'), 'utf8');
  assert.match(stage, /createDetailFloaters/);
  assert.match(stage, /leaves\.nudge/);
});
