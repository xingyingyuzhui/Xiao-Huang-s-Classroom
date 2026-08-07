/**
 * GraphReadouts：特征卡、值表、数值分析、探针读数的 DOM 输出。
 *
 * 通过注入工作（evaluator/theme/board/store/active 函数），不拥有文档真值；
 * alignFeatureLabelWidths 由调用方（frame 内）在 DOM 写完后执行一次。
 */

import { keyFeatures } from './model.js';
import { presetValueTable as valueTable } from './function-analysis.js';
import { describePresetTransform } from './transform-model.js';
import { alignFeatureLabelWidths } from './graph-renderer.js';

/** @param {number} value */
function formatNum(value) {
  if (!Number.isFinite(value)) return '—';
  const f = Number(value.toFixed(3));
  return Object.is(f, -0) ? '0' : String(f);
}

/** @param {number} value */
function formatProbeNumber(value) {
  if (!Number.isFinite(value)) return '—';
  const f = Number(value.toFixed(2));
  return Object.is(f, -0) ? '0' : String(f);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{
 *   getState: () => any,
 *   evalFnY: (fn: any, x: number) => number | null,
 *   fnDisplayLabel: (fn: any) => string,
 * }} context
 */
export function createGraphReadouts(context) {
  const { getState, evalFnY, fnDisplayLabel } = context;

  /** 自定义函数：异步数值特征分析（取消 + 缓存 + 数值近似标记）。 */
  function renderCustomNumericFeatures(fn, featuresEl) {
    const state = getState();
    if (!featuresEl) return;
    state.numericRequest?.();
    state.numericRequest = null;
    let xMin = -10;
    let xMax = 10;
    try {
      const bb = state.board?.getBoundingBox?.();
      if (bb && bb.length >= 4) {
        xMin = Math.min(Number(bb[0]), Number(bb[2]));
        xMax = Math.max(Number(bb[0]), Number(bb[2]));
      }
    } catch {
      /* viewport default */
    }
    featuresEl.innerHTML =
      '<div class="math-float-feat-row"><strong>分析中…</strong><span>数值近似</span></div>';
    alignFeatureLabelWidths(featuresEl);
    state.numericRequest = state.numericRunner?.analyze?.({
      record: fn,
      interval: [xMin, xMax],
      resolveEvaluator: (rec) => (x) => evalFnY(rec, x),
      onResult: (outcome) => {
        const active = state.functions.find((f) => f.id === state.activeFnId) || state.functions[0] || null;
        if (active?.id !== fn.id) return;
        if (!outcome?.ok || !outcome.result) {
          featuresEl.innerHTML =
            '<div class="math-float-feat-row"><strong>类型</strong><span>自定义 · 无结果</span></div>';
          alignFeatureLabelWidths(featuresEl);
          return;
        }
        const r = outcome.result;
        const rows = [
          '<div class="math-float-feat-row"><strong>类型</strong><span>自定义 · 数值近似</span></div>',
          ...r.zeros.map((z) => `<div class="math-float-feat-row"><strong>零点</strong><span>x≈${formatNum(z.x)}</span></div>`),
          ...r.extrema.map((e) => `<div class="math-float-feat-row"><strong>${e.kind === 'min' ? '极小值' : '极大值'}</strong><span>(${formatNum(e.x)}, ${formatNum(e.y)})</span></div>`),
          ...(r.discontinuities.length
            ? [`<div class="math-float-feat-row"><strong>疑似间断</strong><span>${r.discontinuities.length} 处</span></div>`]
            : []),
          '<div class="math-float-feat-row is-warn"><strong>提示</strong><span>当前结果为数值近似，部分特征可能未识别</span></div>',
        ];
        featuresEl.innerHTML = rows.join('');
        alignFeatureLabelWidths(featuresEl);
      },
    });
  }

  function renderCompareInfo(fn, featuresEl) {
    const state = getState();
    if (!featuresEl) return;
    const ref = state.graphStore?.getDocument?.()?.presentation?.compare?.reference;
    if (!ref) return;
    const currentFormula = fn ? fnDisplayLabel(fn) : '';
    const refFormula = fnDisplayLabel(ref);
    const changes =
      fn && fn.kind === 'preset' && ref.kind === 'preset'
        ? describePresetTransform(fn.preset, ref.coeffs || {}, fn.coeffs || {})
        : [];
    const block = document.createElement('div');
    block.className = 'math-compare-block';
    block.innerHTML = `
      <div class="math-compare-row"><strong>参考</strong><span>${escapeHtml(refFormula)}</span></div>
      <div class="math-compare-row"><strong>当前</strong><span>${escapeHtml(currentFormula)}</span></div>
      ${changes.length ? `<ul class="math-compare-changes">${changes.map((c) => `<li>${escapeHtml(c.text)}</li>`).join('')}</ul>` : ''}
    `;
    featuresEl.appendChild(block);
  }

  /** 特征卡 + 对应表 + 探针读数（活动函数变化时调用一次）。 */
  function paintReadouts() {
    const state = getState();
    const fn = state.functions.find((f) => f.id === state.activeFnId) || state.functions[0] || null;
    const featuresEl = document.getElementById('mathGraphFeatures');
    const tableEl = document.getElementById('mathGraphValueTable');

    if (!fn) {
      if (featuresEl) featuresEl.innerHTML = '';
      if (tableEl) tableEl.innerHTML = '';
      return;
    }

    if (fn.kind === 'custom') {
      renderCustomNumericFeatures(fn, featuresEl);
      if (tableEl) {
        const xs = [-2, -1, 0, 1, 2, 3];
        const rows = xs.map((x) => {
          const y = evalFnY(fn, x);
          return { x, y: y == null || !Number.isFinite(y) ? null : y };
        });
        tableEl.innerHTML = `
        <table class="math-value-table math-value-table-lg">
          <thead><tr><th>x</th><th>f(x)</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) =>
                  `<tr><td>${r.x}</td><td>${r.y == null ? '—' : Number(r.y.toFixed(3))}</td></tr>`,
              )
              .join('')}
          </tbody>
        </table>`;
      }
      return;
    }

    const preset = /** @type {any} */ (fn.preset || state.preset);
    const coeffs = fn.coeffs || state.coeffs;
    if (featuresEl) {
      featuresEl.innerHTML = keyFeatures(preset, coeffs)
        .map(
          (f) =>
            `<div class="math-float-feat-row"><strong>${f.kind}</strong><span>${f.text}</span></div>`,
        )
        .join('');
      alignFeatureLabelWidths(featuresEl);
      renderCompareInfo(fn, featuresEl);
    }
    if (tableEl) {
      const rows = valueTable(preset, coeffs);
      tableEl.innerHTML = `
        <table class="math-value-table math-value-table-lg">
          <thead><tr><th>x</th><th>f(x)</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) =>
                  `<tr><td>${r.x}</td><td>${r.y == null ? '—' : Number(r.y.toFixed(3))}</td></tr>`,
              )
              .join('')}
          </tbody>
        </table>`;
    }
  }

  /** 探针读数：在活动函数对应表上方显示当前 x/y（transient，不进文档） */
  function renderProbeReadout(samples, x) {
    const row = document.getElementById('mathGraphProbeReadout');
    if (!row) return;
    if (x == null || !samples || !samples.length) {
      row.textContent = '';
      row.hidden = true;
      return;
    }
    const active = samples.find((s) => s.valid);
    if (!active) {
      row.textContent = '曲线外';
      row.hidden = false;
      return;
    }
    row.textContent = `${active.label}  x=${formatProbeNumber(active.x)}  y=${formatProbeNumber(active.y)}`;
    row.hidden = false;
  }

  return { paintReadouts, renderProbeReadout };
}
