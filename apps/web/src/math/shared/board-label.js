/**
 * 画板标签：智能小数 + 函数式实时文案 + JSXGraph autoPosition 避让
 */

/** 点 / 线段等量测标签默认字号 */
export const BOARD_LABEL_FONT_SIZE = 16;

/** @type {Record<string, unknown>} */
export const BOARD_LABEL_ATTR = {
  fontSize: BOARD_LABEL_FONT_SIZE,
  parse: false,
  autoPosition: true,
  autoPositionMinDistance: 16,
  autoPositionMaxDistance: 52,
  offset: [14, 14],
};

/**
 * 有小数才显示小数，最多 maxDecimals 位（去掉尾随 0）
 * @param {number} n
 * @param {number} [maxDecimals=2]
 */
export function formatSmartNumber(n, maxDecimals = 2) {
  if (!Number.isFinite(n)) return '—';
  const f = Number(n.toFixed(maxDecimals));
  if (Object.is(f, -0)) return '0';
  return String(f);
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} [maxDecimals=2]
 */
export function formatCoordsPair(x, y, maxDecimals = 2) {
  return `(${formatSmartNumber(x, maxDecimals)}, ${formatSmartNumber(y, maxDecimals)})`;
}

/**
 * @param {string} baseName
 * @param {number} x
 * @param {number} y
 * @param {number} [maxDecimals=2]
 */
export function formatNamedCoords(baseName, x, y, maxDecimals = 2) {
  const b = baseName || 'P';
  if (!Number.isFinite(x) || !Number.isFinite(y)) return b;
  return `${b}${formatCoordsPair(x, y, maxDecimals)}`;
}

/**
 * @param {any} el
 * @param {string | (() => string)} text
 */
function setLabelContent(el, text) {
  if (!el?.label) return;
  const content = typeof text === 'function' ? text : () => String(text ?? '');
  try {
    // JSXGraph Text 支持 Function：每次 update 自动重算，拖动端点也会刷新
    el.label.setText(content);
  } catch {
    try {
      el.label.setAttribute?.({ text: content });
    } catch {
      /* */
    }
  }
}

/**
 * 合并标签属性
 * @param {Record<string, unknown>} [extra]
 */
export function boardLabelAttrs(extra = {}) {
  return { ...BOARD_LABEL_ATTR, ...extra };
}

/**
 * 给几何对象挂实时标签（文案用函数，避让用 autoPosition）
 * @param {any} el
 * @param {{
 *   text: string | (() => string),
 *   baseName?: string,
 *   fontSize?: number,
 *   offset?: [number, number],
 *   color?: string,
 * }} opts
 */
export function applyBoardLabel(el, opts) {
  if (!el) return;
  const getText = typeof opts.text === 'function' ? opts.text : () => String(opts.text ?? '');
  if (opts.baseName != null) el._mathBaseName = opts.baseName;

  /** @type {Record<string, unknown>} */
  const label = boardLabelAttrs({
    fontSize: opts.fontSize ?? BOARD_LABEL_FONT_SIZE,
  });
  if (opts.offset) label.offset = opts.offset;
  if (opts.color) {
    label.strokeColor = opts.color;
    label.color = opts.color;
  }

  // name 只保留短名（点身份）；完整量测文案走 label 函数
  const shortName =
    opts.baseName != null
      ? String(opts.baseName)
      : typeof opts.text === 'string'
        ? opts.text
        : el._mathBaseName || '·';

  try {
    el.setAttribute({
      withLabel: true,
      name: shortName,
      label,
    });
  } catch {
    /* */
  }

  // setAttribute(name) 可能把 label 写成静态短名，这里立刻换成函数
  setLabelContent(el, getText);
  el._mathLiveLabelTick = () => setLabelContent(el, getText);
  el._mathLiveLabelBound = true;
}

/**
 * 绑定实时标签；watchEls 仅用于登记依赖（函数文案本身会读父点坐标）
 * @param {any} el
 * @param {() => string} getText
 * @param {any[]} [watchEls]
 */
export function bindLiveLabel(el, getText, watchEls = []) {
  if (!el) return;
  setLabelContent(el, getText);
  el._mathLiveLabelTick = () => setLabelContent(el, getText);
  el._mathLiveLabelBound = true;

  // 确保 label 开了 autoPosition（创建后补开也行）
  try {
    el.label?.setAttribute?.({
      autoPosition: true,
      autoPositionMinDistance: 16,
      autoPositionMaxDistance: 52,
      parse: false,
    });
  } catch {
    /* */
  }

  // 端点拖动时主动 bump 一下子对象标签（部分环境下函数刷新略滞后）
  for (const p of watchEls || []) {
    if (!p || p === el || typeof p.on !== 'function') continue;
    if (!p._mathDepLabelTicks) p._mathDepLabelTicks = new Set();
    p._mathDepLabelTicks.add(el._mathLiveLabelTick);
    ensurePointGeomHook(p);
  }
  ensurePointGeomHook(el);
}

/**
 * 点拖动钩子：吸附 + 刷新依赖量测标签
 * @param {any} el
 */
export function ensurePointGeomHook(el) {
  if (!el || el._mathGeomHookBound || typeof el.on !== 'function') return;
  el._mathGeomHookBound = true;

  const run = () => {
    try {
      el._mathSnapTick?.();
    } catch {
      /* */
    }
    try {
      el._mathLiveLabelTick?.();
    } catch {
      /* */
    }
    const deps = el._mathDepLabelTicks;
    if (deps) {
      for (const tick of deps) {
        try {
          tick();
        } catch {
          /* */
        }
      }
    }
    try {
      el.label?.updateText?.();
      el.label?.setAutoPosition?.();
    } catch {
      /* */
    }
  };

  el.on('drag', run);
  el.on('up', run);
}

/** @deprecated 保留导出，避免旧引用报错；autoPosition 已接管避让 */
export function layoutBoardLabels() {}
/** @deprecated */
export function scheduleLabelLayout() {}

/**
 * 兼容旧调用：直接写静态文案（尽量少用）
 * @param {any} el
 * @param {string} text
 */
export function writeElementLabel(el, text) {
  if (!el) return;
  setLabelContent(el, () => String(text ?? ''));
}
