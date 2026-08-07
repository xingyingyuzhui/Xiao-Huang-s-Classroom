import { describe, expect, it } from 'vitest';
import { parseApiResponse } from '../src/api.js';
import { z } from 'zod';

const docSchema = z.object({ ok: z.boolean() });

describe('API v2 响应合同', () => {
  it('success 响应解析 data', () => {
    const r = parseApiResponse({ success: true, data: { ok: true }, requestId: 'r1' }, docSchema);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ ok: true });
  });

  it('error 响应透传错误 payload', () => {
    const r = parseApiResponse(
      { success: false, error: { code: 'AI_TIMEOUT', message: '超时' }, requestId: 'r2' },
      docSchema,
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('AI_TIMEOUT');
  });

  it('data 不符合 schema 返回 VALIDATION_SCHEMA', () => {
    const r = parseApiResponse(
      { success: true, data: { ok: 'not-bool' }, requestId: 'r3' },
      docSchema,
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('VALIDATION_SCHEMA');
  });

  it('整体不符合合同返回 INTERNAL_UNKNOWN', () => {
    const r = parseApiResponse({ nope: 1 }, docSchema);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.code).toBe('INTERNAL_UNKNOWN');
  });
});
