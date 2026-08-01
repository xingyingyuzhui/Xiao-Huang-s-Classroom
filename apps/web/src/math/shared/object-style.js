/**
 * JSXGraph 对象样式读写（线/点/圆/曲线/文字）
 * Three 立体后续用独立 adapter，面板契约可复用 ObjectStylePatch。
 */

/**
 * @typedef {'point' | 'line' | 'circle' | 'curve' | 'text' | 'polygon' | 'other'} MathObjectKind
 *
 * @typedef {{
 *   kind: MathObjectKind,
 *   label: string,
 *   strokeColor: string,
 *   strokeWidth: number,
 *   dash: number,
 *   fillColor: string,
 *   fillOpacity: number,
 *   size: number,
 *   fontSize: number,
 *   hasStroke: boolean,
 *   hasFill: boolean,
 *   hasSize: boolean,
 *   hasFont: boolean,
 *   hasDash: boolean,
 * }} ObjectStyleSnapshot
 *
 * @typedef {{
 *   strokeColor?: string,
 *   strokeWidth?: number,
 *   dash?: number,
 *   fillColor?: string,
 *   fillOpacity?: number,
 *   size?: number,
 *   fontSize?: number,
 * }} ObjectStylePatch
 */

/** @type {Array<{ id: string, label: string, dash: number }>} */
export const DASH_STYLES = [
  { id: 'solid', label: '实线', dash: 0 },
  { id: 'dot', label: '点线', dash: 1 },
  { id: 'dash', label: '虚线', dash: 2 },
  { id: 'dashdot', label: '点划', dash: 3 },
];

/** @type {number[]} */
export const STROKE_WIDTH_PRESETS = [1, 1.5, 2, 2.5, 3, 4, 5, 6];

/** @type {string[]} */
export const COLOR_PRESETS = [
  '#b45309',
  '#0f766e',
  '#1c1917',
  '#dc2626',
  '#2563eb',
  '#7c3aed',
  '#ca8a04',
  '#059669',
  '#e11d48',
  '#64748b',
];

/**
 * @param {any} el
 * @returns {MathObjectKind}
 */
export function detectObjectKind(el) {
  if (!el) return 'other';
  const elType = el.elType || '';
  const cls = el.elementClass;
  // JSXGraph elementClass: 1 point, 2 line, 3 circle, 4 curve, …
  if (elType === 'point' || elType === 'glider' || elType === 'perpendicularpoint' || cls === 1) {
    return 'point';
  }
  if (
    elType === 'line' ||
    elType === 'segment' ||
    elType === 'axis' ||
    elType === 'arrow' ||
    elType === 'polygonalchain' ||
    cls === 2
  ) {
    return 'line';
  }
  if (elType === 'circle' || elType === 'arc' || cls === 3) {
    return 'circle';
  }
  if (
    elType === 'curve' ||
    elType === 'functiongraph' ||
    elType === 'spline' ||
    cls === 4
  ) {
    return 'curve';
  }
  if (elType === 'text' || elType === 'label' || cls === 7) {
    return 'text';
  }
  if (elType === 'polygon' || elType === 'polygonalface') {
    return 'polygon';
  }
  if (elType === 'angle' || elType === 'sector') {
    return 'circle';
  }
  return 'other';
}

/**
 * @param {MathObjectKind} kind
 */
export function kindLabel(kind) {
  switch (kind) {
    case 'point':
      return '点';
    case 'line':
      return '线';
    case 'circle':
      return '圆/弧';
    case 'curve':
      return '曲线';
    case 'text':
      return '文字';
    case 'polygon':
      return '多边形';
    default:
      return '对象';
  }
}

/**
 * @param {any} el
 * @param {string} key camelCase attribute
 */
function vis(el, key) {
  if (!el) return undefined;
  if (typeof el.getAttribute === 'function') {
    try {
      const v = el.getAttribute(key);
      if (v != null && v !== '') return v;
    } catch {
      /* */
    }
  }
  const prop = el.visProp || {};
  const lower = key.toLowerCase();
  if (prop[lower] != null) return prop[lower];
  if (prop[key] != null) return prop[key];
  return undefined;
}

/**
 * @param {unknown} v
 * @param {string} fallback
 */
function asColor(v, fallback) {
  if (typeof v !== 'string' || !v) return fallback;
  return v;
}

/**
 * @param {unknown} v
 * @param {number} fallback
 */
function asNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {any} el
 * @param {string} [fallbackName]
 * @returns {ObjectStyleSnapshot}
 */
