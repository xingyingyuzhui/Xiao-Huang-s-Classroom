/**
 * 高中数学教室纯模型契约
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import root from '../helpers/repo-root.js';

async function load(rel) {
  return import(pathToFileURL(path.join(root, rel)).href);
}

test('plane analytic: line forms, circle, point-line distance', async () => {
  const {
    createPoint,
    distance,
    slope,
    lineGeneral,
    lineSlopeIntercept,
    slopeInterceptText,
    generalText,
    circleFromCenterRim,
    pointToLineDistance,
    analyticReport,
    MAX_POINTS,
  } = await load('apps/web/src/math/plane/model.js');

  const a = createPoint(0, 0, []);
  const b = createPoint(3, 4, [a]);
  assert.equal(distance(a, b), 5);
  assert.equal(slope(a, b), 1.3333);
  const si = lineSlopeIntercept(a, b);
  assert.equal(si.vertical, false);
  assert.match(slopeInterceptText(si), /y =/);
  const g = lineGeneral(a, b);
  assert.ok(g);
  assert.match(generalText(g), /= 0$/);

  const circle = circleFromCenterRim(a, b);
  assert.equal(circle.r, 5);
  assert.match(circle.equation, /²/);

  const c = createPoint(0, 5, [a, b]);
  const d = pointToLineDistance(g, c);
  assert.ok(d != null && d >= 0);
  const report = analyticReport([a, b, c]);
  assert.ok(report.line);
  assert.ok(report.circle);
  assert.ok(report.pointLine);
  assert.equal(createPoint(1, 1, [a, b, c]), null);
  assert.equal([a, b, c].length, MAX_POINTS);
});

test('graph model: high-school presets, features, asymptotes', async () => {
  const {
    evalPreset,
    sampleCurve,
    formulaText,
    keyFeatures,
    asymptotes,
    GRAPH_PRESETS,
    defaultCoeffsFor,
  } = await load('apps/web/src/math/graph/model.js');

  assert.ok(GRAPH_PRESETS.length >= 8);
  assert.equal(evalPreset('quadratic', { a: 1, b: 0, c: -1 }, 2), 3);
  assert.equal(evalPreset('log', { a: 1, b: 0, c: 0 }, 0), null);
  assert.equal(evalPreset('exp', { a: 1, b: 0, c: 2 }, 0), 3);
  assert.ok(Number.isFinite(evalPreset('abs', { a: 1, b: 1, c: 0 }, 0)));

  const feats = keyFeatures('quadratic', { a: 1, b: -2, c: 0 });
  assert.ok(feats.some((f) => f.kind === '顶点'));
  assert.ok(feats.some((f) => f.kind === '判别式'));

  const asy = asymptotes('log', { a: 1, b: 2, c: 0 });
  assert.equal(asy[0].type, 'vertical');
  assert.equal(asy[0].value, 2);

  const pts = sampleCurve('sine', defaultCoeffsFor('sine'), {
    xMin: -Math.PI,
    xMax: Math.PI,
    steps: 20,
  });
  assert.equal(pts.length, 21);
  assert.match(formulaText('exp', defaultCoeffsFor('exp')), /e\^/);
});

test('trig model: special angles and exact values', async () => {
  const {
    trigValues,
    exactSpecial,
    snapSpecialDeg,
    normalizeDeg,
    quadrantOf,
  } = await load('apps/web/src/math/trig/model.js');

  assert.equal(normalizeDeg(-30), 330);
  assert.equal(snapSpecialDeg(31), 30);
  assert.equal(quadrantOf(120), '第二象限');

  const v = trigValues(30);
  assert.ok(Math.abs(v.sin - 0.5) < 1e-3);
  assert.ok(Math.abs(v.cos - Math.sqrt(3) / 2) < 1e-3);

  const exact = exactSpecial(45);
  assert.equal(exact.tan, '1');
  assert.equal(exactSpecial(90).tan, '不存在');
  assert.equal(trigValues(90).tan, null);
});

test('sequence model: arithmetic and geometric terms + sums', async () => {
  const { sequenceTerms, partialSum, formulaTex } = await load(
    'apps/web/src/math/sequence/model.js',
  );

  assert.deepEqual(sequenceTerms('arith', 2, 3, 4), [2, 5, 8, 11]);
  assert.equal(partialSum('arith', 2, 3, 4), 26);

  assert.deepEqual(sequenceTerms('geom', 1, 2, 5), [1, 2, 4, 8, 16]);
  assert.equal(partialSum('geom', 1, 2, 5), 31);
  assert.equal(partialSum('geom', 3, 1, 4), 12);

  const tex = formulaTex('arith', 2, 3, 4);
  assert.match(tex.general, /a_n=/);
  assert.match(tex.sum, /S_n=/);
  assert.match(tex.value, /a_\{4\}=/);
});
