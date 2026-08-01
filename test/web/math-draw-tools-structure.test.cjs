const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

const constructionDir = path.join(root, 'apps/web/src/math/graph/construction');
const facadePath = path.join(root, 'apps/web/src/math/graph/draw-tools.js');

const DRAW_TOOLS_API = [
  'autoIntersectNewLine',
  'clearAllConstructions',
  'createFnIntersection',
  'createLineIntersection',
  'createNormalAtFn',
  'createPerpToAxis',
  'createPerpToFn',
  'createPerpToLine',
  'createSegmentOrLine',
  'createTangent',
  'deleteConstruction',
  'deleteConstructionsDependingOnPoint',
  'detachConstr',
  'isCurveEl',
  'isDrawableConstrEl',
  'isExtendStyleTarget',
  'isLineLike',
  'lineLikeElOf',
  'resolveTangentAnchor',
  'restoreConstructions',
  'setConstructionExtend',
  'snapshotConstructions',
];

function read(relative) {
  return fs.readFileSync(path.join(constructionDir, relative), 'utf8');
}

test('draw tools keep a small compatibility facade over focused construction modules', () => {
  const facade = fs.readFileSync(facadePath, 'utf8');

  for (const file of ['restore.js', 'render-lines.js', 'render-perpendiculars.js', 'intersections.js', 'operations.js']) {
    assert.equal(fs.existsSync(path.join(constructionDir, file)), true, `${file} is required`);
    assert.match(facade, new RegExp(`construction/${file.replace('.', '\\.')}`));
  }
  assert.equal(fs.existsSync(path.join(constructionDir, 'primitives.js')), true);
  assert.match(read('primitives.js'), /export function createExtendRay/);
  assert.match(read('primitives.js'), /export function applyFootPointLabel/);
  assert.equal(fs.existsSync(path.join(constructionDir, 'intersection-visibility.js')), true);
  assert.match(read('intersection-visibility.js'), /export function syncIntersectVisibility/);
  assert.equal(fs.existsSync(path.join(constructionDir, 'intersection-lifecycle.js')), true);
  assert.match(read('intersection-lifecycle.js'), /export function bindIntersectVisibility/);
  assert.match(read('intersection-lifecycle.js'), /export function pruneIntersectsNotOnBody/);
  assert.match(read('intersections.js'), /from '.\/intersection-lifecycle\.js'/);
  assert.equal(fs.existsSync(path.join(constructionDir, 'intersection-renderers.js')), true);
  assert.match(read('intersection-renderers.js'), /export function createLineFnIntersection/);
  assert.match(read('intersection-renderers.js'), /export function createLineIntersection/);
  assert.equal(fs.existsSync(path.join(constructionDir, 'function-intersections.js')), true);
  assert.match(read('function-intersections.js'), /export function createFnIntersection/);
  assert.equal(fs.existsSync(path.join(constructionDir, 'measurements.js')), true);
  assert.match(read('measurements.js'), /export function segmentLengthText/);
  assert.match(read('render-lines.js'), /createExtendRay/);
  assert.match(read('render-perpendiculars.js'), /createExtendRay/);
  assert.equal(
    fs.existsSync(path.join(constructionDir, 'internal-tools.js')),
    false,
    'the transitional implementation must be removed after responsibilities are split',
  );
  assert.ok(facade.split('\n').length < 140, 'draw-tools should only be a compatibility facade');
});

test('draw tools expose an explicit collision-proof compatibility API', async () => {
  const facade = fs.readFileSync(facadePath, 'utf8');
  assert.doesNotMatch(facade, /export\s+\*/);

  const drawTools = await import(pathToFileURL(facadePath).href);
  assert.deepEqual(Object.keys(drawTools).sort(), DRAW_TOOLS_API);

  assert.doesNotMatch(read('render-lines.js'), /export\s*\{[^}]*createExtendRay[^}]*\}/s);
  assert.doesNotMatch(read('render-perpendiculars.js'), /export\s*\{[^}]*createExtendRay[^}]*\}/s);
});

test('construction modules own distinct tool responsibilities', () => {
  assert.match(read('restore.js'), /export function restoreConstructions/);
  assert.match(read('render-lines.js'), /createSegmentOrLine/);
  assert.match(read('render-lines.js'), /export function createSegmentOrLine/);
  assert.match(read('render-lines.js'), /export function createTangent/);
  assert.match(read('render-lines.js'), /createTangent/);
  assert.match(read('render-perpendiculars.js'), /createPerpToAxis/);
  assert.match(read('render-perpendiculars.js'), /export function createPerpToAxis/);
  assert.match(read('render-perpendiculars.js'), /export function createPerpToLine/);
  assert.match(read('render-perpendiculars.js'), /export function pointOnFn/);
  assert.match(read('render-perpendiculars.js'), /export function createNormalAtFn/);
  for (const fn of ['autoIntersectNewLine', 'setConstructionExtend']) {
    assert.match(read('intersections.js'), new RegExp(`export function ${fn}`));
  }
  assert.match(read('operations.js'), /export function deleteConstruction/);
  assert.equal(fs.existsSync(path.join(constructionDir, 'point-dependencies.js')), true);
  assert.match(read('point-dependencies.js'), /export function deleteConstructionsDependingOnPoint/);
  assert.equal(fs.existsSync(path.join(constructionDir, 'function-roots.js')), true);
  assert.match(read('function-roots.js'), /export function findRootNear/);
  assert.equal(fs.existsSync(path.join(constructionDir, 'dependency-closure.js')), true);
  assert.match(read('dependency-closure.js'), /export function constructionRemovalOrder/);
});

test('automatic and restored intersections defer their host notification', () => {
  assert.match(read('intersection-renderers.js'), /options\.notify !== false/);
  assert.match(read('intersections.js'), /notify: false/);
  assert.match(read('restore.js'), /notify: false/);
});
