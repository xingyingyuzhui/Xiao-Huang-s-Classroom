/**
 * 结构化日志合同
 * （D-test 第四批：node:test → vitest）
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const { createLogger } = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/logger.js'));
const { AppError } = require('@xiaohuang/domain-core');

type Sink = { log: (s: string) => void; info: (s: string) => void; warn: (s: string) => void; error: (s: string) => void };

function capture(): { lines: string[]; sink: Sink } {
  const lines: string[] = [];
  const sink: Sink = {
    log: (s) => lines.push(s),
    info: (s) => lines.push(s),
    warn: (s) => lines.push(s),
    error: (s) => lines.push(s),
  };
  return { lines, sink };
}

test('日志包含结构化字段：timestamp/level/scope/requestId/errorCode', () => {
  const { lines, sink } = capture();
  const logger = createLogger('settings', { sink });
  logger.errorWithCode('读取失败', new AppError('PERSISTENCE_READ', 'db down'), {
    requestId: 'req-1',
    durationMs: 12,
  });
  const entry = JSON.parse(lines[0] ?? '');
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
  const entry = JSON.parse(lines[0] ?? '');
  assert.equal(entry.apiKey, '***');
  assert.doesNotMatch(JSON.stringify(entry), /x\^2-1=0/, 'prompt 不落原文');
  assert.equal(entry.model, 'deepseek-v4-flash');
});
