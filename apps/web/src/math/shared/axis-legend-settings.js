/**
 * 画布右下角：画布设置（坐标轴 / 网格 / 视窗 / 函数域 / 吸附）
 * 按钮 + 气泡
 */

import { hideNumKeypad, isNumKeypadOpen, mountMathNumKeypads } from './num-keypad.js';
import { ensureMathBoardFabDock, pruneMathBoardFabDock } from './board-fab-dock.js';
import { getMathGridColor } from './math-theme.js';

const BTN_CLASS = 'math-axis-settings-btn';
const BUBBLE_ID = 'mathAxisLegendBubble';
const BUBBLE_LAYOUT = 'v7-viewport-vs-domain';

/**
 * @typedef {{
 *   showAxisX: boolean,
 *   showAxisY: boolean,
 *   showGrid: boolean,
 *   showTicks: boolean,
 *   showLegend: boolean,
 *   snapToInteger: boolean,
 *   axisStrokeWidth: number,
 *   tickStepX: number,
 *   tickStepY: number,
 *   xMin: number,
 *   xMax: number,
 *   yMin: number,
 *   yMax: number,
 *   fXMin: number,
 *   fXMax: number,
 * }} AxisLegendState
 *
 * @typedef {{ id: string, label: string, color: string }} LegendItem
 */

/** @type {AxisLegendState} */
export const DEFAULT_AXIS_LEGEND_STATE = {
  showAxisX: true,
  showAxisY: true,
  showGrid: true,
  showTicks: true,
  showLegend: false,
  snapToInteger: true,
  axisStrokeWidth: 1.5,
  /** 主刻度间距，如 2 → 轴上显示 …, -2, 0, 2, 4, 6, 8, … */
  tickStepX: 2,
  tickStepY: 2,
  xMin: -8,
  xMax: 8,
  yMin: -8,
  yMax: 8,
  fXMin: -10,
  fXMax: 10,
};

/** @type {HTMLElement | null} */
let bubbleEl = null;
/** @type {((e: Event) => void) | null} */
let outsideHandler = null;
/** @type {ReturnType<typeof createController> | null} */
let activeCtrl = null;

/**
 * @param {Partial<AxisLegendState>} [partial]
 * @returns {AxisLegendState}
 */
export function normalizeAxisLegendState(partial = {}) {
  const s = { ...DEFAULT_AXIS_LEGEND_STATE, ...partial };
  // 保证 min < max
  if (!(s.xMax > s.xMin)) {
    const t = s.xMin;
    s.xMin = s.xMax;
    s.xMax = t;
  }
  if (!(s.yMax > s.yMin)) {
    const t = s.yMin;
    s.yMin = s.yMax;
    s.yMax = t;
  }
  if (!(s.fXMax > s.fXMin)) {
    const t = s.fXMin;
    s.fXMin = s.fXMax;
    s.fXMax = t;
  }
  s.axisStrokeWidth = Math.min(6, Math.max(0.5, Number(s.axisStrokeWidth) || 1.5));
  const stepX = Number(s.tickStepX);
  const stepY = Number(s.tickStepY);
  s.tickStepX = Number.isFinite(stepX) && stepX > 0 ? stepX : 2;
  s.tickStepY = Number.isFinite(stepY) && stepY > 0 ? stepY : 2;
  s.snapToInteger = s.snapToInteger !== false;
  return s;
}

/**
 * @returns {HTMLElement}
 */
