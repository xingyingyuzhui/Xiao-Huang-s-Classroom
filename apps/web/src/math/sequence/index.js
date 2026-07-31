/**
 * 数列可视化：点列 + 折线 + 柱高（形象）
 */

import { createMathBoard, freeMathBoard, resizeMathBoard } from '../shared/jsx-board.js';
import { bindMathThemeRestyle } from '../shared/board-lifecycle.js';
import { getMathBoardChrome, readCssVar } from '../shared/math-theme.js';
import { renderTex } from '../shared/tex.js';
import { sequenceTerms, formulaTex, partialSum } from './model.js';
import { bindRangeNumber, syncRangeNumber } from '../shared/param-controls.js';
import { createBoardSelectionController } from '../shared/object-select.js';
import { bindObjectStyleForPanel } from '../shared/object-style-panel.js';

/** @type {{ board: any, objects: any[], kind: 'arith'|'geom', a1: number, step: number, n: number, ro: ResizeObserver | null, styleBind: any, themeHandle: { dispose: () => void } | null }} */
const state = {
  board: null,
  objects: [],
  kind: 'arith',
  a1: 2,
  step: 3,
  n: 8,
  ro: null,
  styleBind: null,
  themeHandle: null,
};

let stageEl = null;

function colors() {
  const c = getMathBoardChrome();
  return {
    stamp: c.stamp,
    diagram: c.diagram,
    paper: c.paper,
    pointRing: c.pointRing,
    soft: readCssVar('--stamp-soft', '#fde68a'),
  };
}

function clearObjects() {
  const board = state.board;
  if (!board) return;
  for (const o of state.objects) {
    try {
      board.removeObject(o);
    } catch {
      /* */
    }
  }
  state.objects = [];
}

function rebuild() {
  const board = state.board;
  if (!board) return;
  const c = colors();
  clearObjects();

  const terms = sequenceTerms(state.kind, state.a1, state.step, state.n);
  const maxY = Math.max(...terms.map((t) => Math.abs(t)), 1);
  const padY = maxY * 0.25;
  board.setBoundingBox([-0.8, maxY + padY, state.n + 1.2, -padY - maxY * 0.05], false);

  // bars (形象：项的「高度」)
  for (let i = 0; i < terms.length; i += 1) {
    const k = i + 1;
    const y = terms[i];
    const bar = board.create(
      'polygon',
      [
        [k - 0.28, 0],
        [k + 0.28, 0],
        [k + 0.28, y],
        [k - 0.28, y],
      ],
      {
        fillColor: c.soft,
        fillOpacity: 0.85,
        borders: { strokeWidth: 0 },
        vertices: { visible: false },
        highlight: false,
      },
    );
    state.objects.push(bar);
  }

  // polyline connecting tops
  const pts = [];
  for (let i = 0; i < terms.length; i += 1) {
    const p = board.create('point', [i + 1, terms[i]], {
      name: `a_{${i + 1}}`,
      size: 4,
      fillColor: c.stamp,
      strokeColor: c.pointRing,
      fixed: true,
      label: { fontSize: 11, offset: [0, 14] },
    });
    pts.push(p);
    state.objects.push(p);
  }
  if (pts.length >= 2) {
    const poly = board.create('polygonalchain', pts, {
      strokeColor: c.diagram,
      strokeWidth: 2.5,
      borders: { strokeColor: c.diagram },
      name: '折线',
    });
    state.objects.push(poly);
  }

  state.styleBind?.selection?.clear?.();
  if (state.styleBind && state.board) {
    state.styleBind.selection.registerMany(state.objects, (el) => ({
      label: el.name || undefined,
    }));
  }

  const tex = formulaTex(state.kind, state.a1, state.step, state.n);
  const box = document.getElementById('mathSeqFormulas');
  if (box) {
    box.innerHTML = `
      <div class="math-stat-row math-stat-emphasis"><strong>通项</strong><div class="math-tex" data-g></div></div>
      <div class="math-stat-row math-stat-emphasis"><strong>前 n 项和</strong><div class="math-tex" data-s></div></div>
      <div class="math-stat-row"><strong>当前</strong><div class="math-tex" data-v></div></div>
    `;
    renderTex(box.querySelector('[data-g]'), tex.general, true);
    renderTex(box.querySelector('[data-s]'), tex.sum, true);
    renderTex(box.querySelector('[data-v]'), tex.value, true);
  }

  const list = document.getElementById('mathSeqList');
  if (list) {
    list.innerHTML = `<p class="math-mono math-seq-terms">${terms
      .map((t, i) => `a<sub>${i + 1}</sub>=${Number(t.toFixed(4))}`)
      .join('， ')}</p>`;
  }

  board.update();
}

