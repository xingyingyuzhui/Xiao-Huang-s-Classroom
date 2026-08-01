/**
 * JSXGraph 画板：双击对象 → 打开样式气泡
 *
 * 用容器 dblclick + hasPoint 命中检测（比元素 up 双击可靠）。
 * 关闭只走：收起按钮 / 点气泡外（打开后有宽限期）/ 代码 clear。
 */

import { setSelectionChrome } from './object-style.js';

/**
 * @typedef {{
 *   select: (el: any, meta?: { label?: string, clientX?: number, clientY?: number }) => void,
 *   clear: () => void,
 *   getSelected: () => any,
 *   register: (el: any, meta?: { label?: string }) => any,
 *   registerMany: (els: any[], metaFor?: (el: any, i: number) => { label?: string } | void) => void,
 *   attachBoard: (board: any) => void,
 *   dispose: () => void,
 * }} BoardSelectionController
 */

/**
 * @param {any} evt
 * @returns {{ x: number, y: number }}
 */
export function clientPosFromEvt(evt) {
  const t = evt?.changedTouches?.[0] || evt?.touches?.[0];
  if (t && typeof t.clientX === 'number') return { x: t.clientX, y: t.clientY };
  if (evt && typeof evt.clientX === 'number') return { x: evt.clientX, y: evt.clientY };
  const inner = evt?.event || evt?.originalEvent || evt?.srcEvent;
  if (inner && typeof inner.clientX === 'number') return { x: inner.clientX, y: inner.clientY };
  if (inner?.changedTouches?.[0]) {
    return { x: inner.changedTouches[0].clientX, y: inner.changedTouches[0].clientY };
  }
  return { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
}

/**
 * @param {{
 *   onSelect?: (
 *     el: any | null,
 *     meta: { label?: string, clientX?: number, clientY?: number } | null,
 *   ) => void,
 * }} [opts]
 * @returns {BoardSelectionController}
 */
export function createBoardSelectionController(opts = {}) {
  /** @type {any} */
  let selected = null;
  /** @type {{ label?: string, clientX?: number, clientY?: number } | null} */
  let selectedMeta = null;
  /** @type {Array<() => void>} */
  const cleanups = [];

  /** @type {Array<{ el: any, label?: string, board: any }>} */
  let registry = [];

  /** 打开后忽略 outside 关闭的截止时间戳 */
  let ignoreOutsideUntil = 0;
  /** 递增，避免过期 timeout 关错 */
  let openGen = 0;

  function notify() {
    opts.onSelect?.(selected, selectedMeta);
  }

  function clear() {
    if (selected) setSelectionChrome(selected, false);
    selected = null;
    selectedMeta = null;
    openGen += 1;
    ignoreOutsideUntil = 0;
    notify();
  }

  /**
   * @param {any} el
   * @param {{ label?: string, clientX?: number, clientY?: number }} [meta]
   */
  function select(el, meta = {}) {
    if (!el) {
      clear();
      return;
    }
    if (selected && selected !== el) setSelectionChrome(selected, false);
    selected = el;
    selectedMeta = meta || {};
    setSelectionChrome(el, true);
    openGen += 1;
    // 打开后 450ms 内不响应 outside / 误触关闭
    ignoreOutsideUntil = Date.now() + 450;
    notify();
  }

  /**
   * @param {any} el
   * @param {{ label?: string }} [meta]
   */
  function register(el, meta = {}) {
    if (!el) return el;
    const label = meta.label || (el.name ? String(el.name) : undefined);
    el._mathSelectLabel = label;
    registry = registry.filter((r) => r.el !== el);
    registry.push({ el, label, board: el.board || null });
    return el;
  }

  /**
   * @param {any[]} els
   * @param {(el: any, i: number) => { label?: string } | void} [metaFor]
   */
  function registerMany(els, metaFor) {
    const list = (els || []).filter(Boolean);
    const boards = new Set(list.map((e) => e.board).filter(Boolean));
    if (boards.size) {
      registry = registry.filter((r) => !boards.has(r.board));
    }
    list.forEach((el, i) => {
      const m = metaFor?.(el, i);
      register(el, m || undefined);
    });
  }

  /**
   * @param {any} board
   * @param {MouseEvent | PointerEvent} ev
   */
  function hitTest(board, ev) {
    if (!board || typeof board.getMousePosition !== 'function') return null;
    let pos;
    try {
      pos = board.getMousePosition(ev);
    } catch {
      return null;
    }
    if (!pos || pos.length < 2) return null;
    const x = pos[0];
    const y = pos[1];

    /** @param {any} el */
    const isPointEl = (el) => {
      const t = el?.elType;
      return (
        t === 'point' ||
        t === 'glider' ||
        t === 'perpendicularpoint' ||
        el?.elementClass === 1
      );
    };

    /** @type {typeof registry} */
    const hits = [];
    // 从后往前：后画的在上层
    for (let i = registry.length - 1; i >= 0; i -= 1) {
      const item = registry[i];
      if (item.board && item.board !== board) continue;
      const el = item.el;
      if (!el || el._is_removed) continue;
      if (el._mathExtendRay) continue; // 延长虚线不抢双击
      if (el._mathIntersectOnBody === false) continue; // 延长线外交点已隐藏
      try {
        if (el.visProp && el.visProp.visible === false) continue;
      } catch {
        /* */
      }
      try {
        if (typeof el.hasPoint === 'function' && el.hasPoint(x, y)) {
          hits.push(item);
        }
      } catch {
        /* dead object */
      }
    }

    // 点优先于线/曲线，避免线段端点双击只出线样式
    const pointHit = hits.find((h) => isPointEl(h.el));
    if (pointHit) return pointHit;

    // 线命中但点 hasPoint 略严：屏幕距离内的登记点仍开点样式
    /** @type {(typeof registry)[number] | null} */
    let nearPoint = null;
    let nearD = Infinity;
    const NEAR_PX = 16;
    for (let i = registry.length - 1; i >= 0; i -= 1) {
      const item = registry[i];
      if (item.board && item.board !== board) continue;
      const el = item.el;
      if (!el || el._is_removed || !isPointEl(el)) continue;
      try {
        const scr = el.coords?.scrCoords;
        if (!scr || scr.length < 3) continue;
        const d = Math.hypot(Number(scr[1]) - x, Number(scr[2]) - y);
        if (d <= NEAR_PX && d < nearD) {
          nearD = d;
          nearPoint = item;
        }
      } catch {
        /* */
      }
    }
    if (nearPoint) return nearPoint;
    return hits[0] || null;
  }

  /**
   * @param {any} board
   */
  function attachBoard(board) {
    if (!board || board._mathSelectBoardBound) return;
    board._mathSelectBoardBound = true;
    const host = board.containerObj;
    if (!host || typeof host.addEventListener !== 'function') return;

    const onDblClick = (ev) => {
      // 避免浏览器选中文字 / 默认行为
      ev.preventDefault();
      ev.stopPropagation();
      const hit = hitTest(board, ev);
      if (!hit) return;
      const client = clientPosFromEvt(ev);
      select(hit.el, {
        label: hit.label,
        clientX: client.x,
        clientY: client.y,
      });
    };

    host.addEventListener('dblclick', onDblClick);
    // 降低系统双击选中
    host.style.userSelect = host.style.userSelect || 'none';

    cleanups.push(() => {
      host.removeEventListener('dblclick', onDblClick);
      try {
        board._mathSelectBoardBound = false;
      } catch {
        /* */
      }
    });
  }

  function dispose() {
    clear();
    registry = [];
    for (const fn of cleanups) {
      try {
        fn();
      } catch {
        /* */
      }
    }
    cleanups.length = 0;
  }

  return {
    select,
    clear,
    getSelected: () => selected,
    register,
    registerMany,
    attachBoard,
    dispose,
    /** @internal 供气泡 outside 判断 */
    shouldIgnoreOutside() {
      return Date.now() < ignoreOutsideUntil;
    },
    getOpenGen() {
      return openGen;
    },
  };
}