function ensureBubble() {
  if (bubbleEl && document.body.contains(bubbleEl) && bubbleEl.dataset.layout === BUBBLE_LAYOUT) {
    return bubbleEl;
  }
  if (bubbleEl) {
    try {
      bubbleEl.remove();
    } catch {
      /* */
    }
    bubbleEl = null;
  }

  bubbleEl = document.createElement('div');
  bubbleEl.id = BUBBLE_ID;
  bubbleEl.dataset.layout = BUBBLE_LAYOUT;
  bubbleEl.className = 'brand-tip-bubble math-axis-legend-bubble';
  bubbleEl.setAttribute('role', 'dialog');
  bubbleEl.setAttribute('aria-label', '画布设置');
  bubbleEl.hidden = true;
  bubbleEl.innerHTML = `
    <div class="brand-tip-card">
      <div class="brand-tip-head">
        <span class="brand-tip-badge">画布设置</span>
        <div class="math-axis-legend-head-actions">
          <button type="button" class="brand-tip-btn brand-tip-btn-ghost" data-role="reset" title="恢复默认显示与视窗">
            重置
          </button>
          <button type="button" class="brand-tip-btn brand-tip-btn-close" data-role="close">收起</button>
        </div>
      </div>
      <div class="brand-tip-body math-axis-legend-body">
        <section class="math-axis-legend-section">
          <div class="math-check-row-inline math-axis-legend-checks math-axis-legend-checks-one-row">
            <label class="math-check-row"><input type="checkbox" data-role="showAxisX" /><span>X 轴</span></label>
            <label class="math-check-row"><input type="checkbox" data-role="showAxisY" /><span>Y 轴</span></label>
            <label class="math-check-row"><input type="checkbox" data-role="showGrid" /><span>网格</span></label>
            <label class="math-check-row"><input type="checkbox" data-role="showTicks" /><span>刻度</span></label>
          </div>
          <label class="math-check-row" style="margin-top:0.45rem">
            <input type="checkbox" data-role="snapToInteger" />
            <span>拖动点吸附到整数坐标</span>
          </label>
        </section>

        <section class="math-axis-legend-section">
          <label class="math-slider-label">
            <span class="math-slider-name">轴粗细</span>
            <span class="math-slider-val" data-role="axisStrokeWidthVal">1.5</span>
          </label>
          <input type="range" data-role="axisStrokeWidth" min="0.5" max="5" step="0.5" value="1.5" />
          <div class="math-axis-legend-grid2">
            <label class="math-axis-num-field">X 刻度步长
              <input type="number" class="math-num-input" data-role="tickStepX" min="0.1" step="0.5" />
            </label>
            <label class="math-axis-num-field">Y 刻度步长
              <input type="number" class="math-num-input" data-role="tickStepY" min="0.1" step="0.5" />
            </label>
          </div>
        </section>

        <section class="math-axis-legend-section">
          <p class="math-field-label" style="margin:0 0 0.35rem">视窗范围</p>
          <div class="math-axis-legend-grid2">
            <label class="math-axis-num-field">X 最小
              <input type="number" class="math-num-input" data-role="xMin" step="0.5" />
            </label>
            <label class="math-axis-num-field">X 最大
              <input type="number" class="math-num-input" data-role="xMax" step="0.5" />
            </label>
            <label class="math-axis-num-field">Y 最小
              <input type="number" class="math-num-input" data-role="yMin" step="0.5" />
            </label>
            <label class="math-axis-num-field">Y 最大
              <input type="number" class="math-num-input" data-role="yMax" step="0.5" />
            </label>
          </div>
        </section>

        <section class="math-axis-legend-section" data-role="funcDomainSection">
          <p class="math-field-label" style="margin:0 0 0.35rem">函数采样域（仅曲线）</p>
          <div class="math-axis-legend-grid2">
            <label class="math-axis-num-field">X 从
              <input type="number" class="math-num-input" data-role="fXMin" step="0.5" />
            </label>
            <label class="math-axis-num-field">X 到
              <input type="number" class="math-num-input" data-role="fXMax" step="0.5" />
            </label>
          </div>
        </section>
      </div>
    </div>
    <span class="brand-tip-arrow" aria-hidden="true"></span>
  `;
  document.body.appendChild(bubbleEl);

  bubbleEl.querySelector('[data-role="close"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    hideBubble();
  });
  bubbleEl.querySelector('[data-role="reset"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeCtrl) return;
    try {
      hideNumKeypad();
    } catch {
      /* */
    }
    activeCtrl.resetToDefaults();
  });
  bubbleEl.addEventListener('pointerdown', (e) => e.stopPropagation());

  const boolRoles = ['showAxisX', 'showAxisY', 'showGrid', 'showTicks', 'snapToInteger'];
  for (const role of boolRoles) {
    bubbleEl.querySelector(`[data-role="${role}"]`)?.addEventListener('change', (ev) => {
      if (!activeCtrl) return;
      const on = Boolean(/** @type {HTMLInputElement} */ (ev.target).checked);
      activeCtrl.patch({ [role]: on });
    });
  }

  const axisW = /** @type {HTMLInputElement | null} */ (
    bubbleEl.querySelector('[data-role="axisStrokeWidth"]')
  );
  const axisWVal = /** @type {HTMLElement | null} */ (
    bubbleEl.querySelector('[data-role="axisStrokeWidthVal"]')
  );
  axisW?.addEventListener('input', () => {
    if (!activeCtrl || !axisW) return;
    const v = Number(axisW.value);
    if (axisWVal) axisWVal.textContent = String(v);
    activeCtrl.patch({ axisStrokeWidth: v });
  });

  for (const role of ['xMin', 'xMax', 'yMin', 'yMax', 'fXMin', 'fXMax', 'tickStepX', 'tickStepY']) {
    const input = /** @type {HTMLInputElement | null} */ (
      bubbleEl.querySelector(`[data-role="${role}"]`)
    );
    const commit = () => {
      if (!activeCtrl || !input) return;
      const v = Number(input.value);
      if (!Number.isFinite(v)) return;
      activeCtrl.patch({ [role]: v });
    };
    input?.addEventListener('change', commit);
    input?.addEventListener('keydown', (ev) => {
      if (/** @type {KeyboardEvent} */ (ev).key === 'Enter') {
        ev.preventDefault();
        commit();
        input.blur();
      }
    });
  }

  // 数值框挂数学气泡键盘
  mountMathNumKeypads(bubbleEl);

  return bubbleEl;
}