export function initSequenceUI() {
  stageEl = document.getElementById('mathSeqStage');
  if (!stageEl || !document.getElementById('mathSeqBoard')) return;
  if (state.board) {
    resizeMathBoard(state.board, stageEl);
      return;
  }

  state.board = createMathBoard('mathSeqBoard', {
    boundingbox: [-1, 30, 10, -2],
    keepaspectratio: false,
    showNavigation: true,
  });

  const seqPanel = document.getElementById('panel-math-sequence');
  if (seqPanel && !seqPanel.dataset.mathBound) {
    seqPanel.dataset.mathBound = '1';
    seqPanel.querySelectorAll('[data-math-seq-kind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.kind = /** @type {any} */ (btn.getAttribute('data-math-seq-kind'));
        seqPanel.querySelectorAll('[data-math-seq-kind]').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        const stepLabel = document.getElementById('mathSeqStepLabel');
        if (stepLabel) {
          stepLabel.querySelector('.math-slider-name').textContent =
            state.kind === 'arith' ? '公差 d' : '公比 q';
        }
        if (state.kind === 'geom' && Math.abs(state.step) < 1e-6) state.step = 2;
        if (state.kind === 'geom') {
          state.a1 = 1;
          state.step = 2;
          state.n = 7;
        } else {
          state.a1 = 2;
          state.step = 3;
          state.n = 8;
        }
        syncInputs();
        rebuild();
      });
    });

    for (const [id, key, numId] of [
      ['mathSeqA1', 'a1', 'mathSeqA1Num'],
      ['mathSeqStep', 'step', 'mathSeqStepNum'],
      ['mathSeqN', 'n', 'mathSeqNNum'],
    ]) {
      bindRangeNumber({
        range: /** @type {HTMLInputElement | null} */ (document.getElementById(id)),
        number: /** @type {HTMLInputElement | null} */ (document.getElementById(numId)),
        onChange: (v) => {
          if (key === 'n') state.n = Math.max(1, Math.min(40, Math.floor(v)));
          else state[key] = v;
          rebuild();
        },
      });
    }
  }

  state.styleBind = bindObjectStyleForPanel(
    document.getElementById('panel-math-sequence'),
    createBoardSelectionController,
  );
  state.styleBind?.selection?.attachBoard?.(state.board);

  syncInputs();
  rebuild();
  state.ro = new ResizeObserver(() => resizeMathBoard(state.board, stageEl));
  state.ro.observe(stageEl);
  state.themeHandle?.dispose?.();
  state.themeHandle = bindMathThemeRestyle(() => state.board, {
    onAfterRestyle: () => {
      try {
        rebuild();
      } catch {
        /* */
      }
    },
  });
  requestAnimationFrame(() => resizeMathBoard(state.board, stageEl));
}


/** @returns {import('../shared/lab-bridge.js').LabSnapshot | null} */
export function getLabSnapshot() {
  if (!state.board) return null;
  const tex = formulaTex(state.kind, state.a1, state.step, state.n);
  const Sn = partialSum(state.kind, state.a1, state.step, state.n);
  return {
    tab: 'sequence',
    label: '数列',
    summary: `${state.kind === 'arith' ? '等差' : '等比'} · a₁=${state.a1} · ${
      state.kind === 'arith' ? 'd' : 'q'
    }=${state.step} · n=${state.n} · Sₙ≈${Sn.toFixed(3)}`,
    formula: tex.general,
    params: {
      kind: state.kind,
      a1: state.a1,
      step: state.step,
      n: state.n,
      Sn,
    },
  };
}

/**
 * @param {import('../shared/lab-bridge.js').LabAction} action
 */
export function applyLabAction(action) {
  if (action.kind === 'arith' || action.kind === 'geom') state.kind = action.kind;
  if (action.a1 != null) state.a1 = Number(action.a1);
  if (action.step != null) state.step = Number(action.step);
  if (action.n != null) state.n = Math.max(3, Math.min(16, Math.floor(Number(action.n))));
  const seqPanel = document.getElementById('panel-math-sequence');
  seqPanel?.querySelectorAll('[data-math-seq-kind]').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-math-seq-kind') === state.kind);
  });
  const stepLabel = document.getElementById('mathSeqStepLabel');
  if (stepLabel) {
    const name = stepLabel.querySelector('.math-slider-name');
    if (name) name.textContent = state.kind === 'arith' ? '公差 d' : '公比 q';
  }
  syncInputs();
  rebuild();
  return { ok: true, message: action.label || '已应用到数列' };
}

function syncInputs() {
  for (const [id, key, numId] of [
    ['mathSeqA1', 'a1', 'mathSeqA1Num'],
    ['mathSeqStep', 'step', 'mathSeqStepNum'],
    ['mathSeqN', 'n', 'mathSeqNNum'],
  ]) {
    syncRangeNumber(
      /** @type {HTMLInputElement | null} */ (document.getElementById(id)),
      /** @type {HTMLInputElement | null} */ (document.getElementById(numId)),
      state[key],
    );
  }
}

export function resizeSequence() {
  if (state.board && stageEl) resizeMathBoard(state.board, stageEl);
}

export function disposeSequence() {
  state.themeHandle?.dispose?.();
  state.themeHandle = null;
  state.styleBind?.dispose?.();
  state.styleBind = null;
  state.ro?.disconnect();
  freeMathBoard(state.board);
  state.board = null;
  state.objects = [];
}
