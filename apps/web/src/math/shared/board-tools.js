/**
 * 画板作图工具：迷你工具条 + 点击会话
 * 各 lab 传入自己的工具定义；这里不承载任何学科业务工具。
 */

import { createButton } from '@xiaohuang/ui';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   hint?: string,
 * }} BoardToolDef
 */

const DEFAULT_BOARD_TOOLS = /** @type {BoardToolDef[]} */ ([
  { id: 'select', label: '选择' },
]);

/**
 * @param {string} id
 * @param {BoardToolDef[]} [tools]
 */
export function getBoardToolDef(id, tools = DEFAULT_BOARD_TOOLS) {
  return tools.find((t) => t.id === id) || tools[0] || null;
}

/**
 * 在画板右下挂竖排迷你工具条（FAB 槽上方、贴右缘）
 * @param {{
 *   host: HTMLElement | null | undefined,
 *   tools?: BoardToolDef[],
 *   initialTool?: string,
 *   onChange?: (toolId: string, setOpts?: { toggle?: boolean, oneShot?: boolean }) => void,
 * }} opts
 * @returns {{
 *   el: HTMLElement | null,
 *   dispose: () => void,
 *   getTool: () => string,
 *   setTool: (id: string, setOpts?: { toggle?: boolean, oneShot?: boolean }) => void,
 *   setHint: (text: string) => void,
 *   isCollapsed: () => boolean,
 *   setCollapsed: (collapsed: boolean) => void,
 * }}
 */