function unbindOutside() {
  if (outsideHandler) {
    document.removeEventListener('pointerdown', outsideHandler, true);
    outsideHandler = null;
  }
}

export function dismissAxisLegendBubble() {
  hideBubble();
}

function hideBubble() {
  unbindOutside();
  try {
    hideNumKeypad();
  } catch {
    /* */
  }
  const el = document.getElementById(BUBBLE_ID);
  if (!el) return;
  el.classList.remove('is-visible');
  el.hidden = true;
  activeCtrl = null;
}

/**
 * @param {HTMLElement} el
 * @param {AxisLegendState} s
 */
function paintBubble(el, s) {
  for (const role of ['showAxisX', 'showAxisY', 'showGrid', 'showTicks', 'snapToInteger']) {
    const input = /** @type {HTMLInputElement | null} */ (el.querySelector(`[data-role="${role}"]`));
    if (input) input.checked = Boolean(s[role]);
  }
  const axisW = /** @type {HTMLInputElement | null} */ (
    el.querySelector('[data-role="axisStrokeWidth"]')
  );
  const axisWVal = /** @type {HTMLElement | null} */ (
    el.querySelector('[data-role="axisStrokeWidthVal"]')
  );
  if (axisW) axisW.value = String(s.axisStrokeWidth);
  if (axisWVal) axisWVal.textContent = String(s.axisStrokeWidth);

  for (const role of ['xMin', 'xMax', 'yMin', 'yMax', 'fXMin', 'fXMax', 'tickStepX', 'tickStepY']) {
    const input = /** @type {HTMLInputElement | null} */ (el.querySelector(`[data-role="${role}"]`));
    if (input) input.value = String(s[role]);
  }
}

/**
 * @param {HTMLElement} anchor
 * @param {ReturnType<typeof createController>} ctrl
 */
