/**
 * 三角函数：单位圆滑点 + sin/cos 波形联动（JSXGraph）
 */

import { createMathBoard, freeMathBoard, resizeMathBoard } from '../shared/jsx-board.js';
import { bindMathThemeRestyle } from '../shared/board-lifecycle.js';
import { getMathBoardChrome, readCssVar } from '../shared/math-theme.js';
import { renderTex } from '../shared/tex.js';
import { exactSpecial, normalizeDeg, snapSpecialDeg } from './model.js';
import { bindRangeNumber, syncRangeNumber } from '../shared/param-controls.js';
import { createBoardSelectionController } from '../shared/object-select.js';
import { bindObjectStyleForPanel } from '../shared/object-style-panel.js';

/** @type {{ circleBoard: any, waveBoard: any, glider: any, angle: number, snap: boolean, ro: ResizeObserver | null, styleBind: any, themeHandle: { dispose: () => void } | null }} */
const state = {
  circleBoard: null,
  waveBoard: null,
  glider: null,
  angle: Math.PI / 6,
  snap: true,
  ro: null,
  styleBind: null,
  themeHandle: null,
};

let circleStage = null;
let waveStage = null;
let tracerSin = null;
let tracerCos = null;

function colors() {
  const c = getMathBoardChrome();
  return {
    stamp: c.stamp,
    diagram: c.diagram,
    ink: c.ink,
    paper: c.paper,
    pointRing: c.pointRing,
    soft: readCssVar('--note-soft', '#fef3c7'),
  };
}

