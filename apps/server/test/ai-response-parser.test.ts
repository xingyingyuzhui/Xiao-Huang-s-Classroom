/**
 * AI 响应解析合同
 * （D-test 第四批：node:test → vitest）
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const {
  parseModelJson,
  normalizeQuizQuestions,
} = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/services/ai/response-parser.js'));

test('AI response parser accepts fenced JSON with a trailing comma', () => {
  assert.deepEqual(
    parseModelJson('```json\n{"topic":"水",}\n```'),
    { topic: '水' },
  );
});

test('quiz question normalizer drops invalid answers instead of silently treating them as A', () => {
  const questions = normalizeQuizQuestions(
    [
      { stem: '有效题', options: ['A', 'B', 'C', 'D'], answer: 'B' },
      { stem: '无效题', options: ['A', 'B', 'C', 'D'], answer: 'Z' },
    ],
    5,
  );

  assert.deepEqual(questions, [
    {
      id: 'q1',
      stem: '有效题',
      options: ['A', 'B', 'C', 'D'],
      answer: 1,
      knowledge: '',
      hint: '',
      explain: '',
    },
  ]);
});
