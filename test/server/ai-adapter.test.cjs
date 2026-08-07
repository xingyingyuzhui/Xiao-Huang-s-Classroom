/**
 * AI provider adapter 合同（Program 5 Task 5.7）。
 *
 * 断言：retry 只对可重试错误生效；AI 输出 parse 不可信输入安全；
 * 日志脱敏不含 key/prompt 原文；错误映射给稳定 AI_* 错误码。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const {
  withRetry,
  parseAiJson,
  redactForLog,
  mapAiError,
  isRetryableError,
} = require(path.join(root, 'apps/server/src/services/ai/provider-adapter.js'));
const { AppError } = require('@xiaohuang/domain-core');

test('retry：网络错误重试后成功；4xx 不重试', async () => {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    if (calls === 1) {
      const e = new Error('offline');
      e.code = 'NETWORK_OFFLINE';
      throw e;
    }
    return 'ok';
  };
  const r = await withRetry(fn, { attempts: 3, backoffMs: 1 });
  assert.equal(r, 'ok');
  assert.equal(calls, 2, '重试一次后成功');

  let fourxx = 0;
  await assert.rejects(
    withRetry(async () => {
      fourxx += 1;
      const e = new Error('bad request');
      e.status = 400;
      throw e;
    }, { attempts: 3, backoffMs: 1 }),
  );
  assert.equal(fourxx, 1, '4xx 不重试');
});

test('parseAiJson：剥 markdown 围栏；非法 JSON 返回失败', () => {
  const r1 = parseAiJson('```json\n{"a": 1}\n```');
  assert.equal(r1.ok, true);
  if (r1.ok) assert.deepEqual(r1.value, { a: 1 });
  const r2 = parseAiJson('not json at all');
  assert.equal(r2.ok, false);
  const r3 = parseAiJson('{"a": 1}', { validator: (v) => v.a === 2 });
  assert.equal(r3.ok, false, 'validator 拒绝返回失败');
});

test('redactForLog：key/prompt 原文不落日志', () => {
  const out = redactForLog({
    apiKey: 'sk-secret-123',
    user: '帮我解这道题：x^2-1=0 的完整解题过程要非常长',
    model: 'deepseek-v4-flash',
  });
  assert.equal(out.apiKey, '***REDACTED***');
  assert.doesNotMatch(String(out.user), /x\^2/, 'prompt 不落原文');
  assert.match(String(out.user), /chars/, 'prompt 只记长度');
  assert.equal(out.model, 'deepseek-v4-flash');
});

test('mapAiError：稳定错误码不依赖消息文本', () => {
  assert.equal(mapAiError(new AppError('AI_TIMEOUT', 'x')).code, 'AI_TIMEOUT');
  const abort = new Error('aborted');
  abort.name = 'AbortError';
  assert.equal(mapAiError(abort).code, 'AI_TIMEOUT');
  const five = new Error('upstream');
  five.status = 502;
  assert.equal(mapAiError(five).code, 'AI_REQUEST');
  const plain = new Error('whatever');
  assert.equal(mapAiError(plain).code, 'AI_REQUEST');
});

test('isRetryableError：网络/超时/5xx 可重试；4xx 不可', () => {
  const net = new Error('x');
  net.code = 'NETWORK_OFFLINE';
  assert.equal(isRetryableError(net), true);
  const to = new Error('x');
  to.code = 'AI_TIMEOUT';
  assert.equal(isRetryableError(to), true);
  const five = new Error('x');
  five.status = 503;
  assert.equal(isRetryableError(five), true);
  const four = new Error('x');
  four.status = 400;
  assert.equal(isRetryableError(four), false);
});
