/**
 * 统一结构化日志（Program 7 Task 7.5；spec §16）。
 *
 * 字段：timestamp/level/scope/requestId/errorCode/durationMs；
 * 生产日志禁止包含 API Key、完整 AI prompt、用户数据库内容与本机敏感路径。
 */
const { errorCodeOf } = require('@xiaohuang/domain-core');

const LEVELS = ['debug', 'info', 'warn', 'error'];

/** 敏感字段名（值一律脱敏） */
const SENSITIVE_KEYS = /api[_-]?key|token|secret|authorization|password/i;
/** AI 内容字段（完整 prompt 不落日志，只记长度） */
const CONTENT_KEYS = /^(user|system|prompt|messages)$/i;

function sanitize(value, depth = 0) {
  if (depth > 3) return '[depth]';
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(k)) out[k] = '***';
    else if (CONTENT_KEYS.test(k)) out[k] = typeof v === 'string' ? `[${v.length} chars]` : '[redacted]';
    else out[k] = sanitize(v, depth + 1);
  }
  return out;
}

function createLogger(scope, { sink = console, now = () => Date.now() } = {}) {
  function emit(level, message, fields = {}) {
    if (!LEVELS.includes(level)) level = 'info';
    const entry = {
      timestamp: new Date(now()).toISOString(),
      level,
      scope,
      message,
      ...sanitize(fields),
    };
    const method = level === 'debug' ? 'log' : level;
    sink[method]?.(JSON.stringify(entry));
  }
  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    /** 从任意 Error 提取稳定错误码 */
    errorWithCode(message, err, fields = {}) {
      emit('error', message, { ...fields, errorCode: errorCodeOf(err) });
    },
  };
}

module.exports = { createLogger, sanitize };
