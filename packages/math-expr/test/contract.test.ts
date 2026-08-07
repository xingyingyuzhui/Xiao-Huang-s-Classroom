/**
 * math-expr 合同测试（R2.2）：核心 API 行为 + 双产物（ESM/CJS）一致性。
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { compileMathExpr, validateMathExprSyntax, formatExprLabel, MATH_EXPR_FN_NAMES } from '../src/index.js';

const require = createRequire(import.meta.url);

describe('math-expr 核心 API', () => {
  it('compileMathExpr 编译并求值（多项式/三角/幂）', () => {
    const poly = compileMathExpr('0.5x^2-x-1.5');
    expect(poly.ok).toBe(true);
    if (poly.ok) {
      expect(poly.fn(2)).toBe(-1.5);
      expect(poly.fn(-1)).toBe(0); // 0.5·1 + 1 - 1.5 = 0
    }
    const tri = compileMathExpr('sin(x)');
    if (tri.ok) expect(Math.abs(tri.fn(Math.PI / 2) - 1) < 1e-9).toBe(true);
    const pow = compileMathExpr('2^x');
    if (pow.ok) expect(pow.fn(3)).toBe(8);
  });

  it('白名单拒绝非法符号与函数', () => {
    expect(compileMathExpr('x + alert(1)').ok).toBe(false);
    expect(compileMathExpr('x; process.exit()').ok).toBe(false);
    expect(compileMathExpr('2^3').ok).toBe(true);
  });

  it('validateMathExprSyntax 与 compile 规则一致', () => {
    expect(validateMathExprSyntax('2x+3').ok).toBe(true);
    expect(validateMathExprSyntax('x = evil()').ok).toBe(false);
  });

  it('formatExprLabel 补全 y= 前缀', () => {
    expect(formatExprLabel('x^2')).toBe('y = x^2');
    expect(formatExprLabel('')).toBe('y = ?');
    expect(formatExprLabel('y = 1')).toBe('y = 1');
  });

  it('函数名白名单完整', () => {
    expect(MATH_EXPR_FN_NAMES).toContain('sin');
    expect(MATH_EXPR_FN_NAMES).toContain('log');
  });
});

describe('双产物一致性（ESM import vs CJS require）', () => {
  it('CJS require 与 ESM 行为一致', () => {
    const cjs = require('../dist/index.cjs');
    const esm = compileMathExpr('x^2+1');
    const cjsCompiled = cjs.compileMathExpr('x^2+1');
    expect(cjsCompiled.ok).toBe(esm.ok);
    if (cjsCompiled.ok && esm.ok) {
      expect(cjsCompiled.fn(3)).toBe(esm.fn(3));
    }
    expect(cjs.validateMathExprSyntax('2x').ok).toBe(true);
  });
});
