/**
 * 画板标签：智能小数 + 函数式实时文案 + JSXGraph autoPosition 避让
 */

/** 点 / 线段等量测标签默认字号 */
export const BOARD_LABEL_FONT_SIZE = 16;

/** @type {Record<string, unknown>} */
export const BOARD_LABEL_ATTR = {
  fontSize: BOARD_LABEL_FONT_SIZE,
  parse: false,
  // 关闭持续 autoPosition：拖动中会扫全板对象；改拖动结束再统一刷新融合
  autoPosition: false,
  offset: [14, 14],
};

/**
 * 线段 / 直线 / 切线量测标签：贴在路径中段，避免跑到视窗外沿
 * @type {Record<string, unknown>}
 */
export const BOARD_PATH_LABEL_ATTR = {
  fontSize: BOARD_LABEL_FONT_SIZE,
  parse: false,
  autoPosition: false,
  anchorX: 'middle',
  anchorY: 'middle',
  offset: [0, 0],
  distance: 1.15,
  position: '50% left',
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
 * 刷新对象短名（样式面板改名、文档投影）
 * @param {any} el
 * @param {string} name
 */
export function applyDisplayName(el, name) {
  if (!el) return;
  const next = String(name ?? '').trim() || '·';
  el._mathBaseName = next;
  el._mathSelectLabel = next;
  try {
    el.name = next;
  } catch {
    /* */
  }
  try {
    if (typeof el._mathLiveLabelTick === 'function') el._mathLiveLabelTick();
  } catch {
    /* */
  }
  // 线段/垂线等量测标签挂在独立 text 上，短名变更需刷新量测文案
  try {
    el._mathMeasureText?._mathLiveLabelTick?.();
  } catch {
    /* */
  }
  try {
    el.board?._mathSchedulePointLabelFusion?.();
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
 * 点标签：尊重 `_mathShowCoords`（关则只显示短名）
 * @param {any} el
 * @param {string} [baseName]
 * @param {number} [maxDecimals=2]
 */

export function formatElementCoordsLabel(el, baseName, maxDecimals = 2) {
  const b = el?._mathBaseName || baseName || 'P';
  if (!el?._mathShowCoords) return b;
  try {
    const x = Number(el.X());
    const y = Number(el.Y());
    return formatNamedCoords(b, x, y, maxDecimals);
  } catch {
    return b;
  }
}

/**
 * @param {any} el
 * @param {string | (() => string)} text
 */
export function setLabelContent(el, text) {
  if (!el) return;
  const content =
    typeof text === 'function'
      ? () => {
          if (el._mathLabelFusionSuppressed) return '';
          return text();
        }
      : () => {
          if (el._mathLabelFusionSuppressed) return '';
          return String(text ?? '');
        };
  // 独立量测 Text（中点标签）本身就是文案载体
  if (el.elType === 'text' || (!el.label && typeof el.setText === 'function')) {
    try {
      el.setText(content);
    } catch {
      try {
        el.setAttribute?.({ text: content });
      } catch {
        /* */
      }
    }
    return;
  }
  if (!el.label) return;
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
 * @param {'point' | 'path'} [kind='point']
 */
export function boardLabelAttrs(extra = {}, kind = 'point') {
  const base = kind === 'path' ? BOARD_PATH_LABEL_ATTR : BOARD_LABEL_ATTR;
  return { ...base, ...extra };
}

/**
 * @param {any} el
 * @param {{ labelKind?: 'point' | 'path' }} [opts]
 * @returns {'point' | 'path'}
 */
function resolveLabelKind(el, opts = {}) {
  if (opts.labelKind === 'path' || opts.labelKind === 'point') return opts.labelKind;
  const t = el?.elType;
  if (t === 'line' || t === 'segment') return 'path';
  const k = el?._mathConstrKind;
  if ((k === 'line' || k === 'segment' || k === 'tangent') && t !== 'point') return 'path';
  if (k === 'perp' && t === 'segment') return 'path';
  return 'point';
}

/**
 * 直线与当前视口（略内缩）的交点，并沿法向偏开，避免字压在线上
 * @param {any} board
 * @param {any} p1
 * @param {any} p2
 * @param {number} [insetFrac=0.07]
 * @returns {{ x: number, y: number } | null}
 */
export function lineLabelAnchorOnViewportRim(board, p1, p2, insetFrac = 0.07) {
  let bb;
  try {
    bb = board?.getBoundingBox?.();
  } catch {
    bb = null;
  }
  if (!bb || bb.length < 4) return null;
  // JSXGraph: [xMin, yMax, xMax, yMin]
  const xMin = Number(bb[0]);
  const yMax = Number(bb[1]);
  const xMax = Number(bb[2]);
  const yMin = Number(bb[3]);
  if (![xMin, yMax, xMax, yMin].every(Number.isFinite)) return null;
  const w = xMax - xMin;
  const h = yMax - yMin;
  const ix = Math.max(Math.abs(w) * insetFrac, 1e-6);
  const iy = Math.max(Math.abs(h) * insetFrac, 1e-6);
  const left = Math.min(xMin, xMax) + ix;
  const right = Math.max(xMin, xMax) - ix;
  const bottom = Math.min(yMin, yMax) + iy;
  const top = Math.max(yMin, yMax) - iy;
  let x1;
  let y1;
  let x2;
  let y2;
  try {
    x1 = Number(p1.X());
    y1 = Number(p1.Y());
    x2 = Number(p2.X());
    y2 = Number(p2.Y());
  } catch {
    return null;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;

  /** @type {{ x: number, y: number }[]} */
  const hits = [];
  const eps = 1e-9;
  const inY = (y) => y >= bottom - eps && y <= top + eps;
  const inX = (x) => x >= left - eps && x <= right + eps;
  if (Math.abs(dx) > 1e-12) {
    let t = (left - x1) / dx;
    let y = y1 + t * dy;
    if (inY(y)) hits.push({ x: left, y });
    t = (right - x1) / dx;
    y = y1 + t * dy;
    if (inY(y)) hits.push({ x: right, y });
  }
  if (Math.abs(dy) > 1e-12) {
    let t = (bottom - y1) / dy;
    let x = x1 + t * dx;
    if (inX(x)) hits.push({ x, y: bottom });
    t = (top - y1) / dy;
    x = x1 + t * dx;
    if (inX(x)) hits.push({ x, y: top });
  }

  /** @type {{ x: number, y: number }[]} */
  const uniq = [];
  for (const h of hits) {
    if (!Number.isFinite(h.x) || !Number.isFinite(h.y)) continue;
    if (uniq.some((u) => Math.hypot(u.x - h.x, u.y - h.y) < 1e-6)) continue;
    uniq.push(h);
  }

  /** @type {{ x: number, y: number }} */
  let rim;
  if (!uniq.length) {
    rim = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  } else {
    // 稳定选一侧外围：偏右，其次偏上（平移缩放时少跳变）
    uniq.sort((a, b) => b.x - a.x || b.y - a.y);
    rim = uniq[0];
  }
  return offsetPointOffLine(rim.x, rim.y, dx, dy, {
    towardX: (left + right) / 2,
    towardY: (bottom + top) / 2,
    distance: measureLabelOffsetDistance(board),
  });
}

/**
 * 把点沿直线法向挪开（优先朝 toward 一侧）
 * @param {number} x
 * @param {number} y
 * @param {number} dx
 * @param {number} dy
 * @param {{ towardX?: number, towardY?: number, distance?: number }} [opts]
 */
export function offsetPointOffLine(x, y, dx, dy, opts = {}) {
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-12) return { x, y };
  let nx = -dy / len;
  let ny = dx / len;
  const dist = Number.isFinite(opts.distance) ? /** @type {number} */ (opts.distance) : 0.35;
  if (
    Number.isFinite(opts.towardX) &&
    Number.isFinite(opts.towardY) &&
    nx * (/** @type {number} */ (opts.towardX) - x) +
      ny * (/** @type {number} */ (opts.towardY) - y) <
      0
  ) {
    nx = -nx;
    ny = -ny;
  }
  return { x: x + nx * dist, y: y + ny * dist };
}

/**
 * 视口尺度下的标签离线距离（用户坐标）
 * @param {any} board
 * @param {number} [frac=0.032]
 */
export function measureLabelOffsetDistance(board, frac = 0.032) {
  try {
    const bb = board?.getBoundingBox?.();
    if (!bb || bb.length < 4) return 0.35;
    const w = Math.abs(Number(bb[2]) - Number(bb[0]));
    const h = Math.abs(Number(bb[1]) - Number(bb[3]));
    if (![w, h].every(Number.isFinite)) return 0.35;
    return Math.max(Math.max(w, h) * frac, 0.2);
  } catch {
    return 0.35;
  }
}

/**
 * 视口中心（用户坐标）
 * @param {any} board
 * @returns {{ x: number, y: number } | null}
 */
function viewportCenter(board) {
  try {
    const bb = board?.getBoundingBox?.();
    if (!bb || bb.length < 4) return null;
    return {
      x: (Number(bb[0]) + Number(bb[2])) / 2,
      y: (Number(bb[1]) + Number(bb[3])) / 2,
    };
  } catch {
    return null;
  }
}

/**
 * 作图量测标签放置：线段/垂线长度在中点；直线/切线 k 贴视口外围
 * @param {'segment' | 'line' | 'tangent' | 'perp' | string} [kind]
 * @returns {'mid' | 'viewport-rim'}
 */
export function measureLabelPlacementFor(kind) {
  if (kind === 'segment' || kind === 'perp') return 'mid';
  return 'viewport-rim';
}

/**
 * 量测文案：mid=两端点中点；viewport-rim=当前视口外围（法向偏开，不压线）
 * @param {any} board
 * @param {any} hostEl 线段/直线元素（自身 withLabel 关闭）
 * @param {any} p1
 * @param {any} p2
 * @param {string | (() => string)} text
 * @param {{ color?: string, fontSize?: number, placement?: 'mid' | 'viewport-rim' }} [opts]
 */
export function attachMidpointMeasureLabel(board, hostEl, p1, p2, text, opts = {}) {
  if (!board || !hostEl || !p1 || !p2) return null;
  const getText = typeof text === 'function' ? text : () => String(text ?? '');
  const placement = opts.placement === 'mid' ? 'mid' : 'viewport-rim';
  try {
    hostEl.setAttribute({ withLabel: false });
  } catch {
    /* */
  }
  /** @type {Record<string, unknown>} */
  const attr = {
    fontSize: opts.fontSize ?? BOARD_LABEL_FONT_SIZE,
    anchorX: 'middle',
    anchorY: 'middle',
    cssClass: 'JXGtext math-board-path-label',
    highlight: false,
    fixed: true,
    parse: false,
    display: 'html',
  };
  if (opts.color) {
    attr.strokeColor = opts.color;
    attr.color = opts.color;
  }
  const midAnchor = () => {
    const x1 = Number(p1.X());
    const y1 = Number(p1.Y());
    const x2 = Number(p2.X());
    const y2 = Number(p2.Y());
    const c = viewportCenter(board);
    return offsetPointOffLine((x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1, {
      distance: measureLabelOffsetDistance(board),
      towardX: c?.x,
      towardY: c?.y,
    });
  };
  const midX = () => midAnchor().x;
  const midY = () => midAnchor().y;
  const rimX = () => {
    const a = lineLabelAnchorOnViewportRim(board, p1, p2);
    return a ? a.x : midX();
  };
  const rimY = () => {
    const a = lineLabelAnchorOnViewportRim(board, p1, p2);
    return a ? a.y : midY();
  };
  let txt = null;
  try {
    txt = board.create(
      'text',
      [
        placement === 'viewport-rim' ? rimX : midX,
        placement === 'viewport-rim' ? rimY : midY,
        getText,
      ],
      attr,
    );
  } catch {
    return null;
  }
  hostEl._mathMeasureText = txt;
  txt._mathMeasureHost = hostEl;
  txt._mathMeasurePlacement = placement;
  return txt;
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
 *   labelKind?: 'point' | 'path',
 * }} opts
 */
export function applyBoardLabel(el, opts) {
  if (!el) return;
  const getText = typeof opts.text === 'function' ? opts.text : () => String(opts.text ?? '');
  if (opts.baseName != null) el._mathBaseName = opts.baseName;
  const kind = resolveLabelKind(el, opts);
  /** @type {Record<string, unknown>} */
  const label = boardLabelAttrs(
    {
      fontSize: opts.fontSize ?? BOARD_LABEL_FONT_SIZE,
    },
    kind,
  );
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
  // 重绑前清掉旧依赖，避免「显示坐标」关掉后仍被旧 tick 写回坐标
  if (typeof el._mathDepWatchCleanup === 'function') {
    try {
      el._mathDepWatchCleanup();
    } catch {
      /* */
    }
    el._mathDepWatchCleanup = null;
  }
  setLabelContent(el, getText);
  const tick = () => setLabelContent(el, getText);
  el._mathLiveLabelTick = tick;
  el._mathLiveLabelBound = true;
  // 路径量测保持中段定位；点标签固定偏移，不做持续 autoPosition
  try {
    if (el.elType === 'text') {
      // 中点量测 text：不走 autoPosition
    } else if (
      (el._mathConstrKind === 'line' ||
        el._mathConstrKind === 'segment' ||
        el._mathConstrKind === 'tangent' ||
        el._mathConstrKind === 'perp') &&
      el.elType !== 'point' &&
      el.elType !== 'glider' &&
      el.elType !== 'perpendicularpoint'
    ) {
      el.label?.setAttribute?.(boardLabelAttrs({}, 'path'));
    } else {
      el.label?.setAttribute?.({
        autoPosition: false,
        parse: false,
        offset: [14, 14],
      });
    }
  } catch {
    /* */
  }

  /** @type {any[]} */
  const watched = [];
  // 端点拖动时主动 bump 一下子对象标签（部分环境下函数刷新略滞后）
  for (const p of watchEls || []) {
    if (!p || p === el || typeof p.on !== 'function') continue;
    if (!p._mathDepLabelTicks) p._mathDepLabelTicks = new Set();
    p._mathDepLabelTicks.add(tick);
    watched.push(p);
    ensurePointGeomHook(p);
  }
  el._mathDepWatchCleanup = () => {
    for (const p of watched) {
      try {
        p._mathDepLabelTicks?.delete(tick);
      } catch {
        /* */
      }
    }
  };
  ensurePointGeomHook(el);
}

/**
 * 点拖动钩子：吸附 + 刷新依赖量测标签
 * @param {any} el
 */
export function ensurePointGeomHook(el) {
  if (!el || el._mathGeomHookBound || typeof el.on !== 'function') return;
  el._mathGeomHookBound = true;
  const hideLabel = () => {
    try {
      el._mathLabelHiddenForDrag = true;
      el.label?.setAttribute?.({ visible: false });
    } catch {
      /* */
    }
  };
  const showLabel = () => {
    try {
      el._mathLabelHiddenForDrag = false;
      if (el._mathIntersectOnBody === false) return;
      if (el._mathLabelFusionSuppressed) return;
      el.label?.setAttribute?.({ visible: true });
    } catch {
      /* */
    }
  };
  const runDrag = () => {
    hideLabel();
    try {
      el._mathSnapTick?.();
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
    const intersectDeps = el._mathDepIntersectTicks;
    if (intersectDeps) {
      for (const tick of intersectDeps) {
        try {
          tick();
        } catch {
          /* */
        }
      }
    }
  };
  const runUp = () => {
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
    const intersectDeps = el._mathDepIntersectTicks;
    if (intersectDeps) {
      for (const tick of intersectDeps) {
        try {
          tick();
        } catch {
          /* */
        }
      }
    }
    // 松手后补一次 board.update，确保最后一帧坐标落地（全端点共享一次）
    try {
      el.board?.update?.();
    } catch {
      /* */
    }
    showLabel();
    try {
      el.board?._mathSchedulePointLabelFusion?.();
    } catch {
      /* */
    }
    try {
      el.label?.updateText?.();
    } catch {
      /* */
    }
  };
  el.on('down', hideLabel);
  el.on('drag', runDrag);
  el.on('up', runUp);
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
