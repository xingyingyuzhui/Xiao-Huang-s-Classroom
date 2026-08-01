/**
 * 画板长按罗盘（控件环）
 * 当前用于函数图象「加点」；其它 lab 可复用同一套 API。
 */

const ROOT_ID = 'mathBoardCompass';
const HOLD_MS = 480;
const MOVE_TOL = 14;

/** @type {HTMLElement | null} */
let rootEl = null;
/** @type {((e: Event) => void) | null} */
let outsideHandler = null;

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   icon?: string,
 * }} CompassItem
 *
 * @typedef {{
 *   clientX: number,
 *   clientY: number,
 *   usrX: number,
 *   usrY: number,
 *   board: any,
 * }} CompassContext
 */

function ensureRoot() {
  if (rootEl && document.body.contains(rootEl)) return rootEl;
  rootEl = document.createElement('div');
  rootEl.id = ROOT_ID;
  rootEl.className = 'math-board-compass';
  rootEl.hidden = true;
  rootEl.setAttribute('role', 'menu');
  rootEl.setAttribute('aria-label', '画板工具罗盘');
  document.body.appendChild(rootEl);
  return rootEl;
}

function unbindOutside() {
  if (outsideHandler) {
    document.removeEventListener('pointerdown', outsideHandler, true);
    outsideHandler = null;
  }
}

/**
 * 关闭罗盘
 */
export function dismissBoardCompass() {
  unbindOutside();
  const el = document.getElementById(ROOT_ID);
  if (!el) return;
  el.classList.remove('is-open');
  el.hidden = true;
  el.innerHTML = '';
}

/**
 * @param {number} clientX
 * @param {number} clientY
 * @param {CompassItem[]} items
 * @param {(id: string) => void} onPick
 */
function openCompass(clientX, clientY, items, onPick) {
  dismissBoardCompass();
  const root = ensureRoot();
  root.hidden = false;
  root.innerHTML = `
    <div class="math-board-compass-ring" aria-hidden="true"></div>
    <div class="math-board-compass-items">
      ${items
        .map(
          (it, i) => `
        <button type="button" class="math-board-compass-item" data-compass-id="${it.id}" data-i="${i}" role="menuitem">
          <span class="math-board-compass-label">${it.label}</span>
        </button>`,
        )
        .join('')}
    </div>
  `;

  // 扇形排布
  const n = Math.max(items.length, 1);
  const start = -Math.PI / 2;
  const step = (Math.PI * 2) / Math.max(n, 3);
  const radius = 72;
  root.querySelectorAll('.math-board-compass-item').forEach((btn, i) => {
    const ang = start + i * step;
    const x = Math.cos(ang) * radius;
    const y = Math.sin(ang) * radius;
    /** @type {HTMLElement} */ (btn).style.setProperty('--cx', `${x.toFixed(1)}px`);
    /** @type {HTMLElement} */ (btn).style.setProperty('--cy', `${y.toFixed(1)}px`);
  });

  const size = 200;
  let left = clientX - size / 2;
  let top = clientY - size / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - size - 8));
  top = Math.max(8, Math.min(top, window.innerHeight - size - 8));
  root.style.left = `${Math.round(left)}px`;
  root.style.top = `${Math.round(top)}px`;
  root.style.width = `${size}px`;
  root.style.height = `${size}px`;

  requestAnimationFrame(() => root.classList.add('is-open'));

  root.onclick = (ev) => {
    const btn = /** @type {HTMLElement} */ (ev.target).closest?.('[data-compass-id]');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    const id = btn.getAttribute('data-compass-id') || '';
    dismissBoardCompass();
    if (id) onPick(id);
  };

  outsideHandler = (ev) => {
    const t = /** @type {Node} */ (ev.target);
    if (root.contains(t)) return;
    dismissBoardCompass();
  };
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', outsideHandler, true);
  });
}

/**
 * 在 JSXGraph 画板上挂长按罗盘
 * @param {any} board
 * @param {{
 *   items?: CompassItem[],
 *   holdMs?: number,
 *   onAction?: (id: string, ctx: CompassContext) => void | Promise<void>,
 *   shouldIgnoreTarget?: (target: EventTarget | null) => boolean,
 *   shouldSuppressHold?: (ev: PointerEvent, board: any) => boolean,
 *   shouldAllowHoldDespiteDrag?: (ev: PointerEvent, board: any) => boolean,
 * }} [opts]
 * @returns {{ dispose: () => void }}
 */