export function attachBoardToolStrip(opts) {
  const host = opts.host;
  const tools = opts.tools?.length ? opts.tools : DEFAULT_BOARD_TOOLS;
  if (!host) {
    return {
      el: null,
      dispose() {},
      getTool: () => 'select',
      setTool() {},
      setHint() {},
      isCollapsed: () => false,
      setCollapsed() {},
    };
  }

  let active = opts.initialTool || 'select';
  if (!tools.some((t) => t.id === active)) active = tools[0]?.id || 'select';

  try {
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
  } catch {
    /* */
  }

  const panelId = `math-board-tool-panel-${Math.random().toString(36).slice(2, 9)}`;
  // P5.1：可点击控件一律走 @xiaohuang/ui createButton（自带 ui-btn 基类 + className 桥接旧类），
  // 不再用大段 HTML 字符串生成按钮；隐藏其它工具仍靠 CSS（.is-collapsed .btn:not(.is-on)）。
  const wrap = document.createElement('div');
  wrap.className = 'math-board-tool-strip';
  wrap.setAttribute('role', 'toolbar');
  wrap.setAttribute('aria-label', '画板作图工具');

  const panel = document.createElement('div');
  panel.className = 'math-board-tool-strip-panel';
  panel.id = panelId;
  panel.setAttribute('data-role', 'panel');

  const btns = document.createElement('div');
  btns.className = 'math-board-tool-strip-btns';

  // 收起/展开按钮（bridge：ui-btn + math-board-tool-collapse；箭头 span 结构保留）
  const collapseCtrl = createButton({
    className: 'math-board-tool-collapse',
    title: '收起工具',
    'aria-label': '收起工具',
  });
  const collapseBtn = collapseCtrl.element;
  collapseBtn.setAttribute('data-role', 'collapse');
  collapseBtn.setAttribute('aria-expanded', 'true');
  collapseBtn.setAttribute('aria-controls', panelId);
  const collapseArrow = document.createElement('span');
  collapseArrow.className = 'math-board-tool-collapse-arrow';
  collapseArrow.setAttribute('aria-hidden', 'true');
  collapseArrow.textContent = '▲';
  collapseBtn.replaceChildren(collapseArrow);
  btns.appendChild(collapseBtn);

  // 工具按钮（bridge：ui-btn + math-board-tool-btn；label span 结构保留）
  const toolCtrls = tools.map((t) => {
    const ctrl = createButton({
      className: 'math-board-tool-btn',
      title: t.label,
      'aria-label': t.label,
    });
    const btn = ctrl.element;
    btn.setAttribute('data-tool', t.id);
    const label = document.createElement('span');
    label.className = 'math-board-tool-label';
    label.textContent = t.label;
    btn.replaceChildren(label);
    btns.appendChild(btn);
    return ctrl;
  });

  panel.appendChild(btns);

  const hintEl = document.createElement('p');
  hintEl.className = 'math-board-tool-hint';
  hintEl.setAttribute('data-role', 'hint');
  hintEl.hidden = true;
  panel.appendChild(hintEl);
  wrap.appendChild(panel);

  // 固定在画板右下（CSS 竖排叠在 FAB 上方）
  host.appendChild(wrap);
  /** @type {string} */
  let stickyHint = '';
  let collapsed = false;

  function paintHint() {
    if (!hintEl) return;
    if (collapsed) {
      hintEl.hidden = true;
      return;
    }
    if (stickyHint) {
      hintEl.hidden = false;
      hintEl.textContent = stickyHint;
      return;
    }
    const def = getBoardToolDef(active, tools);
    if (def?.hint && active !== 'select') {
      hintEl.hidden = false;
      hintEl.textContent = def.hint;
      return;
    }
    hintEl.hidden = true;
    hintEl.textContent = '';
  }

  function syncButtons() {
    wrap.querySelectorAll('.math-board-tool-btn').forEach((btn) => {
      const id = btn.getAttribute('data-tool') || '';
      const on = id === active;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    paintHint();
  }

  function syncCollapse() {
    wrap.dataset.collapsed = collapsed ? 'true' : 'false';
    wrap.classList.toggle('is-collapsed', collapsed);
    if (collapseBtn) {
      collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      collapseBtn.title = collapsed ? '展开工具' : '收起工具';
      collapseBtn.setAttribute('aria-label', collapsed ? '展开工具' : '收起工具');
      const arrow = collapseBtn.querySelector('.math-board-tool-collapse-arrow');
      // 展开态：▲ 向上收起；收起态：▼ 向下展开
      if (arrow) arrow.textContent = collapsed ? '▼' : '▲';
    }
    syncButtons();
  }

  /**
   * @param {string} id
   * @param {{ toggle?: boolean, oneShot?: boolean }} [setOpts]
   */
  function setTool(id, setOpts = {}) {
    if (!tools.some((t) => t.id === id)) return;
    const allowToggle = setOpts.toggle !== false;
    if (allowToggle && active === id && id !== 'select') {
      active = 'select';
    } else {
      active = id;
    }
    stickyHint = '';
    syncButtons();
    opts.onChange?.(active, setOpts);
  }

  /**
   * @param {string} text
   */
  function setHint(text) {
    const t = String(text || '').trim();
    stickyHint = t;
    paintHint();
  }

  wrap.addEventListener('click', (ev) => {
    const raw = /** @type {EventTarget | null} */ (ev.target);
    const target = raw instanceof Element ? raw : raw?.parentElement;
    if (!target || !wrap.contains(target)) return;

    const collapse = target.closest('[data-role="collapse"]');
    if (collapse && wrap.contains(collapse)) {
      ev.preventDefault();
      ev.stopPropagation();
      collapsed = !collapsed;
      syncCollapse();
      return;
    }

    const btn = target.closest('[data-tool]');
    if (!btn || !wrap.contains(btn)) return;
    ev.preventDefault();
    ev.stopPropagation();

    // 收起态点当前工具：只展开列表，方便切换（不改工具）
    if (collapsed) {
      collapsed = false;
      syncCollapse();
      return;
    }
    setTool(btn.getAttribute('data-tool') || 'select');
  });

  syncCollapse();

  return {
    el: wrap,
    dispose() {
      // 逆序、容错、幂等：先释放组件控制器，再摘除容器（B5 样板）
      const errors = [];
      for (let i = toolCtrls.length - 1; i >= 0; i -= 1) {
        try {
          toolCtrls[i].dispose();
        } catch (err) {
          errors.push(err);
        }
      }
      try {
        collapseCtrl.dispose();
      } catch (err) {
        errors.push(err);
      }
      try {
        wrap.remove();
      } catch (err) {
        errors.push(err);
      }
      if (errors.length) console.error('[board-tools] dispose errors:', errors);
    },
    getTool: () => active,
    setTool,
    setHint,
    isCollapsed: () => collapsed,
    setCollapsed(next) {
      collapsed = Boolean(next);
      syncCollapse();
    },
  };
}

/**
 * 屏幕坐标 → 用户坐标（与罗盘同源）
 * @param {any} board
 * @param {PointerEvent | MouseEvent} ev
 */
export function usrCoordsFromPointer(board, ev) {
  const host = board?.containerObj;
  try {
    if (typeof board.getUsrCoordsOfMouse === 'function') {
      const c = board.getUsrCoordsOfMouse(ev);
      if (Array.isArray(c) && c.length >= 2) {
        if (c.length >= 3 && Math.abs(c[0] - 1) < 1e-9) return { x: c[1], y: c[2] };
        return { x: c[0], y: c[1] };
      }
    }
  } catch {
    /* */
  }
  try {
    if (!host) return { x: 0, y: 0 };
    const rect = host.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    if (board.origin?.scrCoords && board.unitX && board.unitY) {
      const ox = board.origin.scrCoords[1];
      const oy = board.origin.scrCoords[2];
      return {
        x: (sx - ox) / board.unitX,
        y: (oy - sy) / board.unitY,
      };
    }
  } catch {
    /* */
  }
  return { x: 0, y: 0 };
}

/**
 * 收集 hasPoint 命中的全部对象（后画优先）
 * @param {any} board
 * @param {PointerEvent | MouseEvent} ev
 * @returns {any[]}
 */
export function collectBoardHits(board, ev) {
  if (!board || typeof board.getMousePosition !== 'function') return [];
  let pos;
  try {
    pos = board.getMousePosition(ev);
  } catch {
    return [];
  }
  if (!pos || pos.length < 2) return [];
  const x = pos[0];
  const y = pos[1];
  /** @type {any[]} */
  const hits = [];
  const list = board.objectsList || [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const el = list[i];
    if (!el || el._is_removed) continue;
    // 跳过轴/网格等系统物
    if (el.elType === 'axis' || el.elType === 'grid' || el.elType === 'text') continue;
    try {
      if (typeof el.hasPoint === 'function' && el.hasPoint(x, y)) hits.push(el);
    } catch {
      /* */
    }
  }
  return hits;
}

/**
 * 命中板面对象（后画优先）
 * @param {any} board
 * @param {PointerEvent | MouseEvent} ev
 * @param {(el: any) => boolean} [filter]
 */
export function hitBoardElement(board, ev, filter) {
  const hits = collectBoardHits(board, ev);
  if (filter) {
    return hits.find((el) => filter(el)) || null;
  }
  return hits[0] || null;
}

/**
 * 按优先级取命中：用户点 > 作图点/线 > 曲线
 * @param {any} board
 * @param {PointerEvent | MouseEvent} ev
 */
export function hitBoardPrefer(board, ev) {
  const hits = collectBoardHits(board, ev);
  const userPt = hits.find((el) => el._mathUserPoint);
  if (userPt) return userPt;
  const constrPt = hits.find(
    (el) => el._mathConstr && (el.elType === 'point' || el.elementClass === 1),
  );
  if (constrPt) return constrPt;
  const constrLine = hits.find((el) => el._mathConstrId || el._mathConstr);
  if (constrLine) return constrLine;
  const curve = hits.find(
    (el) => el.elType === 'curve' || el.elType === 'functiongraph',
  );
  if (curve) return curve;
  return hits[0] || null;
}

/**
 * 轻量点击会话：区分 tap 与拖动画板
 * @param {any} board
 * @param {{
 *   shouldHandle?: () => boolean,
 *   shouldIgnoreTarget?: (target: EventTarget | null) => boolean,
 *   onTap: (ctx: {
 *     usrX: number,
 *     usrY: number,
 *     clientX: number,
 *     clientY: number,
 *     hit: any,
 *     event: PointerEvent | MouseEvent,
 *   }) => void | Promise<void>,
 *   moveTol?: number,
 * }} opts
 */
export function attachToolPointer(board, opts) {
  const host = board?.containerObj;
  if (!host || typeof host.addEventListener !== 'function') {
    return { dispose() {} };
  }

  const moveTol = opts.moveTol ?? 22;
  /** @type {number | null} */
  let ptrId = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let active = false;

  /**
   * @param {EventTarget | null} target
   */
  function ignored(target) {
    if (opts.shouldIgnoreTarget?.(target)) return true;
    const t = /** @type {Element | null} */ (target);
    if (t?.closest?.('.JXG_navigation')) return true;
    if (t?.closest?.('.math-board-tool-strip')) return true;
    if (t?.closest?.('.math-board-notes-chrome')) return true;
    if (t?.closest?.('.math-axis-settings-btn')) return true;
    return false;
  }

  /**
   * @param {PointerEvent | MouseEvent} ev
   */
  function fireTap(ev) {
    if (opts.shouldHandle && !opts.shouldHandle()) return;
    const usr = usrCoordsFromPointer(board, ev);
    const hit = hitBoardPrefer(board, ev);
    void opts.onTap({
      usrX: usr.x,
      usrY: usr.y,
      clientX: ev.clientX,
      clientY: ev.clientY,
      hit,
      event: ev,
    });
  }

  /**
   * @param {PointerEvent} ev
   */
  const onDown = (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    if (opts.shouldHandle && !opts.shouldHandle()) return;
    if (ignored(ev.target)) return;

    active = true;
    dragging = false;
    ptrId = ev.pointerId;
    startX = ev.clientX;
    startY = ev.clientY;
  };

  /**
   * @param {PointerEvent} ev
   */
  const onMove = (ev) => {
    if (!active || (ptrId != null && ev.pointerId !== ptrId)) return;
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > moveTol) {
      dragging = true;
    }
  };

  /**
   * @param {PointerEvent} ev
   */
  const onUp = (ev) => {
    if (!active) return;
    if (ptrId != null && ev.pointerId !== ptrId) return;
    const wasDrag = dragging;
    active = false;
    ptrId = null;
    dragging = false;
    if (wasDrag) return;
    if (ignored(ev.target)) return;
    fireTap(ev);
  };

  // 勿绑 pointerleave：移出子节点时容易误取消点击
  host.addEventListener('pointerdown', onDown, true);
  host.addEventListener('pointermove', onMove, true);
  host.addEventListener('pointerup', onUp, true);
  host.addEventListener('pointercancel', onUp, true);

  return {
    dispose() {
      host.removeEventListener('pointerdown', onDown, true);
      host.removeEventListener('pointermove', onMove, true);
      host.removeEventListener('pointerup', onUp, true);
      host.removeEventListener('pointercancel', onUp, true);
    },
  };
}
