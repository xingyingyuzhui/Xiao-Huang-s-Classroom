import { describe, expect, it } from 'vitest';
import { AppError, ErrorCode, errorCodeOf } from '../src/errors.js';

describe('AppError 与稳定错误码', () => {
  it('包含稳定错误码与分类', () => {
    const e = new AppError('VALIDATION_COEFFS_NOT_FINITE', '系数必须是有限数');
    expect(e.code).toBe('VALIDATION_COEFFS_NOT_FINITE');
    expect(e.message).toBe('系数必须是有限数');
    expect(e instanceof Error).toBe(true);
  });

  it('错误码分类枚举覆盖 spec §7.3 全部类别', () => {
    for (const prefix of [
      'VALIDATION_',
      'PERSISTENCE_',
      'NETWORK_',
      'DATABASE_',
      'AI_',
      'RENDERER_',
      'LIFECYCLE_',
      'IPC_',
      'INTERNAL_',
    ]) {
      expect(ErrorCode.some((c) => c.startsWith(prefix))).toBe(true);
    }
  });

  it('errorCodeOf 从任意 Error 归一化错误码', () => {
    expect(errorCodeOf(new AppError('AI_TIMEOUT', ''))).toBe('AI_TIMEOUT');
    expect(errorCodeOf(new Error('plain'))).toBe('INTERNAL_UNKNOWN');
  });
});