function renderReadout() {
  let d = (state.angle * 180) / Math.PI;
  d = normalizeDeg(d);
  if (state.snap) d = snapSpecialDeg(d, 3);
  const rad = (d * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const tan = Math.abs(cos) < 1e-10 ? null : Math.tan(rad);

  const readout = document.getElementById('mathTrigReadout');
  const exactEl = document.getElementById('mathTrigExact');
  const degLabel = document.getElementById('mathTrigDegLabel');
  const slider = /** @type {HTMLInputElement | null} */ (document.getElementById('mathTrigSlider'));
  const degNum = /** @type {HTMLInputElement | null} */ (document.getElementById('mathTrigDegNum'));
  const shown = Math.round(d * 10) / 10;
  if (degLabel) degLabel.textContent = String(shown);
  syncRangeNumber(slider, degNum, shown);

  if (readout) {
    readout.innerHTML = `
      <div class="math-stat-row math-stat-emphasis">
        <strong>θ</strong>
        <div class="math-tex" data-tex-theta></div>
      </div>
      <div class="math-stat-row"><strong>sin θ</strong><span class="math-mono">${sin.toFixed(4)}</span></div>
      <div class="math-stat-row"><strong>cos θ</strong><span class="math-mono">${cos.toFixed(4)}</span></div>
      <div class="math-stat-row"><strong>tan θ</strong><span class="math-mono">${tan == null ? '不存在' : tan.toFixed(4)}</span></div>
    `;
    renderTex(
      readout.querySelector('[data-tex-theta]'),
      String.raw`${d.toFixed(1)}^\circ\ \approx\ ${rad.toFixed(3)}\ \mathrm{rad}`,
      true,
    );
  }

  const exact = exactSpecial(Math.round(d));
  if (exactEl) {
    if (exact) {
      exactEl.innerHTML = `<div class="math-stat-row math-stat-emphasis"><strong>特殊角精确值</strong><div class="math-tex" data-tex-exact></div></div>`;
      renderTex(
        exactEl.querySelector('[data-tex-exact]'),
        String.raw`\sin=${exact.sin},\ \cos=${exact.cos},\ \tan=${exact.tan}`,
        true,
      );
    } else {
      exactEl.innerHTML = '<p class="math-empty">靠近 30°/45°/60°… 显示根式精确值</p>';
    }
  }
}

function applyAngle(d) {
  if (state.snap) d = snapSpecialDeg(normalizeDeg(d), 4);
  else d = normalizeDeg(d);
  state.angle = (d * Math.PI) / 180;
  if (state.glider) {
    state.glider.moveTo([Math.cos(state.angle), Math.sin(state.angle)]);
  }
  tracerSin?.moveTo([state.angle, Math.sin(state.angle)]);
  tracerCos?.moveTo([state.angle, Math.cos(state.angle)]);
  state.circleBoard?.update();
  state.waveBoard?.update();
  renderReadout();
}

export function initTrigUI() {
  circleStage = document.getElementById('mathTrigCircleStage');
  waveStage = document.getElementById('mathTrigWaveStage');
  if (!circleStage || !waveStage) return;
  if (state.circleBoard && state.waveBoard) {
    resizeMathBoard(state.circleBoard, circleStage);
    resizeMathBoard(state.waveBoard, waveStage);
      return;
  }

  const c = colors();

  state.circleBoard = createMathBoard('mathTrigCircleBoard', {
    boundingbox: [-1.6, 1.6, 1.6, -1.6],
    showNavigation: false,
  });
  const cb = state.circleBoard;
  const origin = cb.create('point', [0, 0], {
    name: 'O',
    size: 2,
    fixed: true,
    fillColor: c.ink,
    strokeColor: c.pointRing,
  });
  const unit = cb.create('circle', [origin, 1], {
    strokeColor: c.ink,
    strokeWidth: 2,
    fillColor: c.soft,
    fillOpacity: 0.25,
    name: '单位圆',
  });
  state.glider = cb.create('glider', [Math.cos(state.angle), Math.sin(state.angle), unit], {
    name: 'P',
    size: 5,
    fillColor: c.stamp,
    strokeColor: c.pointRing,
  });
  const radiusSeg = cb.create('segment', [origin, state.glider], {
    strokeColor: c.stamp,
    strokeWidth: 2.5,
    name: 'OP',
  });
  const sinSeg = cb.create(
    'segment',
    [state.glider, () => [state.glider.X(), 0]],
    { strokeColor: c.diagram, dash: 2, strokeWidth: 2, name: 'sin 投影' },
  );
  const cosSeg = cb.create(
    'segment',
    [state.glider, () => [0, state.glider.Y()]],
    { strokeColor: c.diagram, dash: 2, strokeWidth: 2, name: 'cos 投影' },
  );
  const ang = cb.create('angle', [[1, 0], origin, state.glider], {
    radius: 0.35,
    fillColor: c.stamp,
    fillOpacity: 0.25,
    strokeColor: c.stamp,
    name: 'θ',
  });

  state.waveBoard = createMathBoard('mathTrigWaveBoard', {
    boundingbox: [-0.5, 1.8, 6.8, -1.8],
    keepaspectratio: false,
    showNavigation: false,
  });
  const wb = state.waveBoard;
  const sinCurve = wb.create('functiongraph', [(x) => Math.sin(x), 0, 2 * Math.PI], {
    strokeColor: c.stamp,
    strokeWidth: 2.5,
    name: 'sin',
  });
  const cosCurve = wb.create('functiongraph', [(x) => Math.cos(x), 0, 2 * Math.PI], {
    strokeColor: c.diagram,
    strokeWidth: 2.5,
    dash: 1,
    name: 'cos',
  });
  tracerSin = wb.create('point', [state.angle, Math.sin(state.angle)], {
    name: 'sin',
    size: 4,
    fillColor: c.stamp,
    strokeColor: c.pointRing,
    fixed: true,
  });
  tracerCos = wb.create('point', [state.angle, Math.cos(state.angle)], {
    name: 'cos',
    size: 4,
    fillColor: c.diagram,
    strokeColor: c.pointRing,
    fixed: true,
  });
  const guide = wb.create(
    'line',
    [() => [state.angle, -2], () => [state.angle, 2]],
    { strokeColor: c.ink, dash: 2, strokeWidth: 1, name: 'θ 指示' },
  );

  state.styleBind = bindObjectStyleForPanel(
    document.getElementById('panel-math-trig'),
    createBoardSelectionController,
  );
  if (state.styleBind) {
    state.styleBind.wireBoard(
      cb,
      [origin, unit, state.glider, radiusSeg, sinSeg, cosSeg, ang],
      (el) => ({ label: el.name || undefined }),
    );
    state.styleBind.wireBoard(
      wb,
      [sinCurve, cosCurve, tracerSin, tracerCos, guide],
      (el) => ({ label: el.name || undefined }),
    );
  }

  cb.on('update', () => {
    let d = (Math.atan2(state.glider.Y(), state.glider.X()) * 180) / Math.PI;
    if (d < 0) d += 360;
    if (state.snap) {
      const snapped = snapSpecialDeg(d, 4);
      if (Math.abs(snapped - d) > 0.01) {
        state.angle = (snapped * Math.PI) / 180;
        state.glider.moveTo([Math.cos(state.angle), Math.sin(state.angle)], 0);
      } else {
        state.angle = (d * Math.PI) / 180;
      }
    } else {
      state.angle = (d * Math.PI) / 180;
    }
    tracerSin?.moveTo([state.angle, Math.sin(state.angle)], 0);
    tracerCos?.moveTo([state.angle, Math.cos(state.angle)], 0);
    renderReadout();
  });

  const specials = document.getElementById('mathTrigSpecials');
  if (specials && !specials.dataset.ready) {
    specials.innerHTML = [0, 30, 45, 60, 90, 120, 150, 180, 270]
      .map((x) => `<button type="button" class="chip" data-math-deg="${x}">${x}°</button>`)
      .join('');
    specials.dataset.ready = '1';
    specials.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-math-deg]');
      if (!btn) return;
      applyAngle(Number(btn.getAttribute('data-math-deg')));
    });
  }

  const trigPanel = document.getElementById('panel-math-trig');
  if (trigPanel && !trigPanel.dataset.mathBound) {
    trigPanel.dataset.mathBound = '1';
    document.getElementById('mathTrigSnap')?.addEventListener('change', (ev) => {
      state.snap = Boolean(ev.target.checked);
    });
    bindRangeNumber({
      range: /** @type {HTMLInputElement | null} */ (document.getElementById('mathTrigSlider')),
      number: /** @type {HTMLInputElement | null} */ (document.getElementById('mathTrigDegNum')),
      onChange: (v) => applyAngle(v),
      allowOutOfRange: false,
    });
  }

  state.ro = new ResizeObserver(() => {
    resizeMathBoard(cb, circleStage);
    resizeMathBoard(wb, waveStage);
  });
  state.ro.observe(circleStage);
  state.ro.observe(waveStage);
  state.themeHandle?.dispose?.();
  state.themeHandle = bindMathThemeRestyle(() => [state.circleBoard, state.waveBoard]);
  renderReadout();
  requestAnimationFrame(() => {
    resizeMathBoard(cb, circleStage);
    resizeMathBoard(wb, waveStage);
  });
}


