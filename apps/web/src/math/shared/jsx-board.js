/**
 * JSXGraph 板面工厂：创建 / 销毁 / 主题 restyle
 *
 * 主题色一律走 math-theme 契约；业务 lab 不要复制 restyle 逻辑。
 */

import JXG from 'jsxgraph';
import 'jsxgraph/distrib/jsxgraph.css';
import { getMathBoardChrome, getMathGridColor } from './math-theme.js';

/**
 * 右下角导航按钮顺序（相对 JSXGraph 默认 – o + ← ↓ ↑ →）
 * 目标：复原、缩小、放大、向左、向右、向上、向下
 * @type {string[]}
 */
const MATH_NAV_ORDER = ['100', 'out', 'in', 'left', 'right', 'up', 'down'];

/** @type {Record<string, string>} */
const MATH_NAV_TITLES = {
  100: '复原',
  out: '缩小',
  in: '放大',
  left: '向左',
  right: '向右',
  up: '向上',
  down: '向下',
};

/**
 * 将 JSXGraph 导航条重排为课室约定顺序，并补中文 title。
 * @param {import('jsxgraph').Board | { containerObj?: HTMLElement | null }} board
 */
export function polishMathNavigation(board) {
  const bar = board?.containerObj?.querySelector?.('.JXG_navigation');
  if (!bar) return;

  /** @type {Map<string, Element>} */
  const byType = new Map();
  bar.querySelectorAll('.JXG_navigation_button').forEach((el) => {
    const id = el.getAttribute('id') || '';
    const m = id.match(/_navigation_([a-z0-9]+)$/i);
    if (m) byType.set(m[1], el);
  });

  for (const type of MATH_NAV_ORDER) {
    const el = byType.get(type);
    if (!el) continue;
    el.setAttribute('title', MATH_NAV_TITLES[type] || type);
    el.setAttribute('aria-label', MATH_NAV_TITLES[type] || type);
    bar.appendChild(el);
  }
}

/**
 * 把网格色写到 board.options + 已存在的 grid 曲线上
 * 新版 JSXGraph 网格是 curve，靠 strokeColor / strokeOpacity
 * @param {any} board
 * @param {string} [color]
 */
export function applyMathGridColor(board, color) {
  if (!board) return;
  const gridStroke = color || getMathGridColor();
  const opacity = 0.55;
  try {
    if (board.options?.grid) {
      board.options.grid.gridColor = gridStroke;
      board.options.grid.strokeColor = gridStroke;
      board.options.grid.strokeOpacity = opacity;
      board.options.grid.strokeWidth = 1;
      if (board.options.grid.major && typeof board.options.grid.major === 'object') {
        board.options.grid.major.strokeColor = gridStroke;
        board.options.grid.major.strokeOpacity = opacity;
      }
      if (board.options.grid.minor && typeof board.options.grid.minor === 'object') {
        board.options.grid.minor.strokeColor = gridStroke;
        board.options.grid.minor.strokeOpacity = Math.min(0.4, opacity);
      }
    }
  } catch {
    /* */
  }

  /** @type {any[]} */
  let grids = [];
  try {
    grids = Array.isArray(board.grids) ? board.grids.filter(Boolean) : [];
  } catch {
    grids = [];
  }
  if (!grids.length) {
    try {
      for (const obj of board.objectsList || []) {
        if (obj?.elType === 'grid' || obj?.type === 24) grids.push(obj);
      }
    } catch {
      /* */
    }
  }
  for (const g of grids) {
    try {
      g.setAttribute?.({
        strokeColor: gridStroke,
        highlightStrokeColor: gridStroke,
        strokeOpacity: opacity,
        strokeWidth: 1,
      });
      if (g.minorGrid) {
        g.minorGrid.setAttribute?.({
          strokeColor: gridStroke,
          strokeOpacity: Math.min(0.35, opacity),
        });
      }
      if (g.majorGrid) {
        g.majorGrid.setAttribute?.({
          strokeColor: gridStroke,
          strokeOpacity: opacity,
        });
      }
    } catch {
      /* */
    }
  }
}

