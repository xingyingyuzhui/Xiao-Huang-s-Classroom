/**
 * 解析几何（JSXGraph）：可拖点 · 直线 · 圆 · 点到直线距离
 */

import { createMathBoard, freeMathBoard, resizeMathBoard, JXG } from '../shared/jsx-board.js';
import { bindMathThemeRestyle } from '../shared/board-lifecycle.js';
import { getMathBoardChrome } from '../shared/math-theme.js';
import { renderTex } from '../shared/tex.js';
import { createBoardSelectionController } from '../shared/object-select.js';
import { bindObjectStyleForPanel } from '../shared/object-style-panel.js';

/** @type {{ board: any, ro: ResizeObserver | null, inited: boolean, points: { A: any, B: any, C: any } | null, metrics: any, styleBind: any, themeHandle: { dispose: () => void } | null }} */
const state = {
  board: null,
  ro: null,
  inited: false,
  points: null,
  metrics: {
    pointsDistAB: 0,
    nearlyAxis: false,
    distance: null,
    radius: 0,
    lineSummary: '',
  },
  styleBind: null,
  themeHandle: null,
};

let stageEl = null;
let formulaEl = null;
let measureEl = null;
/** 主题契约：唯一读色入口 */
function themeColors() {
  const c = getMathBoardChrome();
  return {
    stamp: c.stamp,
    diagram: c.diagram,
    ink: c.ink,
    paper: c.paper,
    pointRing: c.pointRing,
  };
}

function updateSide(A, B, C, line, circle, foot) {
  const colors = themeColors();
  // Line equations from two points
  const x1 = A.X();
  const y1 = A.Y();
  const x2 = B.X();
  const y2 = B.Y();
  const dx = x2 - x1;
  const dy = y2 - y1;

  let lineTex = '';
  if (Math.hypot(dx, dy) < 1e-8) {
    lineTex = String.raw`\text{A、B 重合，无法定直线}`;
  } else if (Math.abs(dx) < 1e-8) {
    lineTex = String.raw`x = ${x1.toFixed(2)}`;
  } else {
    const m = dy / dx;
    const b = y1 - m * x1;
    const aG = dy;
    const bG = -dx;
    const cG = dx * y1 - dy * x1;
    lineTex = String.raw`y=${m.toFixed(3)}x${b >= 0 ? '+' : ''}${b.toFixed(3)}\\[0.35em]${aG.toFixed(2)}x${bG >= 0 ? '+' : ''}${bG.toFixed(2)}y${cG >= 0 ? '+' : ''}${cG.toFixed(2)}=0`;
  }

  const r = A.Dist(B);
  const circleTex = String.raw`(x-${A.X().toFixed(2)})^2+(y-${A.Y().toFixed(2)})^2=${(r * r).toFixed(2)}`;

  if (formulaEl) {
    formulaEl.innerHTML = `
      <div class="math-stat-row math-stat-emphasis">
        <strong>直线 AB</strong>
        <div class="math-tex" data-tex-line></div>
      </div>
      <div class="math-stat-row math-stat-emphasis">
        <strong>圆（圆心 A，过 B）</strong>
        <div class="math-tex" data-tex-circle></div>
        <span>r = ${r.toFixed(3)}</span>
      </div>
    `;
    renderTex(formulaEl.querySelector('[data-tex-line]'), lineTex, true);
    renderTex(formulaEl.querySelector('[data-tex-circle]'), circleTex, true);
  }

  // JSXGraph 无 distance 元素类型，用点到点距离（C 到垂足 H）
  let d = null;
  if (measureEl && foot && typeof C.Dist === 'function') {
    d = C.Dist(foot);
    if (!Number.isFinite(d)) {
      d = Math.hypot(C.X() - foot.X(), C.Y() - foot.Y());
    }
    measureEl.innerHTML = `
      <div class="math-stat-row math-stat-emphasis">
        <strong>点 C 到直线 AB</strong>
        <div class="math-tex" data-tex-dist></div>
        <span>垂足 H ≈ (${foot.X().toFixed(2)}, ${foot.Y().toFixed(2)})</span>
      </div>
    `;
    renderTex(
      measureEl.querySelector('[data-tex-dist]'),
      String.raw`d=\dfrac{|Ax_0+By_0+C|}{\sqrt{A^2+B^2}}=${d.toFixed(3)}`,
      true,
    );
  }

  state.metrics = {
    pointsDistAB: r,
    nearlyAxis: Math.hypot(dx, dy) > 1e-6 && (Math.abs(dx) < 0.25 || Math.abs(dy) < 0.25),
    distance: d,
    radius: r,
    lineSummary: `r≈${r.toFixed(2)}`,
  };
  void colors;
  void line;
  void circle;
}

