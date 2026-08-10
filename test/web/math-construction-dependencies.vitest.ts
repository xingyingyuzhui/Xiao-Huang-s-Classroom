import { test } from 'vitest';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import root from '../helpers/repo-root.js';

async function deps() {
  return import(
    pathToFileURL(
      path.join(root, 'apps/web/src/math/graph/construction/dependencies.js'),
    ).href
  );
}

test('disposing a construction removes its endpoint update callbacks', async () => {
  const { bindConstructionDependency, clearConstructionDependencies } = await deps();
  const endpoint = { _mathDepIntersectTicks: new Set() };
  const construction = { els: [] };
  const tick = () => {};

  bindConstructionDependency(construction, endpoint, tick);
  assert.equal(endpoint._mathDepIntersectTicks.has(tick), true);

  clearConstructionDependencies(construction);
  assert.equal(endpoint._mathDepIntersectTicks.has(tick), false);
  assert.equal(construction._mathDependencyBindings, undefined);
});
