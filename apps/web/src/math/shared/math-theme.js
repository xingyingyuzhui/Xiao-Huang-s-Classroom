/**
 * 数学画板 · 主题契约（唯一读色入口）
 *
 * 所有主题 tokens.css 必须定义下列 CSS 变量（见 REQUIRED_MATH_THEME_TOKENS）。
 * 业务代码禁止直接用 --border-soft 当网格色，禁止硬编码曲线色板。
 *
 * 换肤：监听 window「chem-theme-change」→ restyleMathBoard + remint 曲线色。
 */

/** 浅色回落色板（与 default tokens --math-fn-* 一致） */
export const MATH_FN_PALETTE_FALLBACK = [
  '#b45309',
  '#0f766e',
  '#2563eb',
  '#7c3aed',
  '#dc2626',
  '#ca8a04',
  '#059669',
  '#e11d48',
];

/**
 * 每个主题 tokens.css 必须声明的变量名（契约测试会扫全主题文件）
 * @type {readonly string[]}
 */
export const REQUIRED_MATH_THEME_TOKENS = Object.freeze([
  '--math-fn-1',
  '--math-fn-2',
  '--math-fn-3',
  '--math-fn-4',
  '--math-fn-5',
  '--math-fn-6',
  '--math-fn-7',
  '--math-fn-8',
  '--math-grid',
  '--math-point-ring',
]);

/**
 * @param {string} name
 * @param {string} [fallback='']
 */
export function readCssVar(name, fallback = '') {
  if (typeof document === 'undefined') return fallback;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/**
 * 多曲线色板：优先 CSS --math-fn-1…8
 * @returns {string[]}
 */
export function getMathFnPalette() {
  const out = [];
  for (let i = 1; i <= 8; i += 1) {
    const v = readCssVar(`--math-fn-${i}`, '');
    if (v) out.push(v);
  }
  return out.length ? out : MATH_FN_PALETTE_FALLBACK.slice();
}

/**
 * 网格线色：必须用 --math-grid，禁止 border-soft
 */
export function getMathGridColor() {
  return (
    readCssVar('--math-grid', '') ||
    readCssVar('--border', '') ||
    readCssVar('--border-ink', '#c0c0c0') ||
    '#c0c0c0'
  );
}

/**
 * 画板 chrome 色（轴/点/字/底）
 * @returns {{
 *   stamp: string,
 *   diagram: string,
 *   paper: string,
 *   boardBg: string,
 *   ink: string,
 *   pointRing: string,
 *   grid: string,
 * }}
 */
export function getMathBoardChrome() {
  const stamp = readCssVar('--stamp', '#b45309');
  const diagram = readCssVar('--diagram', '#0f766e');
  const boardBg = readCssVar('--paper', readCssVar('--card-elevated', '#fffaf5'));
  const paper = readCssVar('--card-elevated', boardBg);
  const ink = readCssVar('--ink', '#1c1917');
  const pointRing = readCssVar('--math-point-ring', paper);
  const grid = getMathGridColor();
  return { stamp, diagram, paper, boardBg, ink, pointRing, grid };
}

/**
 * 按列表序号把曲线色对齐当前主题色板（换肤 / 重建时必调）
 * @param {Array<{ color?: string }>} functions
 * @param {string[]} [palette]
 */
export function remintFunctionColors(functions, palette = getMathFnPalette()) {
  if (!Array.isArray(functions) || !palette?.length) return;
  functions.forEach((fn, i) => {
    if (!fn) return;
    fn.color = palette[i % palette.length];
  });
}

/**
 * 第 n 条新函数应取的颜色
 * @param {number} indexZeroBased
 */
export function colorForFnIndex(indexZeroBased) {
  const palette = getMathFnPalette();
  const i = Math.max(0, Number(indexZeroBased) || 0);
  return palette[i % palette.length];
}