export function initPlaneUI() {
  stageEl = document.getElementById('mathPlaneStage');
  const box = document.getElementById('mathPlaneBoard');
  formulaEl = document.getElementById('mathPlaneFormulas');
  measureEl = document.getElementById('mathPlaneMeasure');
  if (!stageEl || !box) return;

  if (state.board) {
    resizeMathBoard(state.board, stageEl);
    return;
  }

  const c = themeColors();
  state.board = createMathBoard('mathPlaneBoard', {
    boundingbox: [-9, 9, 9, -9],
  });
  const board = state.board;

  const A = board.create('point', [-2, 1], {
    name: 'A',
    size: 5,
    fillColor: c.stamp,
    strokeColor: c.pointRing,
    label: { offset: [8, 8] },
  });
  const B = board.create('point', [3, 4], {
    name: 'B',
    size: 5,
    fillColor: c.stamp,
    strokeColor: c.pointRing,
  });
  const C = board.create('point', [1, -2], {
    name: 'C',
    size: 5,
    fillColor: c.diagram,
    strokeColor: c.pointRing,
  });
  state.points = { A, B, C };

  const line = board.create('line', [A, B], {
    strokeColor: c.stamp,
    strokeWidth: 2.5,
    name: 'AB',
    withLabel: false,
  });
  const circle = board.create('circle', [A, B], {
    strokeColor: c.diagram,
    strokeWidth: 2,
    dash: 2,
    fillColor: c.diagram,
    fillOpacity: 0.06,
  });
  const foot = board.create('perpendicularpoint', [C, line], {
    name: 'H',
    size: 4,
    fillColor: c.ink,
    strokeColor: c.pointRing,
  });
  const altitude = board.create('segment', [C, foot], {
    strokeColor: c.diagram,
    strokeWidth: 2,
    dash: 1,
    name: 'CH',
  });

  const refresh = () => updateSide(A, B, C, line, circle, foot);
  board.on('update', refresh);
  refresh();

  const resetBtn = document.getElementById('btnMathPlaneReset');
  if (resetBtn && !resetBtn.dataset.mathBound) {
    resetBtn.dataset.mathBound = '1';
    resetBtn.addEventListener('click', () => {
      const pts = state.points;
      if (!state.board || !pts) return;
      pts.A.setPosition(JXG.COORDS_BY_USER, [-2, 1]);
      pts.B.setPosition(JXG.COORDS_BY_USER, [3, 4]);
      pts.C.setPosition(JXG.COORDS_BY_USER, [1, -2]);
      state.board.update();
    });
  }

  const panelRoot = document.getElementById('panel-math-plane');
  state.styleBind = bindObjectStyleForPanel(panelRoot, createBoardSelectionController);
  if (state.styleBind) {
    state.styleBind.wireBoard(
      board,
      [A, B, C, line, circle, foot, altitude],
      (el) => ({ label: el.name || undefined }),
    );
  }

  state.ro = new ResizeObserver(() => resizeMathBoard(board, stageEl));
  state.ro.observe(stageEl);
  state.themeHandle?.dispose?.();
  state.themeHandle = bindMathThemeRestyle(() => state.board);
  state.inited = true;
  requestAnimationFrame(() => resizeMathBoard(board, stageEl));
}

/** @returns {import('../shared/lab-bridge.js').LabSnapshot | null} */
export function getLabSnapshot() {
  if (!state.board || !state.points) return null;
  const { A, B, C } = state.points;
  return {
    tab: 'plane',
    label: '直线与圆',
    summary: `A(${A.X().toFixed(2)},${A.Y().toFixed(2)}) B(${B.X().toFixed(2)},${B.Y().toFixed(2)}) C(${C.X().toFixed(2)},${C.Y().toFixed(2)}) · d≈${
      state.metrics.distance?.toFixed?.(2) ?? '—'
    } · r≈${state.metrics.radius?.toFixed?.(2) ?? '—'}`,
    formula: state.metrics.lineSummary || '',
    params: {
      A: [A.X(), A.Y()],
      B: [B.X(), B.Y()],
      C: [C.X(), C.Y()],
      distance: state.metrics.distance,
      radius: state.metrics.radius,
    },
  };
}

/**
 * @param {import('../shared/lab-bridge.js').LabAction} action
 */
export function applyLabAction(action) {
  const pts = state.points;
  if (!state.board || !pts) return { ok: false, message: '画板未就绪' };
  // 默认复位经典点位（示范动作）
  pts.A.setPosition(JXG.COORDS_BY_USER, [-2, 1]);
  pts.B.setPosition(JXG.COORDS_BY_USER, [3, 4]);
  pts.C.setPosition(JXG.COORDS_BY_USER, [1, -2]);
  state.board.update();
  return { ok: true, message: action.label || '已复位直线与圆点位' };
}

export function resizePlane() {
  if (state.board && stageEl) resizeMathBoard(state.board, stageEl);
}

export function disposePlane() {
  state.themeHandle?.dispose?.();
  state.themeHandle = null;
  state.ro?.disconnect();
  state.ro = null;
  state.styleBind?.dispose?.();
  state.styleBind = null;
  freeMathBoard(state.board);
  state.board = null;
  state.points = null;
  state.inited = false;
}