export function readObjectStyle(el, fallbackName = '') {
  const kind = detectObjectKind(el);
  const name = (el?.name && String(el.name)) || fallbackName || el?.id || kindLabel(kind);
  const hasStroke = kind !== 'text';
  const hasFill = kind === 'point' || kind === 'circle' || kind === 'polygon';
  const hasSize = kind === 'point';
  const hasFont = kind === 'point' || kind === 'text' || Boolean(el?.label);
  const hasDash = kind === 'line' || kind === 'circle' || kind === 'curve' || kind === 'polygon';

  let fontSize = 16;
  if (el?.label && typeof el.label.getAttribute === 'function') {
    fontSize = asNum(el.label.getAttribute('fontSize') ?? vis(el.label, 'fontSize'), 16);
  } else {
    fontSize = asNum(vis(el, 'fontSize'), 16);
  }

  return {
    kind,
    label: String(name),
    strokeColor: asColor(vis(el, 'strokeColor'), '#1c1917'),
    strokeWidth: asNum(vis(el, 'strokeWidth'), kind === 'point' ? 1 : 2),
    dash: asNum(vis(el, 'dash'), 0),
    fillColor: asColor(vis(el, 'fillColor'), '#b45309'),
    fillOpacity: asNum(vis(el, 'fillOpacity'), kind === 'point' ? 1 : 0.15),
    size: asNum(vis(el, 'size'), 4),
    fontSize,
    hasStroke,
    hasFill,
    hasSize,
    hasFont,
    hasDash,
  };
}

/**
 * @param {any} el
 * @param {ObjectStylePatch} patch
 */
export function applyObjectStyle(el, patch) {
  if (!el || !patch || typeof el.setAttribute !== 'function') return;

  /** @type {Record<string, unknown>} */
  const attrs = {};
  if (patch.strokeColor != null) attrs.strokeColor = patch.strokeColor;
  if (patch.strokeWidth != null) attrs.strokeWidth = patch.strokeWidth;
  if (patch.dash != null) attrs.dash = patch.dash;
  if (patch.fillColor != null) attrs.fillColor = patch.fillColor;
  if (patch.fillOpacity != null) attrs.fillOpacity = patch.fillOpacity;
  if (patch.size != null) attrs.size = patch.size;

  // 虚线间距随线宽缩放，否则 strokeWidth=6 时点/虚线会糊成实线
  // JSXGraph: dashScale=true → dasharray *= strokeWidth/2
  if (patch.dash != null || patch.strokeWidth != null) {
    const nextDash = patch.dash != null ? patch.dash : asNum(vis(el, 'dash'), 0);
    if (nextDash > 0) {
      attrs.dashScale = true;
    }
  }

  if (Object.keys(attrs).length) {
    el.setAttribute(attrs);
  }

  if (patch.fontSize != null) {
    if (el.label && typeof el.label.setAttribute === 'function') {
      el.label.setAttribute({ fontSize: patch.fontSize });
    } else if (detectObjectKind(el) === 'text') {
      el.setAttribute({ fontSize: patch.fontSize });
    }
  }

  // 强制按新线宽重算 stroke-dasharray（部分版本只改 width 不刷新 dash）
  try {
    if ((patch.dash != null || patch.strokeWidth != null) && el.board?.renderer?.setDashStyle) {
      el.board.renderer.setDashStyle(el);
    }
  } catch {
    /* */
  }

  try {
    el.board?.update?.();
  } catch {
    /* */
  }
}

/**
 * 选中高亮：轻量 shadow + 加粗描边提示（不改用户色）
 * @param {any} el
 * @param {boolean} on
 */
export function setSelectionChrome(el, on) {
  if (!el || typeof el.setAttribute !== 'function') return;
  if (on) {
    if (!el._mathSelChrome) {
      el._mathSelChrome = {
        shadow: vis(el, 'shadow'),
        highlightStrokeWidth: vis(el, 'highlightStrokeWidth'),
        highlightStrokeColor: vis(el, 'highlightStrokeColor'),
      };
    }
    el.setAttribute({
      shadow: true,
      highlightStrokeWidth: Math.max(asNum(vis(el, 'strokeWidth'), 2) + 2, 4),
      highlightStrokeColor: '#2563eb',
    });
    try {
      if (typeof el.highlight === 'function') el.highlight(true);
      else if (el.board?.renderer?.highlight) el.board.renderer.highlight(el);
    } catch {
      /* */
    }
  } else if (el._mathSelChrome) {
    const b = el._mathSelChrome;
    el.setAttribute({
      shadow: b.shadow === true,
      highlightStrokeWidth: b.highlightStrokeWidth ?? 2,
      highlightStrokeColor: b.highlightStrokeColor ?? '#c3d9ff',
    });
    try {
      if (typeof el.noHighlight === 'function') el.noHighlight();
      else if (el.board?.renderer?.noHighlight) el.board.renderer.noHighlight(el);
    } catch {
      /* */
    }
    el._mathSelChrome = null;
  }
  try {
    el.board?.update?.();
  } catch {
    /* */
  }
}
