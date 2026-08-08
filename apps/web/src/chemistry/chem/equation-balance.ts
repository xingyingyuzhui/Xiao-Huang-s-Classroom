/**
 * 简易化学方程式配平（中学范围）
 * 支持：元素、数字下标、括号、+、= / →
 */

const SUB = '₀₁₂₃₄₅₆₇₈₉';

function toAscii(s: string): string {
  return String(s || '')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (d) => String(SUB.indexOf(d)))
    .replace(/[→⇌↔]/g, '=')
    .replace(/\s+/g, '');
}

/** 配平结果中的单个物种 */
export interface Species {
  coef: number;
  formula: string;
  counts: Record<string, number>;
}

/** 解析一个物种：如 2H2O、(NH4)2SO4 */
function parseSpecies(raw: string): Species {
  let s = toAscii(raw);
  let coef = 1;
  const m = s.match(/^(\d+)(.*)$/);
  if (m) {
    coef = parseInt(m[1] || '', 10) || 1;
    s = m[2] || '';
  }
  const counts = parseFormula(s);
  return { coef, formula: s, counts };
}

function parseFormula(formula: string): Record<string, number> {
  const stack: Array<Record<string, number>> = [{}];
  let i = 0;
  const s = formula;
  while (i < s.length) {
    if (s.charAt(i) === '(') {
      stack.push({});
      i += 1;
    } else if (s.charAt(i) === ')') {
      i += 1;
      let n = '';
      while (i < s.length && /\d/.test(s.charAt(i))) {
        n += s.charAt(i);
        i += 1;
      }
      const mult = n ? parseInt(n, 10) : 1;
      if (stack.length < 2) {
        throw new Error('化学式括号不匹配');
      }
      const top = stack.pop();
      const parent = stack[stack.length - 1];
      if (!parent || typeof parent !== 'object') {
        throw new Error('化学式括号不匹配');
      }
      for (const [el, c] of Object.entries(top || {})) {
        parent[el] = (parent[el] || 0) + c * mult;
      }
    } else if (/[A-Z]/.test(s.charAt(i))) {
      let el = s.charAt(i);
      i += 1;
      if (i < s.length && /[a-z]/.test(s.charAt(i))) {
        el += s.charAt(i);
        i += 1;
      }
      let n = '';
      while (i < s.length && /\d/.test(s.charAt(i))) {
        n += s.charAt(i);
        i += 1;
      }
      const mult = n ? parseInt(n, 10) : 1;
      const top = stack[stack.length - 1]!;
      top[el] = (top[el] || 0) + mult;
    } else {
      i += 1;
    }
  }
  if (stack.length !== 1) {
    throw new Error('化学式括号不匹配');
  }
  return stack[0] || {};
}

function sideCounts(speciesList: Species[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const sp of speciesList) {
    for (const [el, c] of Object.entries(sp.counts)) {
      total[el] = (total[el] || 0) + c * sp.coef;
    }
  }
  return total;
}

