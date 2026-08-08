/**
 * 画布笔记层：手写 / 手绘叠在 JSXGraph 之上
 *
 * - 笔迹存用户坐标，视窗平移缩放后重绘
 * - 开启笔记模式时拦截指针，避免与加点/拖点/平移冲突
 * - 关闭模式后笔迹仍显示，但不接收输入
 * - 入口按钮与图例设置共用右下角 fab dock，保证对齐
 */

import { createButton } from '@xiaohuang/ui';
import { ensureMathBoardFabDock, pruneMathBoardFabDock } from './board-fab-dock.js';

/** 高对比预置色：色相拉开，避免蓝/青/紫发糊 */
const PEN_COLORS = [
  { id: 'ink', label: '墨黑', value: '#1c1917' },
  { id: 'stamp', label: '琥珀', value: '#c2410c' },
  { id: 'green', label: '翠绿', value: '#15803d' },
  { id: 'blue', label: '靛蓝', value: '#1d4ed8' },
  { id: 'violet', label: '藤紫', value: '#7c3aed' },
  { id: 'red', label: '朱红', value: '#e11d48' },
];

const WIDTHS = [
  { id: 's', label: '细', px: 2.2 },
  { id: 'm', label: '中', px: 3.6 },
  { id: 'l', label: '粗', px: 6 },
];

/** @type {ReturnType<typeof createNotesController> | null} */
let activeNotes = null;

/**
 * @typedef {{
 *   id: string,
 *   color: string,
 *   width: number,
 *   points: Array<{ x: number, y: number }>,
 * }} NoteStroke
 *
 * @typedef {{
 *   type: 'add',
 *   stroke: NoteStroke,
 * } | {
 *   type: 'erase',
 *   removed: NoteStroke[],
 * } | {
 *   type: 'clear',
 *   removed: NoteStroke[],
 * }} NoteOp
 */

/**
 * @param {string} cssColor
 */
function resolveColor(cssColor) {
  if (!cssColor || !cssColor.includes('var(')) return cssColor || '#b45309';
  try {
    const probe = document.createElement('span');
    probe.style.color = cssColor;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c || '#b45309';
  } catch {
    return '#b45309';
  }
}

/**
 * 屏幕坐标 → 用户坐标
 * @param {any} board
 * @param {number} sx
 * @param {number} sy
 */
