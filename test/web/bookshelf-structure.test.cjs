/**
 * Bookshelf engineering structure — module map + public contracts.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = require('../helpers/repo-root.js');
const bookshelf = path.join(root, 'apps/web/src/subjects/bookshelf');

const STRUCTURE_MODULES = [
  'AGENTS.md',
  'stage.js',
  'spring.js',
  'cover-urls.js',
  'theme-feel.js',
  'classroom-env.js',
  'book-geometry.js',
  'book-textures.js',
  'build-book.js',
  'slots.js',
  'motion.js',
  'covers.js',
  'dissolve.js',
  'enter-fx.js',
  'floaters.js',
];

test('bookshelf package ships structured modules + AGENTS map', () => {
  for (const name of STRUCTURE_MODULES) {
    assert.ok(fs.existsSync(path.join(bookshelf, name)), name);
  }
  const agents = fs.readFileSync(path.join(bookshelf, 'AGENTS.md'), 'utf8');
  assert.match(agents, /createBookshelfStage/);
  assert.match(agents, /stage\.js/);
  assert.match(agents, /build-book\.js/);
  assert.match(agents, /cover-urls\.js/);
});

test('stage.js is an orchestrator that imports sibling modules', () => {
  const stage = fs.readFileSync(path.join(bookshelf, 'stage.js'), 'utf8');
  assert.match(stage, /export function createBookshelfStage/);
  assert.match(stage, /from ['"]\.\/spring\.js['"]/);
  assert.match(stage, /from ['"]\.\/cover-urls\.js['"]/);
  assert.match(stage, /from ['"]\.\/theme-feel\.js['"]/);
  assert.match(stage, /from ['"]\.\/classroom-env\.js['"]/);
  assert.match(stage, /from ['"]\.\/book-geometry\.js['"]/);
  assert.match(stage, /from ['"]\.\/book-textures\.js['"]/);
  assert.match(stage, /from ['"]\.\/build-book\.js['"]/);
  assert.match(stage, /from ['"]\.\/slots\.js['"]/);
  assert.match(stage, /from ['"]\.\/motion\.js['"]/);
  assert.match(stage, /from ['"]\.\/floaters\.js['"]/);
  // fat single-file markers should not reappear as local class/const tables
  assert.doesNotMatch(stage, /class Spring\s*\{/);
  assert.doesNotMatch(stage, /const THEME_BOOK_FEEL\s*=/);
  assert.doesNotMatch(stage, /const THEME_COVER_VERSION\s*=/);
  // public API surface
  assert.match(stage, /playReturnFromLab/);
  assert.match(stage, /syncTheme/);
  assert.match(stage, /enterFromDetail/);
  // stay maintainable: orchestrator should not balloon back past ~1500 LOC
  const lines = stage.split('\n').length;
  assert.ok(lines < 1500, `stage.js is ${lines} lines; expected < 1500 after split`);
});

test('cover-urls maps five themes to v1–v5 asset stems', async () => {
  const mod = await import(
    pathToFileURL(path.join(bookshelf, 'cover-urls.js')).href
  );
  assert.equal(mod.THEME_COVER_VERSION.default, 1);
  assert.equal(mod.THEME_COVER_VERSION.stationery, 2);
  assert.equal(mod.THEME_COVER_VERSION.reagent, 3);
  assert.equal(mod.THEME_COVER_VERSION.blackboard, 4);
  assert.equal(mod.THEME_COVER_VERSION.pixel, 5);
  assert.equal(
    mod.coverUrlForTheme('reagent', 'chemistry'),
    '/assets/subject-covers/chemistry-cover-v3.png',
  );
  assert.equal(
    mod.coverUrlForTheme('pixel', 'math'),
    '/assets/subject-covers/mathematics-cover-v5.png',
  );
  assert.equal(mod.coverUrlForTheme('default', 'unknown'), null);
});

test('spring module exports Spring + clamp', async () => {
  const mod = await import(pathToFileURL(path.join(bookshelf, 'spring.js')).href);
  assert.equal(typeof mod.Spring, 'function');
  assert.equal(typeof mod.clamp, 'function');
  assert.equal(mod.clamp(5, 0, 3), 3);
  const s = new mod.Spring(0, 120, 14);
  s.t = 1;
  s.update(1 / 60);
  assert.ok(s.v > 0);
});

test('motion helpers expose exit CLEAR constant used by return path', async () => {
  const mod = await import(pathToFileURL(path.join(bookshelf, 'motion.js')).href);
  assert.equal(typeof mod.setTargets, 'function');
  assert.equal(typeof mod.sendOut, 'function');
  assert.equal(typeof mod.bringBack, 'function');
  assert.equal(typeof mod.CLEAR, 'number');
  assert.ok(mod.CLEAR > 1);
});

test('theme-feel ships all five app themes', async () => {
  const mod = await import(
    pathToFileURL(path.join(bookshelf, 'theme-feel.js')).href
  );
  for (const id of ['default', 'stationery', 'reagent', 'blackboard', 'pixel']) {
    assert.ok(mod.THEME_BOOK_FEEL[id], id);
    assert.ok(mod.themeBookFeel(id).front);
    assert.ok(mod.themeBookFeel(id).light);
  }
  assert.equal(mod.themeBookFeel('nope'), mod.THEME_BOOK_FEEL.default);
});