function showBubble(anchor, ctrl) {
  const el = ensureBubble();
  activeCtrl = ctrl;
  try {
    ctrl.syncFromBoard?.();
  } catch {
    /* */
  }
  paintBubble(el, ctrl.getState());
  // 每次打开确保键盘已绑定（含重建 DOM 后）
  mountMathNumKeypads(el);

  // 无函数域回调时隐藏该段
  const funcSec = /** @type {HTMLElement | null} */ (el.querySelector('[data-role="funcDomainSection"]'));
  if (funcSec) funcSec.hidden = !ctrl.hasFuncDomain;

  el.hidden = false;
  el.classList.add('is-visible');
  el.style.opacity = '1';
  el.style.zIndex = '200';

  const rect = anchor.getBoundingClientRect();
  const gap = 10;
  el.style.left = '0px';
  el.style.top = '0px';
  void el.offsetWidth;
  const bw = el.offsetWidth || 300;
  const bh = el.offsetHeight || 360;

  let left = rect.right - bw;
  let top = rect.top - bh - gap;
  let place = 'above';
  if (top < 8) {
    top = rect.bottom + gap;
    place = 'below';
  }
  left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
  top = Math.max(8, Math.min(top, window.innerHeight - bh - 8));
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.dataset.place = place;

  const tipX = Math.min(Math.max(rect.left + rect.width / 2 - left, 24), bw - 24);
  el.style.setProperty('--tip-x', `${Math.round(tipX)}px`);

  unbindOutside();
  outsideHandler = (ev) => {
    const t = /** @type {EventTarget | null} */ (ev.target);
    const node = t instanceof Node ? t : null;
    if (node && (el.contains(node) || anchor.contains(node))) {
      // 点在设置面板内：若键盘开着且点的不是当前输入框，仅关键盘
      if (
        isNumKeypadOpen() &&
        !(t instanceof HTMLInputElement && t.classList.contains('math-num-input'))
      ) {
        // 交给键盘 outside 关键盘；设置保持
      }
      return;
    }
    // 点在数字键盘上：不关设置
    if (t instanceof Element && t.closest?.('#mathNumKeypadBubble')) return;
    // 键盘仍开着：先只关键盘，设置气泡保留（再点一次外才关设置）
    if (isNumKeypadOpen()) {
      return;
    }
    hideBubble();
  };
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', outsideHandler, true);
  });
}

/**
 * @param {any} board
 * @param {AxisLegendState} st
 * @param {{ skipViewport?: boolean }} [opts]
 *   skipViewport: 为 true 时不 setBoundingBox（重建曲线/刷新图例时保留用户平移缩放）
 */