export function screenToUser(board, sx, sy) {
  try {
    if (board?.origin?.scrCoords && board.unitX && board.unitY) {
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
 * 用户坐标 → 屏幕坐标（相对 board 容器）
 * @param {any} board
 * @param {number} x
 * @param {number} y
 */
export function userToScreen(board, x, y) {
  try {
    if (board?.origin?.scrCoords && board.unitX && board.unitY) {
      const ox = board.origin.scrCoords[1];
      const oy = board.origin.scrCoords[2];
      return {
        x: ox + x * board.unitX,
        y: oy - y * board.unitY,
      };
    }
  } catch {
    /* */
  }
  return { x: 0, y: 0 };
}

/**
 * 点到线段距离（屏幕坐标）
 * @param {number} px
 * @param {number} py
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 */
export function distPointToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

/**
 * @param {any} board
 * @param {NoteStroke} stroke
 * @param {number} sx
 * @param {number} sy
 * @param {number} radiusPx
 */
export function strokeHitTest(board, stroke, sx, sy, radiusPx) {
  const pts = stroke.points;
  if (!pts?.length) return false;
  const r = radiusPx + stroke.width * 0.5;
  if (pts.length === 1) {
    const p = userToScreen(board, pts[0].x, pts[0].y);
    return Math.hypot(p.x - sx, p.y - sy) <= r;
  }
  for (let i = 1; i < pts.length; i++) {
    const a = userToScreen(board, pts[i - 1].x, pts[i - 1].y);
    const b = userToScreen(board, pts[i].x, pts[i].y);
    if (distPointToSeg(sx, sy, a.x, a.y, b.x, b.y) <= r) return true;
  }
  return false;
}

/**
 * 退出全局笔记模式（保留笔迹显示）
 */
export function dismissBoardNotesMode() {
  if (activeNotes?.isActive()) {
    activeNotes.setActive(false);
  }
}

/**
 * @param {any} board
 * @param {{
 *   host?: HTMLElement | null,
 *   storageKey?: string,
 * }} [opts]
 */
export function attachBoardNotes(board, opts = {}) {
  const boardEl = board?.containerObj;
  if (!boardEl) {
    return {
      dispose() {},
      isActive: () => false,
      setActive() {},
      clear() {},
      redraw() {},
      getSnapshot: () => ({ version: 1, strokes: [] }),
      replaceSnapshot() {},
      undo() {},
      canUndo: () => false,
      onSnapshotChange() {
        return () => {};
      },
    };
  }

  const host = opts.host || /** @type {HTMLElement} */ (boardEl.parentElement) || boardEl;

  // 同 host 只挂一份
  if (host.dataset.mathNotesBound === '1') {
    return (
      host._mathNotesCtrl || {
        dispose() {},
        isActive: () => false,
        setActive() {},
        clear() {},
        redraw() {},
        getSnapshot: () => ({ version: 1, strokes: [] }),
        replaceSnapshot() {},
        undo() {},
        canUndo: () => false,
        onSnapshotChange() {
          return () => {};
        },
      }
    );
  }
  host.dataset.mathNotesBound = '1';

  const ctrl = createNotesController(board, boardEl, host, opts.storageKey || '');
  host._mathNotesCtrl = ctrl;
  return ctrl;
}

/**
 * @param {any} board
 * @param {HTMLElement} boardEl
 * @param {HTMLElement} host
 * @param {string} storageKey
 */
function createNotesController(board, boardEl, host, storageKey) {
  /** @type {NoteStroke[]} */
  let strokes = [];
  /** @type {NoteOp[]} */
  let history = [];
  let active = false;
  let tool = /** @type {'pen' | 'eraser'} */ ('pen');
  let colorId = 'ink';
  let widthId = 'm';
  let strokeSeq = 1;
  /** @type {NoteStroke | null} */
  let draft = null;
  /** @type {Set<string>} */
  let eraseSessionRemoved = new Set();
  /** @type {NoteStroke[]} */
  let eraseSessionList = [];
  let drawing = false;
  /** @type {number | null} */
  let ptrId = null;

  // 进入笔记前的 pan/zoom 状态
  let savedPan = true;
  let savedZoomWheel = true;

  // 画笔层：仅 canvas，覆盖整个 host
  const root = document.createElement('div');
  root.className = 'math-board-notes';
  const canvas = document.createElement('canvas');
  canvas.className = 'math-board-notes-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  root.appendChild(canvas);
  host.appendChild(root);

  // 工具条 + 入口：与图例设置共用右下角 dock，水平垂直对齐
  const dock = ensureMathBoardFabDock(host) || host;
  const chrome = document.createElement('div');
  chrome.className = 'math-board-notes-chrome';

  // 全部按钮经 @xiaohuang/ui createButton 构建（ui-btn 基类 + 旧类桥接，
  // 布局样式仍走 math-board-notes-* 类）；禁止 HTML 字符串生成可点击控件。
  /** @type {Array<ReturnType<typeof createButton>>} */
  const uiControls = [];
  /** @type {Map<string, HTMLButtonElement>} */
  const toolButtons = new Map();
  /** @type {Map<string, HTMLButtonElement>} */
  const widthButtons = new Map();
  /** @type {Map<string, HTMLButtonElement>} */
  const colorButtons = new Map();

  const toolbar = document.createElement('div');
  toolbar.className = 'math-board-notes-toolbar';
  toolbar.setAttribute('data-role', 'toolbar');
  toolbar.hidden = true;
  chrome.appendChild(toolbar);

  /** @param {string} className @param {string} ariaLabel */
  function makeGroup(className, ariaLabel) {
    const group = document.createElement('div');
    group.className = className;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', ariaLabel);
    toolbar.appendChild(group);
    return group;
  }

  // 工具：笔 / 橡皮（单选，is-on 标记当前工具）
  const toolsGroup = makeGroup('math-board-notes-tools', '笔记工具');
  const toolItems = [
    { id: 'pen', label: '笔', tip: '画笔' },
    { id: 'eraser', label: '橡皮', tip: '橡皮' },
  ];
  for (const t of toolItems) {
    const ctrl = createButton({
      label: t.label,
      title: t.tip,
      className: 'math-board-notes-tool',
      onClick: () => {
        tool = /** @type {'pen' | 'eraser'} */ (t.id);
        toolButtons.forEach((btn, id) => {
          btn.classList.toggle('is-on', id === tool);
        });
        syncChrome();
      },
    });
    ctrl.element.dataset.tool = t.id;
    if (t.id === tool) ctrl.element.classList.add('is-on');
    uiControls.push(ctrl);
    toolButtons.set(t.id, ctrl.element);
    toolsGroup.appendChild(ctrl.element);
  }

  // 线宽：细/中/粗（is-on 标记当前线宽）
  const widthsGroup = makeGroup('math-board-notes-widths', '线宽');
  for (const w of WIDTHS) {
    const ctrl = createButton({
      label: '',
      title: w.label,
      'aria-label': w.label,
      className: 'math-board-notes-width',
      onClick: () => {
        widthId = w.id;
        widthButtons.forEach((btn, id) => {
          btn.classList.toggle('is-on', id === widthId);
        });
      },
    });
    const bar = document.createElement('i');
    bar.style.setProperty('--nw', `${w.px}px`);
    ctrl.element.appendChild(bar);
    ctrl.element.dataset.width = w.id;
    if (w.id === widthId) ctrl.element.classList.add('is-on');
    uiControls.push(ctrl);
    widthButtons.set(w.id, ctrl.element);
    widthsGroup.appendChild(ctrl.element);
  }

  // 颜色：高对比预置色（is-on 标记当前颜色）
  const colorsGroup = makeGroup('math-board-notes-colors', '颜色');
  for (const c of PEN_COLORS) {
    const ctrl = createButton({
      label: '',
      title: c.label,
      'aria-label': c.label,
      className: 'math-board-notes-color',
      onClick: () => {
        colorId = c.id;
        colorButtons.forEach((btn, id) => {
          btn.classList.toggle('is-on', id === colorId);
        });
      },
    });
    ctrl.element.dataset.color = c.id;
    ctrl.element.dataset.colorName = c.id;
    ctrl.element.style.setProperty('--nc', c.value);
    if (c.id === colorId) ctrl.element.classList.add('is-on');
    uiControls.push(ctrl);
    colorButtons.set(c.id, ctrl.element);
    colorsGroup.appendChild(ctrl.element);
  }

  // 操作：撤销 / 清空 / 完成
  const actionsGroup = document.createElement('div');
  actionsGroup.className = 'math-board-notes-actions';
  toolbar.appendChild(actionsGroup);
  const actions = [
    { role: 'undo', label: '撤销', tip: '撤销' },
    { role: 'clear', label: '清空', tip: '清空' },
    { role: 'done', label: '完成', tip: '完成笔记', done: true },
  ];
  for (const a of actions) {
    const ctrl = createButton({
      label: a.label,
      title: a.tip,
      className: 'math-board-notes-action',
      onClick: () => {
        if (a.role === 'undo') undo();
        else if (a.role === 'clear') clearAll();
        else if (a.role === 'done') setActive(false);
      },
    });
    ctrl.element.dataset.role = a.role;
    if (a.done) ctrl.element.classList.add('is-done');
    uiControls.push(ctrl);
    actionsGroup.appendChild(ctrl.element);
  }

  // 入口按钮：收起状态下保持常驻
  const toggleCtrl = createButton({
    label: '',
    title: '笔记',
    'aria-label': '笔记',
    className: 'math-board-notes-toggle',
    onClick: () => setActive(!active),
  });
  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'math-board-notes-toggle-icon';
  toggleIcon.setAttribute('aria-hidden', 'true');
  toggleIcon.textContent = '✎';
  const toggleLabel = document.createElement('span');
  toggleLabel.className = 'math-board-notes-toggle-label';
  toggleLabel.textContent = '笔记';
  toggleCtrl.element.append(toggleIcon, toggleLabel);
  toggleCtrl.element.dataset.role = 'toggle';
  toggleCtrl.element.setAttribute('aria-pressed', 'false');
  const toggleBtn = toggleCtrl.element;
  uiControls.push(toggleCtrl);
  chrome.appendChild(toggleBtn);

  // 插到图例按钮之前：… [工具条] [笔记] [图例]
  const axisBtn = dock.querySelector?.('.math-axis-settings-btn');
  if (axisBtn) dock.insertBefore(chrome, axisBtn);
  else dock.appendChild(chrome);

  // 原逐按钮 stopPropagation 的等价收口：chrome 内点击不冒泡到 board/宿主
  chrome.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  const ctx = canvas.getContext('2d');

  function currentColor() {
    const meta = PEN_COLORS.find((c) => c.id === colorId) || PEN_COLORS[0];
    return resolveColor(meta.value);
  }

  function currentWidth() {
    return (WIDTHS.find((w) => w.id === widthId) || WIDTHS[1]).px;
  }

  function loadStorage() {
    if (!storageKey || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data?.strokes)) {
        strokes = data.strokes
          .filter((s) => s && Array.isArray(s.points) && s.points.length)
          .map((s) => ({
            id: String(s.id || `n${strokeSeq++}`),
            color: String(s.color || '#b45309'),
            width: Number(s.width) || 3.6,
            points: s.points
              .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
              .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
          }))
          .filter((s) => s.points.length);
      }
    } catch {
      /* */
    }
  }

  function saveStorage() {
    if (!storageKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          v: 1,
          strokes: strokes.map((s) => ({
            id: s.id,
            color: s.color,
            width: s.width,
            points: s.points,
          })),
        }),
      );
    } catch {
      /* */
    }
  }

  // ── 文档快照 API（Task 5：批注并入 GraphDocument.annotations） ──
  /** @type {((snapshot: any) => void) | null} */
  let snapshotListener = null;

  /**
   * 文档格式快照：{ version: 1, strokes: [{ id, points, colorSlot, explicitColor, width, opacity }] }
   */
  function getSnapshot() {
    return {
      version: 1,
      strokes: strokes.map((s) => ({
        id: s.id,
        points: s.points.map((p) => ({ x: p.x, y: p.y })),
        colorSlot: null,
        explicitColor: s.color,
        width: s.width,
        opacity: 1,
      })),
    };
  }

  /** @param {any} snapshot */
  function replaceSnapshot(snapshot) {
    const list = Array.isArray(snapshot?.strokes) ? snapshot.strokes : [];
    strokes = list
      .filter((s) => s && Array.isArray(s.points) && s.points.length)
      .map((s) => ({
        id: String(s.id || `n${strokeSeq++}`),
        color: String(s.explicitColor || s.color || '#b45309'),
        width: Number(s.width) || 3.6,
        points: s.points
          .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      }))
      .filter((s) => s.points.length);
    redraw();
    snapshotListener?.(getSnapshot());
  }

  /** stroke/clear/undo 后通知外层（dispatch annotations/replace） */
  function notifySnapshotChange() {
    snapshotListener?.(getSnapshot());
  }

  /** @param {(snapshot: any) => void} listener */
  function onSnapshotChange(listener) {
    snapshotListener = listener;
    return () => {
      if (snapshotListener === listener) snapshotListener = null;
    };
  }

  function syncChrome() {
    root.classList.toggle('is-active', active);
    root.classList.toggle('is-eraser', tool === 'eraser');
    toggleBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    toggleBtn.classList.toggle('is-on', active);
    // 入口文案始终「笔记」；收起用工具条「完成」
    toggleBtn.title = active ? '笔记（进行中）' : '笔记';
    if (active) {
      toolbar.hidden = false;
      // 下一帧再加 open，触发向左弹出动画
      requestAnimationFrame(() => {
        toolbar.classList.add('is-open');
      });
    } else {
      toolbar.classList.remove('is-open');
      // 等过渡后再 hidden，避免闪断
      window.setTimeout(() => {
        if (!active) toolbar.hidden = true;
      }, 180);
    }
    // 非激活：画布不拦截事件，仅展示笔迹
    canvas.style.pointerEvents = active ? 'auto' : 'none';
  }

  function applyBoardInteraction(enabled) {
    try {
      if (enabled) {
        board.attr.pan.enabled = savedPan;
        if (board.attr.zoom) board.attr.zoom.wheel = savedZoomWheel;
      } else {
        savedPan = board.attr?.pan?.enabled !== false;
        savedZoomWheel = board.attr?.zoom?.wheel !== false;
        board.attr.pan.enabled = false;
        if (board.attr.zoom) board.attr.zoom.wheel = false;
      }
    } catch {
      /* */
    }
  }

  function setActive(on) {
    const next = Boolean(on);
    if (next === active) return;
    if (next) {
      // 全局仅允许一块板处于笔记态
      if (activeNotes && activeNotes !== api) {
        activeNotes.setActive(false);
      }
      activeNotes = api;
      active = true;
      applyBoardInteraction(false);
      try {
        import('./board-compass.js').then((m) => m.dismissBoardCompass?.());
      } catch {
        /* */
      }
      try {
        import('./object-style-panel.js').then((m) => m.dismissObjectStyleBubble?.());
      } catch {
        /* */
      }
    } else {
      endStroke();
      active = false;
      applyBoardInteraction(true);
      if (activeNotes === api) activeNotes = null;
    }
    syncChrome();
    redraw();
  }

  function resizeCanvas() {
    if (!ctx) return;
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  /**
   * @param {NoteStroke} stroke
   */
  function paintStroke(stroke) {
    if (!ctx || !stroke.points.length) return;
    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (stroke.points.length === 1) {
      const p = userToScreen(board, stroke.points[0].x, stroke.points[0].y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      const p0 = userToScreen(board, stroke.points[0].x, stroke.points[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < stroke.points.length; i++) {
        const p = userToScreen(board, stroke.points[i].x, stroke.points[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function redraw() {
    if (!ctx) return;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    ctx.clearRect(0, 0, w, h);
    for (const s of strokes) paintStroke(s);
    if (draft) paintStroke(draft);
  }

  function pushHistory(op) {
    history.push(op);
    if (history.length > 80) history.shift();
  }

  function undo() {
    const op = history.pop();
    if (!op) return;
    if (op.type === 'add') {
      strokes = strokes.filter((s) => s.id !== op.stroke.id);
    } else if (op.type === 'erase' || op.type === 'clear') {
      strokes = strokes.concat(op.removed);
    }
    saveStorage();
    redraw();
    notifySnapshotChange();
  }

  function clearAll() {
    if (!strokes.length) return;
    pushHistory({ type: 'clear', removed: strokes.slice() });
    strokes = [];
    draft = null;
    saveStorage();
    redraw();
    notifySnapshotChange();
  }

  /**
   * @param {PointerEvent} ev
   */
  function localXY(ev) {
    const rect = canvas.getBoundingClientRect();
    return {
      sx: ev.clientX - rect.left,
      sy: ev.clientY - rect.top,
    };
  }

  function endStroke() {
    if (!drawing) return;
    drawing = false;
    ptrId = null;
    if (tool === 'pen' && draft && draft.points.length) {
      strokes.push(draft);
      pushHistory({ type: 'add', stroke: draft });
      saveStorage();
      notifySnapshotChange();
    } else if (tool === 'eraser' && eraseSessionList.length) {
      pushHistory({ type: 'erase', removed: eraseSessionList.slice() });
      saveStorage();
      notifySnapshotChange();
    }
    draft = null;
    eraseSessionRemoved = new Set();
    eraseSessionList = [];
    redraw();
  }

  /**
   * @param {number} sx
   * @param {number} sy
   */
  function eraseAt(sx, sy) {
    const radius = Math.max(14, currentWidth() * 2.2);
    const hit = [];
    const keep = [];
    for (const s of strokes) {
      if (eraseSessionRemoved.has(s.id)) {
        keep.push(s);
        continue;
      }
      if (strokeHitTest(board, s, sx, sy, radius)) {
        hit.push(s);
        eraseSessionRemoved.add(s.id);
        eraseSessionList.push(s);
      } else {
        keep.push(s);
      }
    }
    if (hit.length) {
      strokes = keep;
      redraw();
    }
  }

  /**
   * @param {PointerEvent} ev
   */
  const onPointerDown = (ev) => {
    if (!active) return;
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    drawing = true;
    ptrId = ev.pointerId;
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* */
    }
    const { sx, sy } = localXY(ev);
    const u = screenToUser(board, sx, sy);
    if (tool === 'pen') {
      draft = {
        id: `n${strokeSeq++}`,
        color: currentColor(),
        width: currentWidth(),
        points: [u],
      };
      redraw();
    } else {
      eraseSessionRemoved = new Set();
      eraseSessionList = [];
      eraseAt(sx, sy);
    }
  };

  /**
   * @param {PointerEvent} ev
   */
  const onPointerMove = (ev) => {
    if (!drawing || !active) return;
    if (ptrId != null && ev.pointerId !== ptrId) return;
    ev.preventDefault();
    const { sx, sy } = localXY(ev);
    if (tool === 'pen' && draft) {
      const u = screenToUser(board, sx, sy);
      const last = draft.points[draft.points.length - 1];
      // 降采样：屏幕位移过小则跳过
      if (last) {
        const a = userToScreen(board, last.x, last.y);
        if (Math.hypot(a.x - sx, a.y - sy) < 1.6) return;
      }
      draft.points.push(u);
      redraw();
    } else if (tool === 'eraser') {
      eraseAt(sx, sy);
    }
  };

  /**
   * @param {PointerEvent} ev
   */
  const onPointerUp = (ev) => {
    if (ptrId != null && ev.pointerId !== ptrId) return;
    endStroke();
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* */
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  // 避免触摸滚动
  canvas.style.touchAction = 'none';

  // 视窗变化重绘
  const onBoardUpdate = () => {
    redraw();
  };
  try {
    board.on('boundingbox', onBoardUpdate);
    board.on('update', onBoardUpdate);
  } catch {
    /* */
  }

  const ro = new ResizeObserver(() => resizeCanvas());
  ro.observe(host);

  loadStorage();
  syncChrome();
  requestAnimationFrame(() => resizeCanvas());

  const api = {
    isActive: () => active,
    setActive,
    clear: clearAll,
    redraw,
    getStrokeCount: () => strokes.length,
    getSnapshot,
    replaceSnapshot,
    undo,
    canUndo: () => history.length > 0,
    onSnapshotChange,
    dispose() {
      setActive(false);
      ro.disconnect();
      try {
        board.off?.('boundingbox', onBoardUpdate);
        board.off?.('update', onBoardUpdate);
      } catch {
        /* */
      }
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      try {
        root.remove();
      } catch {
        /* */
      }
      try {
        chrome.remove();
      } catch {
        /* */
      }
      // 释放全部 ui 控制器（幂等：重复 dispose 安全）
      for (const ctrl of uiControls) {
        try {
          ctrl.dispose();
        } catch {
          /* */
        }
      }
      pruneMathBoardFabDock(
        /** @type {HTMLElement | null} */ (
          dock?.classList?.contains('math-board-fab-dock') ? dock : null
        ),
      );
      delete host.dataset.mathNotesBound;
      delete host._mathNotesCtrl;
      if (activeNotes === api) activeNotes = null;
    },
  };

  return api;
}
