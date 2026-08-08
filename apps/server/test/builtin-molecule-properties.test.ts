/**
 * 内建分子属性合同
 * （D-test 第四批：node:test → vitest）
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const { BUILTIN_MOLECULES } = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/seed/builtin-molecules.js'));

test('every built-in molecule includes physical and chemical property data', () => {
  for (const molecule of BUILTIN_MOLECULES) {
    assert.deepEqual(
      Object.keys(molecule.physics || {}).sort(),
      ['boilingPoint', 'density', 'meltingPoint', 'state'],
      `${molecule.id} is missing physical properties`,
    );
    assert.deepEqual(
      Object.keys(molecule.chemistry || {}).sort(),
      ['acidity', 'reactivity', 'solubility'],
      `${molecule.id} is missing chemical properties`,
    );
  }
});