export function applyAxisLegendToBoard(board, st, opts = {}) {
  if (!board) return;
  const s = normalizeAxisLegendState(st);

  // —— 坐标轴 + 刻度步长 ——
  try {
    const ax = board.defaultAxes?.x;
    const ay = board.defaultAxes?.y;
    /**
     * @param {any} ticks
     * @param {number} step
     * @param {boolean} visible
     */
    const applyTicks = (ticks, step, visible) => {
      if (!ticks?.setAttribute) return;
      // insertTicks:false 时 ticksDistance 才会固定主刻度间距
      ticks.setAttribute({
        visible,
        insertTicks: false,
        ticksDistance: step,
        minorTicks: 0,
        drawLabels: true,
        majorHeight: Math.round(6 + s.axisStrokeWidth * 2),
      });
      try {
        ticks.fullUpdate?.();
      } catch {
        /* */
      }
    };
    if (ax) {
      ax.setAttribute({
        visible: s.showAxisX,
        strokeWidth: s.axisStrokeWidth,
      });
      applyTicks(ax.defaultTicks, s.tickStepX, s.showAxisX && s.showTicks);
    }
    if (ay) {
      ay.setAttribute({
        visible: s.showAxisY,
        strokeWidth: s.axisStrokeWidth,
      });
      applyTicks(ay.defaultTicks, s.tickStepY, s.showAxisY && s.showTicks);
    }
  } catch {
    /* */
  }

  // —— 网格（JSXGraph：board.grids 为 major/minor 曲线）——
  try {
    let grids = Array.isArray(board.grids) ? board.grids.filter(Boolean) : [];
    if (!grids.length) {
      const list = board.objectsList || [];
      for (const obj of list) {
        if (obj?.elType === 'grid' || obj?.type === 24) grids.push(obj);
      }
    }
    if (grids.length) {
      // 显隐 + 主题网格色（math-theme 契约，禁止 border-soft）
      const gridColor = getMathGridColor();
      for (const g of grids) {
        try {
          g.setAttribute({
            visible: s.showGrid,
            strokeColor: gridColor,
            highlightStrokeColor: gridColor,
            strokeOpacity: 0.55,
          });
          if (Array.isArray(g.elements)) {
            for (const sub of g.elements) {
              sub?.setAttribute?.({
                visible: s.showGrid,
                strokeColor: gridColor,
                strokeOpacity: 0.55,
              });
            }
          }
        } catch {
          /* */
        }
      }
    } else if (s.showGrid) {
      try {
        const gridColor = getMathGridColor();
        board.create('grid', [], {
          strokeColor: gridColor,
          strokeOpacity: 0.55,
        });
      } catch {
        /* */
      }
    }
  } catch {
    /* */
  }

  // —— 视窗（设置面板改范围时写入；刷新图例时跳过以免重置镜头）——
  if (!opts.skipViewport) {
    try {
      // JSXGraph boundingbox: [xMin, yMax, xMax, yMin]
      // keepaspectratio=true：保证 unitX≈unitY，否则数学直角在屏幕上会歪
      board.setBoundingBox([s.xMin, s.yMax, s.xMax, s.yMin], true);
    } catch {
      /* */
    }
  }

  try {
    board.update?.();
    // 勿 fullUpdate：会更重，且部分版本会扰动视窗
    if (!opts.skipViewport) board.fullUpdate?.();
  } catch {
    /* */
  }
}

/**
 * @param {any} board
 * @param {{
 *   host?: HTMLElement | null,
 *   initial?: Partial<AxisLegendState>,
 *   getLegendItems?: () => LegendItem[],
 *   onChange?: (state: AxisLegendState) => void,
 *   hasFuncDomain?: boolean,
 * }} [opts]
 */
