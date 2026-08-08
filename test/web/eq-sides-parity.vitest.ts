/**
 * 客户端 equation-balance 与服务端 eq-sides 解析结果对齐，防止双份实现漂移
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';

import path from 'node:path';
import { createRequire } from 'node:module';
import root from '../helpers/repo-root.js';
const require = createRequire(import.meta.url);
const serverEq = require(path.join(root, 'apps/server/src/utils/eq-sides.js'));

const FIXTURES = [
  'H2 + O2 = H2O',
  '2H2 + O2 = 2H2O',
  'Fe + O2 = Fe2O3',
  '4Fe + 3O2 = 2Fe2O3',
  'C2H5OH + O2 = CO2 + H2O',
  '2H₂ + O₂ → 2H₂O',
  '(NH4)2SO4 = NH4 + SO4', // 结构解析，不要求守恒
];

test('client speciesFromEquation matches server for fixtures', async () => {
  const client = await import('../../apps/web/src/chemistry/chem/equation-balance.js');
  for (const eq of FIXTURES) {
    const a = client.speciesFromEquation(eq);
    const b = serverEq.speciesFromEquation(eq);
    assert.deepEqual(a, b, `species mismatch for ${eq}`);
  }
});

test('client checkConservation ok matches server isEquationConserved', async () => {
  const client = await import('../../apps/web/src/chemistry/chem/equation-balance.js');
  const pairs = [
    ['2H2 + O2 = 2H2O', true],
    ['H2 + O2 = H2O', false],
    ['4Fe + 3O2 = 2Fe2O3', true],
    ['Fe + O2 = Fe2O3', false],
  ];
  for (const [eq, expect] of pairs) {
    const c = client.checkConservation(eq);
    const s = serverEq.isEquationConserved(eq);
    assert.equal(c.ok, expect, `client conservation for ${eq}`);
    assert.equal(s, expect, `server conservation for ${eq}`);
  }
});
