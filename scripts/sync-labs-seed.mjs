/**
 * Sync lab seed: ESM data → CJS seed
 * Source: apps/web chemistry data modules
 * Target: apps/server/src/seed/labs-builtin.js
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SEED_PATH = resolve(ROOT, 'apps/server/src/seed/labs-builtin.js');
const DATA = resolve(ROOT, 'apps/web/src/chemistry/data');

const { LAB_SCRIPTS } = await import(resolve(DATA, 'lab-scripts.js'));
const { LAB_PRESTUDY_CONFIGS } = await import(resolve(DATA, 'lab-prestudy-config.js'));

const labs = LAB_SCRIPTS.map((lab, i) => ({
  id: lab.id,
  title: lab.title,
  type: lab.type || '',
  equation: lab.equation || '',
  safety: lab.safety || '',
  phenomena: lab.phenomena || '',
  steps: lab.steps || [],
  prestudy: LAB_PRESTUDY_CONFIGS[lab.id] || null,
  sortOrder: i,
  source: 'builtin',
}));

const cjsContent = [
  '/** CJS seed — auto-generated from chemistry/data, do not hand-edit */',
  '',
  `const LABS_BUILTIN = ${JSON.stringify(labs, null, 2)};`,
  '',
  'module.exports = { LABS_BUILTIN };',
  '',
].join('\n');

let existing = '';
try {
  existing = readFileSync(SEED_PATH, 'utf-8');
} catch {}

if (existing === cjsContent) {
  console.log(`✓ labs seed up to date (${labs.length} labs)`);
  process.exit(0);
}

writeFileSync(SEED_PATH, cjsContent, 'utf-8');
console.log(`✓ synced ${labs.length} labs → apps/server/src/seed/labs-builtin.js`);