/**
 * 按当前 CSS 主题刷新画板底色 / 轴 / 网格 / 默认点线色
 * @param {any} board
 */
export function restyleMathBoard(board) {
  if (!board?.containerObj) return;
  const { stamp, diagram, boardBg, ink, pointRing, grid } = getMathBoardChrome();

  try {
    board.containerObj.style.background = boardBg;
    board.containerObj.style.borderRadius = '12px';
    board.containerObj.style.color = ink;
  } catch {
    /* */
  }
  try {
    if (board.defaultAxes?.x) {
      board.defaultAxes.x.setAttribute({
        strokeColor: ink,
        highlightStrokeColor: stamp,
      });
    }
    if (board.defaultAxes?.y) {
      board.defaultAxes.y.setAttribute({
        strokeColor: ink,
        highlightStrokeColor: stamp,
      });
    }
  } catch {
    /* */
  }
  try {
    board.options.point.fillColor = stamp;
    board.options.point.strokeColor = pointRing;
    board.options.line.strokeColor = stamp;
    board.options.circle.strokeColor = diagram;
    board.options.text.strokeColor = ink;
    board.options.text.cssDefaultStyle = `font-family: inherit; color: ${ink};`;
    board.options.text.cssClass = 'math-jxg-text';
  } catch {
    /* */
  }
  applyMathGridColor(board, grid);
  try {
    board.update?.();
  } catch {
    /* */
  }
}

/**
 * @param {HTMLElement | string} box
 * @param {object} [opts]
 */
export function createMathBoard(box, opts = {}) {
  const id = typeof box === 'string' ? box : box.id;
  if (!id) throw new Error('math board needs an element id');

  const board = JXG.JSXGraph.initBoard(id, {
    boundingbox: opts.boundingbox || [-8, 8, 8, -8],
    axis: opts.axis !== false,
    grid: opts.grid !== false,
    showCopyright: false,
    showNavigation: opts.showNavigation !== false,
    keepaspectratio: opts.keepaspectratio !== false,
    pan: { enabled: true, needShift: false },
    zoom: { factorX: 1.2, factorY: 1.2, wheel: true, needShift: false },
    browserPan: false,
    resize: { enabled: true, throttle: 80 },
    ...opts.boardOptions,
  });

  restyleMathBoard(board);
  polishMathNavigation(board);

  // 右下角坐标轴/图例设置（可由 opts 关闭）
  if (opts.axisSettings !== false) {
    try {
      queueMicrotask(() => {
        import('./axis-legend-settings.js')
          .then(({ attachAxisLegendSettings }) => {
            if (!board?.containerObj) return;
            const host =
              (typeof opts.axisSettingsHost === 'string'
                ? document.getElementById(opts.axisSettingsHost)
                : opts.axisSettingsHost) ||
              board.containerObj.parentElement ||
              board.containerObj;
            board._mathAxisLegend = attachAxisLegendSettings(board, {
              host,
              initial: opts.axisSettingsInitial || undefined,
              getLegendItems: opts.getLegendItems,
              onChange: opts.onAxisSettingsChange,
              hasFuncDomain: opts.hasFuncDomain !== false,
            });
          })
          .catch(() => {
            /* optional */
          });
      });
    } catch {
      /* */
    }
  }

  return board;
}

/**
 * @param {any} board
 */
export function freeMathBoard(board) {
  if (!board) return;
  try {
    board._mathAxisLegend?.dispose?.();
    board._mathAxisLegend = null;
  } catch {
    /* */
  }
  try {
    JXG.JSXGraph.freeBoard(board);
  } catch {
    /* already freed */
  }
}

/**
 * @param {any} board
 * @param {HTMLElement} host
 */
export function resizeMathBoard(board, host) {
  if (!board || !host) return;
  const w = Math.max(120, Math.floor(host.clientWidth));
  const h = Math.max(120, Math.floor(host.clientHeight));
  board.resizeContainer(w, h, false, true);
}

export { JXG };
