/**
 * 高中数学安全表达式（前后端共用）
 * 支持：数字、x、+ - * / ^、括号、sin cos tan ln log abs sqrt exp、pi e
 */

export const MATH_EXPR_FN_NAMES: readonly string[] = Object.freeze([
  'sin',
  'cos',
  'tan',
  'ln',
  'log',
  'abs',
  'sqrt',
  'exp',
]);

export type MathExprResult =
  | { ok: true; src: string; fn: (x: number) => number | null }
  | { ok: false; error: string };

/**
 * 规范化 + 白名单检查 + 编译（可求值）
 */
export function compileMathExpr(raw: unknown): MathExprResult {
  let s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: '请输入表达式' };
  const src = s.replace(/^[yY]\s*=\s*/, '');
  s = src;
  s = s.replace(/（/g, '(').replace(/）/g, ')');
  s = s.replace(/·/g, '*').replace(/×/g, '*').replace(/÷/g, '/');
  s = s.replace(/\^/g, '**');
  // 隐式乘法
  s = s.replace(/(\d)([xX(])/g, '$1*$2');
  s = s.replace(/([xX)])(\()/g, '$1*$2');
  s = s.replace(/([xX)])(\d)/g, '$1*$2');
  s = s.replace(/(\))([xX])/g, '$1*$2');

  let probe = s.toLowerCase();
  for (const name of MATH_EXPR_FN_NAMES) {
    probe = probe.split(name).join(' ');
  }
  probe = probe.replace(/\bpi\b/g, ' ').replace(/\be\b/g, ' ').replace(/\bx\b/g, ' ');
  probe = probe.replace(/[0-9+\-*/().\s,*]/g, '');
  if (probe.length) {
    return { ok: false, error: '含有不支持的符号或函数' };
  }

  let body = s;
  body = body.replace(/\bpi\b/gi, 'Math.PI');
  body = body.replace(/\be\b/g, 'Math.E');
  body = body.replace(/\bX\b/g, 'x');
  body = body.replace(/\bsin\b/gi, 'Math.sin');
  body = body.replace(/\bcos\b/gi, 'Math.cos');
  body = body.replace(/\btan\b/gi, 'Math.tan');
  body = body.replace(/\bln\b/gi, 'Math.log');
  body = body.replace(/\blog\b/gi, 'Math.log10');
  body = body.replace(/\babs\b/gi, 'Math.abs');
  body = body.replace(/\bsqrt\b/gi, 'Math.sqrt');
  body = body.replace(/\bexp\b/gi, 'Math.exp');

  let compiled: (x: number) => number;
  try {
    compiled = new Function('x', `"use strict"; return (${body});`) as (x: number) => number;
  } catch {
    return { ok: false, error: '表达式无法解析' };
  }

  try {
    compiled(0);
    compiled(1);
  } catch {
    return { ok: false, error: '表达式求值失败，请检查写法' };
  }

  return {
    ok: true,
    src,
    fn: (x) => {
      try {
        const y = compiled(x);
        if (typeof y !== 'number' || !Number.isFinite(y)) return null;
        return y;
      } catch {
        return null;
      }
    },
  };
}

/**
 * 仅校验语法/白名单（服务端 AI 落盘前用；与 compile 规则一致）
 */
export function validateMathExprSyntax(raw: unknown):
  | { ok: true; expr: string }
  | { ok: false; error: string } {
  const r = compileMathExpr(raw);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, expr: r.src };
}

export function formatExprLabel(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return 'y = ?';
  if (/^[yY]\s*=/.test(s)) return s;
  return `y = ${s}`;
}
