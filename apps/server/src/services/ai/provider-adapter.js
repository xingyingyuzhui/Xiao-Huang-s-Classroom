/**
 * AI provider 统一 adapter（Program 5 Task 5.7；spec §11.4）。
 *
 * - retry：网络/5xx 可重试（幂等请求），4xx 不重试。
 * - schema parse：AI 输出始终视为不可信输入，解析失败给 AI_RESPONSE_INVALID。
 * - redacted logging：日志不含 API Key / 完整 prompt。
 * - 稳定错误码：AI_TIMEOUT / AI_RESPONSE_INVALID / AI_REQUEST / NETWORK_OFFLINE。
 *
 * 包装既有 chat-client（timeout/AbortController 已在 chat-client），
 * 不改变现有调用路径；新消费方经本 adapter 统一。
 */
const { AppError } = require('@xiaohuang/domain-core');

const DEFAULT_ATTEMPTS = 2;
const DEFAULT_BACKOFF_MS = 250;

/** 可重试错误判定：网络异常或 5xx（幂等请求可安全重试）。 */
function isRetryableError(err) {
  if (err?.code === 'NETWORK_OFFLINE' || err?.code === 'AI_TIMEOUT') return true;
  const status = err?.status;
  return typeof status === 'number' && status >= 500 && status < 600;
}

/**
 * 重试策略包装：attempts 次尝试，退避后重试；4xx 与 schema 错误不重试。
 * @param {() => Promise<any>} fn
 * @param {{ attempts?: number, backoffMs?: number, shouldRetry?: (err: any) => boolean }} [options]
 */
async function withRetry(fn, options = {}) {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!shouldRetry(err) || i === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, backoffMs * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * AI 响应 schema parse：AI 输出不可信，先剥离 markdown 代码围栏再 JSON.parse。
 * @param {string} text
 * @param {{ validator?: (parsed: any) => boolean }} [options]
 * @returns {{ ok: true, value: any } | { ok: false, error: string }}
 */
function parseAiJson(text, options = {}) {
  let cleaned = String(text ?? '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(cleaned);
    if (options.validator && !options.validator(parsed)) {
      return { ok: false, error: '结构不符合预期' };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: '无法解析为 JSON' };
  }
}

/** 脱敏：日志输出不落 API Key 与完整 prompt（spec §15/§16）。 */
function redactForLog(obj) {
  if (Array.isArray(obj)) return obj.map(redactForLog);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (/key|token|secret|authorization/i.test(k)) {
        out[k] = '***REDACTED***';
      } else if (k === 'user' || k === 'system' || k === 'prompt' || k === 'messages') {
        out[k] = typeof v === 'string' ? `[${v.length} chars]` : redactForLog(v);
      } else {
        out[k] = redactForLog(v);
      }
    }
    return out;
  }
  return obj;
}

/** 统一错误映射：底层 Error → 稳定 AppError 错误码（AI_*）。 */
function mapAiError(err) {
  if (err instanceof AppError) return err;
  if (err?.code === 'AI_TIMEOUT') return new AppError('AI_TIMEOUT', 'AI 请求超时', 'ai');
  if (err?.name === 'AbortError') return new AppError('AI_TIMEOUT', 'AI 请求超时', 'ai');
  if (err?.status === 502 || err?.status >= 500) return new AppError('AI_REQUEST', 'AI 服务暂不可用', 'ai');
  if (err?.status === 401 || err?.status === 403) return new AppError('AI_REQUEST', 'AI Key 无效或权限不足', 'ai');
  return new AppError('AI_REQUEST', err?.message ?? 'AI 请求失败', 'ai');
}

module.exports = { withRetry, parseAiJson, redactForLog, mapAiError, isRetryableError };
