/**
 * 离线题库数据/加载边界合同（B3 先拆一把）。
 *
 * 断言：offline-quiz-bank.js 是聚合加载器（<400 行），题目数据本体在
 * offline-questions-part{1,2}.js；运行时聚合完整且顺序保持。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = require('../helpers/repo-root.js');

const dataDir = path.join(root, 'apps/web/src/chemistry/data');
const bankPath = path.join(dataDir, 'offline-quiz-bank.js');

test('offline-quiz-bank 是加载器：<400 行，数据在 part 文件', () => {
  const src = fs.readFileSync(bankPath, 'utf8');
  assert.ok(
    src.split('\n').length < 400,
    `offline-quiz-bank.js 必须 <400 行（B3 数据/加载边界），实际 ${src.split('\n').length}`,
  );
  for (const f of ['offline-questions-part1.js', 'offline-questions-part2.js']) {
    assert.equal(fs.existsSync(path.join(dataDir, f)), true, `${f} 必须存在（数据本体）`);
  }
  assert.match(src, /OFFLINE_QUESTIONS_PART1/, 'loader 聚合 part1');
  assert.match(src, /OFFLINE_QUESTIONS_PART2/, 'loader 聚合 part2');
});

test('offline-quiz-bank 运行时聚合完整且顺序保持', async () => {
  const mod = await import(pathToFileURL(bankPath).href);
  assert.equal(mod.OFFLINE_QUESTIONS.length, mod.OFFLINE_QUIZ_BANK_SIZE, '聚合数与声明大小一致');
  assert.equal(mod.OFFLINE_QUIZ_BANK_SIZE, 204);
  assert.equal(mod.OFFLINE_QUESTIONS[0].sourceQuestionId, 'agieval-gaochem-line-0');
  assert.equal(mod.OFFLINE_QUESTIONS[203].sourceQuestionId, 'agieval-gaochem-line-203');
});
