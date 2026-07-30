/**
 * Sync offline quiz bank: ESM source → CJS seed
 *
 * Source of truth: apps/web/src/chemistry/data/offline-quiz-bank.js (ESM)
 * Generated target: apps/server/src/seed/offline-quiz-bank.js (CJS)
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SRC_PATH = resolve(ROOT, 'apps/web/src/chemistry/data/offline-quiz-bank.js');
const SEED_PATH = resolve(ROOT, 'apps/server/src/seed/offline-quiz-bank.js');

const src = await import(SRC_PATH);
const questions = src.OFFLINE_QUESTIONS;

const lines = [
  '/** CJS seed data — auto-generated from chemistry/data/offline-quiz-bank.js, do not hand-edit */',
  '',
  'const OFFLINE_QUESTIONS = ' + JSON.stringify(questions, null, 2) + ';',
  '',
  'module.exports = { OFFLINE_QUESTIONS };',
  '',
];

const cjsContent = lines.join('\n');

let existing = '';
try {
  existing = readFileSync(SEED_PATH, 'utf-8');
} catch {}

if (existing === cjsContent) {
  console.log(`✓ seed is up to date (${questions.length} questions)`);
  process.exit(0);
}

writeFileSync(SEED_PATH, cjsContent, 'utf-8');
console.log(`✓ synced ${questions.length} questions → ${SEED_PATH.replace(ROOT + '/', '')}`);