/** @returns {import('../shared/lab-bridge.js').LabSnapshot | null} */
export function getLabSnapshot() {
  if (!state.circleBoard) return null;
  let d = (state.angle * 180) / Math.PI;
  d = normalizeDeg(d);
  const rad = (d * Math.PI) / 180;
  return {
    tab: 'trig',
    label: '三角函数',
    summary: `θ≈${d.toFixed(1)}° · sin=${Math.sin(rad).toFixed(4)} · cos=${Math.cos(rad).toFixed(4)}`,
    formula: `θ=${d.toFixed(1)}^\\circ`,
    params: { deg: d },
  };
}

/**
 * @param {import('../shared/lab-bridge.js').LabAction} action
 */
export function applyLabAction(action) {
  if (action.deg == null || !Number.isFinite(Number(action.deg))) {
    return { ok: false, message: '缺少角度' };
  }
  // applyAngle is defined below init; use local set
  const d = Number(action.deg);
  if (typeof applyAngle === 'function') {
    applyAngle(d);
  } else {
    state.angle = (normalizeDeg(d) * Math.PI) / 180;
    if (state.glider) {
      state.glider.moveTo([Math.cos(state.angle), Math.sin(state.angle)]);
    }
    renderReadout();
  }
  return { ok: true, message: action.label || `已转到 ${d}°` };
}

export function resizeTrig() {
  if (state.circleBoard && circleStage) resizeMathBoard(state.circleBoard, circleStage);
  if (state.waveBoard && waveStage) resizeMathBoard(state.waveBoard, waveStage);
}

export function disposeTrig() {
  state.themeHandle?.dispose?.();
  state.themeHandle = null;
  state.styleBind?.dispose?.();
  state.styleBind = null;
  state.ro?.disconnect();
  freeMathBoard(state.circleBoard);
  freeMathBoard(state.waveBoard);
  state.circleBoard = null;
  state.waveBoard = null;
  state.glider = null;
  tracerSin = null;
  tracerCos = null;
}
