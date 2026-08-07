/**
 * Settings service 错误模型试点（Program 2 Task 2.7）。
 *
 * 断言：settings service 返回 domain-core Result；DB 读取失败时返回
 * 稳定错误码 PERSISTENCE_READ（不依赖消息文本）；route 层回退默认不静默。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = require('../helpers/repo-root.js');

const service = require(path.join(root, 'apps/server/src/services/settings-service.js'));

test('正常读取返回 ok 且结构与默认设置对齐', () => {
  const result = service.loadSubjectSettings({
    queryOne: () => ({ value: JSON.stringify({ chemistry: { ai: { model: 'deepseek-v4-flash' } } }) }),
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.value.chemistry, '包含 chemistry 设置');
    assert.equal(result.value.chemistry.ai.model, 'deepseek-v4-flash');
  }
});

test('无记录时返回默认设置', () => {
  const result = service.loadSubjectSettings({ queryOne: () => null });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.value.math, '默认设置包含全部 READY 学科');
  }
});

test('DB 读取抛错返回稳定错误码 PERSISTENCE_READ（不依赖消息文本）', () => {
  const result = service.loadSubjectSettings({
    queryOne: () => {
      throw new Error('database is on fire: some unstable detail');
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'PERSISTENCE_READ');
    assert.equal(result.error instanceof Error, true);
    // 错误码是程序分支依据；消息只用于展示
    assert.equal(typeof result.error.message, 'string');
  }
});

test('AppError 跨包构造可用（domain-core 双产物 CJS 入口）', () => {
  const { AppError, errorCodeOf } = require('@xiaohuang/domain-core');
  const e = new AppError('AI_TIMEOUT', '超时');
  assert.equal(errorCodeOf(e), 'AI_TIMEOUT');
  assert.equal(errorCodeOf(new Error('x')), 'INTERNAL_UNKNOWN');
});