function createController(board, opts = {}) {
  /** 重置目标：全局默认 + lab 创建时传入的初值（视窗/函数域） */
  const factoryDefaults = normalizeAxisLegendState({
    ...DEFAULT_AXIS_LEGEND_STATE,
    ...(opts.initial || {}),
  });

  /** @type {AxisLegendState} */
  let state = { ...factoryDefaults };

  // 从 board 当前 bbox 同步初值（仅当 lab 未指定视窗时）
  try {
    const bb = board?.getBoundingBox?.();
    if (bb && opts.initial?.xMin == null) {
      state = normalizeAxisLegendState({
        ...state,
        xMin: bb[0],
        yMax: bb[1],
        xMax: bb[2],
        yMin: bb[3],
      });
    }
  } catch {
    /* */
  }

  const host =
    opts.host || board?.containerObj?.parentElement || board?.containerObj || null;

  /** @type {HTMLButtonElement | null} */
  let btn = null;

  /**
   * @param {{ skipViewport?: boolean, skipOnChange?: boolean }} [applyOpts]
   */
  function applyAll(applyOpts = {}) {
    applyAxisLegendToBoard(board, state, {
      skipViewport: Boolean(applyOpts.skipViewport),
    });
    // 浮动曲线图例已移除；清掉遗留 DOM
    host?.querySelector?.('.math-board-legend')?.remove();
    if (!applyOpts.skipOnChange) {
      try {
        opts.onChange?.(state);
      } catch {
        /* */
      }
    }
  }

  function ensureButton() {
    if (!host || btn) return btn;
    const dock = ensureMathBoardFabDock(host);
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_CLASS;
    btn.title = '画布设置';
    btn.setAttribute('aria-label', '画布设置');
    btn.innerHTML = `
      <span class="math-axis-settings-btn-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M4 20V6M4 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M4 16h4M4 12h7M4 8h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".75"/>
          <circle cx="17" cy="8" r="2.2" fill="currentColor"/>
        </svg>
      </span>`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = document.getElementById(BUBBLE_ID);
      if (el && !el.hidden && activeCtrl === api) {
        hideBubble();
        return;
      }
      showBubble(btn, api);
    });
    // 固定在 dock 最右侧（笔记等在左侧）
    (dock || host).appendChild(btn);
    return btn;
  }

  const api = {
    hasFuncDomain: opts.hasFuncDomain !== false,
    getState: () => ({ ...state }),
    /** 打开气泡时从当前视窗回读范围（用户可能拖过导航） */
    syncFromBoard() {
      try {
        const bb = board?.getBoundingBox?.();
        if (bb) {
          state = normalizeAxisLegendState({
            ...state,
            xMin: bb[0],
            yMax: bb[1],
            xMax: bb[2],
            yMin: bb[3],
          });
        }
      } catch {
        /* */
      }
    },
    /**
     * @param {Partial<AxisLegendState>} patch
     */
    patch(patch) {
      state = normalizeAxisLegendState({ ...state, ...patch });
      applyAll();
      if (activeCtrl === api) {
        const el = document.getElementById(BUBBLE_ID);
        if (el && !el.hidden) paintBubble(el, state);
      }
    },
    /**
     * 恢复默认：显示开关 / 刻度 / 视窗 / 函数域
     * （含 setBoundingBox，会回到 factoryDefaults 视窗）
     */
    resetToDefaults() {
      state = normalizeAxisLegendState({ ...factoryDefaults });
      applyAll(); // 含视窗 + onChange（函数域变化会 rebuild）
      if (activeCtrl === api) {
        const el = document.getElementById(BUBBLE_ID);
        if (el && !el.hidden) paintBubble(el, state);
      }
    },
    setLegendItemsProvider(fn) {
      opts.getLegendItems = fn;
      // 只换图例文案，不重置镜头、不触发 domain onChange
      applyAll({ skipViewport: true, skipOnChange: true });
    },
    /**
     * 重建曲线 / 切换函数后刷新图例等。
     * 必须保留当前平移缩放，不能把 bbox 打回设置初值。
     */
    refresh() {
      applyAll({ skipViewport: true, skipOnChange: true });
    },
    dispose() {
      if (activeCtrl === api) hideBubble();
      const dock = btn?.parentElement?.classList?.contains('math-board-fab-dock')
        ? btn.parentElement
        : host?.querySelector?.(':scope > .math-board-fab-dock');
      btn?.remove();
      btn = null;
      pruneMathBoardFabDock(/** @type {HTMLElement | null} */ (dock || null));
      host?.querySelector?.('.math-board-legend')?.remove();
    },
  };

  ensureButton();
  applyAll();
  return api;
}

/**
 * @param {any} board
 * @param {{
 *   host?: HTMLElement | null,
 *   initial?: Partial<AxisLegendState>,
 *   getLegendItems?: () => LegendItem[],
 *   onChange?: (state: AxisLegendState) => void,
 *   hasFuncDomain?: boolean,
 * }} [opts]
 */
export function attachAxisLegendSettings(board, opts = {}) {
  if (!board) {
    return {
      dispose() {},
      getState: () => ({ ...DEFAULT_AXIS_LEGEND_STATE }),
      patch() {},
      refresh() {},
      hasFuncDomain: false,
    };
  }
  return createController(board, opts);
}
