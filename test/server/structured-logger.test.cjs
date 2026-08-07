/**
 * 结构化日志合同（Program 7 Task 7.5）。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const { createLogger } = require(path.join(root, 'apps/server/src/lib/logger.js'));
const { AppError } = require('@xiaohuang/domain-core');

function capture() {
  const lines = [];
  const sink = { log: (s) => lines.push(s), info: (s) => lines.push(s), warn: (s) => lines.push(s), error: (s) => lines.push(s) };
  return { lines, sink };
}

test('日志包含结构化字段：timestamp/level/scope/requestId/errorCode', () => {
  const { lines, sink } = capture();
  const logger = createLogger('settings', { sink });
  logger.errorWithCode('读取失败', new AppError('PERSISTENCE_READ', 'db down'), {
    requestId: 'req-1',
    durationMs: 12,
  });
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.level, 'error');
  assert.equal(entry.scope, 'settings');
  assert.equal(entry.requestId, 'req-1');
  assert.equal(entry.durationMs, 12);
  assert.equal(entry.errorCode, 'PERSISTENCE_READ');
  assert.ok(!Number.isNaN(Date.parse(entry.timestamp)), 'timestamp 可解析');
});

test('生产日志脱敏：API Key 与 prompt 不落原文', () => {
  const { lines, sink } = capture();
  const logger = createLogger('ai', { sink });
  logger.info('请求 AI', { apiKey: 'sk-secret-xyz', user: '完整解题过程：x^2-1=0 分步骤…', model: 'deepseek-v4-flash' });
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.apiKey, '***');
  assert.doesNotMatch(JSON.stringify(entry), /x\^2-1=0/, 'prompt 不落原文');
  assert.equal(entry.model, 'deepseek-v4-flash');
});