export function attachBoardCompass(board, opts = {}) {
  const host = board?.containerObj;
  if (!host || typeof host.addEventListener !== 'function') {
    return { dispose() {} };
  }
  if (host.dataset.mathCompassBound === '1') {
    return { dispose() {} };
  }
  host.dataset.mathCompassBound = '1';

  const items = opts.items?.length
    ? opts.items
    : [{ id: 'add-point', label: '加点' }];
  const holdMs = opts.holdMs ?? HOLD_MS;

  /** @type {ReturnType<typeof setTimeout> | 0} */
  let timer = 0;
  let startX = 0;
  let startY = 0;
  let active = false;
  /** @type {number | null} */
  let ptrId = null;
  /** @type {PointerEvent | null} */
  let downEvRef = null;

  function clearTimer() {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
    active = false;
    ptrId = null;
    downEvRef = null;
  }

  /**
   * JSXGraph 是否已抓住几何对象在拖（不含画布平移 MOVE_ORIGIN）
   */
  function boardIsDraggingObject() {
    try {
      if (board?.mouse?.obj) return true;
      // BOARD_MODE_DRAG = 0x0001；MOVE_ORIGIN = 0x0002（平移，不应抑制罗盘）
      const mode = board?.mode;
      if (mode === board?.BOARD_MODE_DRAG) return true;
      if (mode === 1) return true;
    } catch {
      /* */
    }
    return false;
  }

  /** 松开 JSXGraph 对点的抓取，避免罗盘弹出后还在拖点 */
  function releaseBoardObjectDrag() {
    try {
      if (board.mouse) board.mouse.obj = null;
      if (board.mode === board.BOARD_MODE_DRAG || board.mode === 1) {
        board.mode = board.BOARD_MODE_NONE ?? 0;
      }
      board.dehighlightAll?.();
    } catch {
      /* */
    }
  }

  function allowHoldDespiteDrag(ev) {
    try {
      return Boolean(ev && opts.shouldAllowHoldDespiteDrag?.(ev, board));
    } catch {
      return false;
    }
  }

  /**
   * @param {PointerEvent} ev
   */
  function usrFromEvent(ev) {
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
      const rect = host.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      if (board.origin?.scrCoords && board.unitX && board.unitY) {
        const ox = board.origin.scrCoords[1];
        const oy = board.origin.scrCoords[2];
        const x = (sx - ox) / board.unitX;
        const y = (oy - sy) / board.unitY;
        return { x, y };
      }
    } catch {
      /* */
    }
    return { x: 0, y: 0 };
  }

  /**
   * @param {PointerEvent} ev
   */
  const onDown = (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    if (opts.shouldIgnoreTarget?.(ev.target)) return;
    const t = /** @type {Element | null} */ (ev.target);
    if (t?.closest?.('.JXG_navigation')) return;
    try {
      if (opts.shouldSuppressHold?.(ev, board)) return;
    } catch {
      /* */
    }

    clearTimer();
    active = true;
    ptrId = ev.pointerId;
    startX = ev.clientX;
    startY = ev.clientY;
    downEvRef = ev;

    timer = window.setTimeout(() => {
      timer = 0;
      if (!active || !downEvRef) return;
      const allowPoint = allowHoldDespiteDrag(downEvRef);
      if (boardIsDraggingObject() && !allowPoint) {
        clearTimer();
        return;
      }
      if (allowPoint) releaseBoardObjectDrag();
      const usr = usrFromEvent(downEvRef);
      const ctx = {
        clientX: startX,
        clientY: startY,
        usrX: usr.x,
        usrY: usr.y,
        board,
      };
      openCompass(startX, startY, items, (id) => {
        void opts.onAction?.(id, ctx);
      });
      try {
        host.setPointerCapture?.(ptrId);
      } catch {
        /* */
      }
    }, holdMs);
  };

  /**
   * @param {PointerEvent} ev
   */
  const onMove = (ev) => {
    if (!active || (ptrId != null && ev.pointerId !== ptrId)) return;
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > MOVE_TOL) {
      clearTimer();
      return;
    }
    if (boardIsDraggingObject() && !allowHoldDespiteDrag(downEvRef)) clearTimer();
  };

  const onUp = (ev) => {
    if (ptrId != null && ev.pointerId !== ptrId) return;
    clearTimer();
  };

  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onUp);
  host.addEventListener('pointerleave', onUp);

  return {
    dispose() {
      clearTimer();
      dismissBoardCompass();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('pointerleave', onUp);
      delete host.dataset.mathCompassBound;
    },
  };
}