function isBalanced(left: Species[], right: Species[]): boolean {
  const L = sideCounts(left);
  const R = sideCounts(right);
  const els = new Set([...Object.keys(L), ...Object.keys(R)]);
  for (const el of els) {
    if ((L[el] || 0) !== (R[el] || 0)) return false;
  }
  return true;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

/** 配平结果 */
export interface BalanceResult {
  balanced: boolean;
  equation: string;
  left: Species[];
  right: Species[];
  steps: string[];
}

/**
 * 暴力小系数搜索（物种 ≤ 6，系数 ≤ maxCoef）
 */
export function balanceEquation(input: string): BalanceResult {
  const raw = toAscii(input);
  if (!raw.includes('=')) {
    throw new Error('请使用 = 或 → 分隔反应物与生成物');
  }
  const [ls, rs] = raw.split('=');
  if (!ls || !rs) throw new Error('方程式不完整');

  const left = ls.split('+').filter(Boolean).map(parseSpecies);
  const right = rs.split('+').filter(Boolean).map(parseSpecies);
  if (!left.length || !right.length) throw new Error('两侧至少各有一种物质');
  if (left.length + right.length > 7) {
    throw new Error('物种过多，请用 AI 建议或拆分');
  }

  // 已配平
  if (isBalanced(left, right)) {
    return {
      balanced: true,
      equation: formatEq(left, right),
      left,
      right,
      steps: ['原式原子已守恒，无需调整系数。'],
    };
  }

  // 重置系数为 1 再搜
  left.forEach((s) => {
    s.coef = 1;
  });
  right.forEach((s) => {
    s.coef = 1;
  });

  const maxCoef = 8;
  const n = left.length + right.length;
  const all = [...left, ...right];

  function tryAssign(idx: number): boolean {
    if (idx === n) return isBalanced(left, right);
    for (let c = 1; c <= maxCoef; c++) {
      all[idx]!.coef = c;
      if (tryAssign(idx + 1)) return true;
    }
    return false;
  }

  if (!tryAssign(0)) {
    throw new Error('未能在小系数内自动配平，可改写式子或用 AI 建议');
  }

  // 约分
  let g = all[0]!.coef;
  for (const s of all) g = gcd(g, s.coef);
  if (g > 1)
    all.forEach((s) => {
      s.coef = s.coef / g;
    });

  return {
    balanced: true,
    equation: formatEq(left, right),
    left,
    right,
    steps: [
      '将各物质系数设为待定整数',
      '按原子守恒枚举小系数组合',
      `得到配平式：${formatEq(left, right)}`,
      '本地校验：左右原子数一致',
    ],
  };
}

function formatEq(left: Species[], right: Species[]): string {
  const fmt = (list: Species[]): string =>
    list.map((s) => `${s.coef > 1 ? s.coef : ''}${prettyFormula(s.formula)}`).join(' + ');
  return `${fmt(left)} → ${fmt(right)}`;
}

function prettyFormula(f: string): string {
  return String(f).replace(/\d/g, (d) => SUB[Number(d)] || d);
}

function gcdArray(arr: number[]): number {
  let g = arr[0] || 1;
  for (let i = 1; i < arr.length; i++) {
    g = gcd(g, arr[i] || 1);
  }
  return g || 1;
}

/**
 * 比较两个方程式是否等价（系数约分到最简后一致）
 * 输入：字符串，如 "2H2 + O2 = 2H2O"
 */
export function equationsEquivalent(a: string, b: string): boolean {
  try {
    const pa = parseEquationSides(a);
    const pb = parseEquationSides(b);
    if (!pa || !pb) return false;
    // 比较物种公式集合
    const la = pa.left.map((s) => s.formula).join(',');
    const lb = pb.left.map((s) => s.formula).join(',');
    const ra = pa.right.map((s) => s.formula).join(',');
    const rb = pb.right.map((s) => s.formula).join(',');
    if (la !== lb || ra !== rb) return false;
    // 约分后比较系数
    const ca = [...pa.left, ...pa.right].map((s) => s.coef);
    const cb = [...pb.left, ...pb.right].map((s) => s.coef);
    const ga = gcdArray(ca);
    const gb = gcdArray(cb);
    const na = ca.map((c) => c / ga);
    const nb = cb.map((c) => c / gb);
    return na.length === nb.length && na.every((v, i) => v === nb[i]);
  } catch {
    return false;
  }
}

/** 方程式两侧物种（含各物种原子计数） */
export interface EquationSides {
  left: Species[];
  right: Species[];
}

export function parseEquationSides(input: string): EquationSides | null {
  const raw = toAscii(input);
  if (!raw.includes('=')) return null;
  const [ls, rs] = raw.split('=');
  if (!ls || !rs) return null;
  const left = ls.split('+').filter(Boolean).map(parseSpecies);
  const right = rs.split('+').filter(Boolean).map(parseSpecies);
  if (!left.length || !right.length) return null;
  return { left, right };
}

/** 练习用 species 一侧（各物种系数置 1） */
export interface PracticeSpeciesSide {
  formula: string;
  coef: number;
}

export interface PracticeSpecies {
  left: PracticeSpeciesSide[];
  right: PracticeSpeciesSide[];
}

/**
 * 起式 → 练习用 species（各物种系数置 1）
 */
export function speciesFromEquation(input: string): PracticeSpecies | null {
  const sides = parseEquationSides(input);
  if (!sides) return null;
  return {
    left: sides.left.map((s) => ({ formula: s.formula, coef: 1 })),
    right: sides.right.map((s) => ({ formula: s.formula, coef: 1 })),
  };
}

/** 守恒校验结果（失败分支无 left/right 计数） */
export interface ConservationResult {
  ok: boolean;
  message: string;
  left?: Record<string, number>;
  right?: Record<string, number>;
}

/** 校验任意式子是否守恒 */
export function checkConservation(input: string): ConservationResult {
  try {
    const raw = toAscii(input);
    if (!raw.includes('=')) return { ok: false, message: '缺少 = 或 →' };
    const [ls, rs] = raw.split('=');
    const left = (ls || '').split('+').filter(Boolean).map(parseSpecies);
    const right = (rs || '').split('+').filter(Boolean).map(parseSpecies);
    const ok = isBalanced(left, right);
    return {
      ok,
      message: ok ? '原子守恒 ✓' : '原子不守恒 ✗',
      left: sideCounts(left),
      right: sideCounts(right),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    return { ok: false, message: msg || '无法解析' };
  }
}
