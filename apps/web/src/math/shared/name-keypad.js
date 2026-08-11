/**
 * 对象短名分段键盘：样式词表 / 字母 / 数字
 * 气泡形态对齐 math-num-keypad / brand-tip。
 */

import { nameStylesForKind } from './name-segments.js';

const BUBBLE_ID = 'mathNameKeypadBubble';

/** @type {HTMLElement | null} */
let bubbleEl = null;
/** @type {((e: Event) => void) | null} */
let outsideHandler = null;
/** @type {number} */
let outsideRaf = 0;
/** @type {null | { mode: 'style' | 'letter' | 'number', kind: 'point' | 'line', onPick: (value: string) => void, onClear?: () => void }} */
let session = null;
let letterUpper = true;

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {'style' | 'letter' | 'number'} mode
 * @param {'point' | 'line'} kind
 */
function bodyHtml(mode, kind) {
  if (mode === 'style') {
    const words = nameStylesForKind(kind);
    const chips = words
      .map(
        (word) =>
          `<button type="button" class="chip math-name-style-chip" data-name-pick="${escapeHtml(word)}">${escapeHtml(word)}</button>`,
      )
      .join('');
    return `<div class="math-chip-row math-name-style-grid" role="group" aria-label="选择样式">${chips}</div>`;
  }
  if (mode === 'letter') {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const keys = letters
      .map((ch) => {
        const out = letterUpper ? ch : ch.toLowerCase();
        return `<button type="button" class="math-num-key" data-name-pick="${out}">${out}</button>`;
      })
      .join('');
  return `<div class="math-name-keypad-grid math-name-keypad-grid--letters">${keys}
    <button type="button" class="math-num-key is-action" data-name-action="case">Aa</button>
    <button type="button" class="math-num-key is-action" data-name-action="clear">清空</button>
  </div>`;
  }
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '清空', '0', '⌫'];
  const keys = digits
    .map((d) => {
      const action = d === '清空' || d === '⌫';
      const cls = action ? 'math-num-key is-action' : 'math-num-key';
      const wide = d === '清空' ? ' is-wide' : '';
      return `<button type="button" class="${cls}${wide}" data-name-pick="${escapeHtml(d)}">${escapeHtml(d)}</button>`;
    })
    .join('');
  return `<div class="math-name-keypad-grid math-name-keypad-grid--digits">${keys}</div>`;
}

function titleForMode(mode) {
  if (mode === 'style') return '选择样式';
  if (mode === 'letter') return '选择字母';
  return '选择数字';
}

function ensureBubble() {
  if (bubbleEl) return bubbleEl;
  bubbleEl = document.createElement('div');
  bubbleEl.id = BUBBLE_ID;
  bubbleEl.className = 'brand-tip-bubble math-name-keypad-bubble';
  bubbleEl.setAttribute('role', 'dialog');
  bubbleEl.hidden = true;
  document.body.appendChild(bubbleEl);

  bubbleEl.addEventListener('mousedown', (e) => e.preventDefault());
  bubbleEl.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest?.('[data-name-pick],[data-name-action]');
    if (!btn || !bubbleEl?.contains(btn)) return;
    e.preventDefault();
    e.stopPropagation();
    const action = btn.getAttribute('data-name-action');
    if (action === 'case') {
      letterUpper = !letterUpper;
      if (session) renderSession(session);
      return;
    }
    if (action === 'clear') {
      session?.onClear?.();
      hideNameKeypad();
      return;
    }
    const pick = btn.getAttribute('data-name-pick') || '';
    if (!pick || !session) return;
    if (session.mode === 'number' && pick === '清空') {
      session.onClear?.();
      hideNameKeypad();
      return;
    }
    if (session.mode === 'number' && pick === '⌫') {
      session.onPick('⌫');
      return;
    }
    session.onPick(pick);
    hideNameKeypad();
  });

  bubbleEl.addEventListener('click', (e) => {
    const dismiss = /** @type {HTMLElement} */ (e.target).closest?.('[data-name-keypad-dismiss]');
    if (!dismiss) return;
    e.preventDefault();
    hideNameKeypad();
  });

  return bubbleEl;
}

/**
 * @param {NonNullable<typeof session>} cfg
 */
function renderSession(cfg) {
  const el = ensureBubble();
  el.innerHTML = `
    <div class="brand-tip-card">
      <div class="brand-tip-head">
        <span class="brand-tip-badge">${escapeHtml(titleForMode(cfg.mode))}</span>
        <button type="button" class="brand-tip-btn brand-tip-btn-close" data-name-keypad-dismiss>收起</button>
      </div>
      <div class="brand-tip-body math-name-keypad-body">
        ${bodyHtml(cfg.mode, cfg.kind)}
      </div>
    </div>
    <span class="brand-tip-arrow" aria-hidden="true"></span>`;
}

function unbindOutside() {
  if (outsideRaf) {
    if (typeof window !== 'undefined') window.cancelAnimationFrame(outsideRaf);
    outsideRaf = 0;
  }
  if (outsideHandler) {
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', outsideHandler, true);
    }
    outsideHandler = null;
  }
}

/**
 * @param {HTMLElement} anchor
 */
function positionBubble(anchor) {
  const el = ensureBubble();
  const rect = anchor.getBoundingClientRect();
  const gap = 10;
  const pad = 10;
  el.hidden = false;
  void el.offsetWidth;
  const bw = el.offsetWidth || 260;
  const bh = el.offsetHeight || 220;
  let left = rect.left;
  let top = rect.bottom + gap;
  if (left + bw > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - bw - pad);
  if (top + bh > window.innerHeight - pad && rect.top - gap - bh > pad) {
    top = rect.top - gap - bh;
    el.dataset.place = 'above';
  } else {
    el.dataset.place = 'below';
  }
  if (top < pad) top = pad;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.style.zIndex = '270';
  el.classList.add('is-visible');
}

export function isNameKeypadOpen() {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById(BUBBLE_ID);
  return Boolean(el && !el.hidden && el.classList.contains('is-visible'));
}

export function hideNameKeypad() {
  unbindOutside();
  session = null;
  if (typeof document === 'undefined') return;
  const el = document.getElementById(BUBBLE_ID);
  if (el) {
    el.classList.remove('is-visible');
    el.hidden = true;
  }
}

/**
 * @param {{
 *   anchor: HTMLElement,
 *   mode: 'style' | 'letter' | 'number',
 *   kind: 'point' | 'line',
 *   onPick: (value: string) => void,
 *   onClear?: () => void,
 * }} opts
 */
export function showNameKeypad(opts) {
  if (!opts?.anchor) return;
  session = {
    mode: opts.mode,
    kind: opts.kind,
    onPick: opts.onPick,
    onClear: opts.onClear,
  };
  if (opts.mode === 'letter') letterUpper = true;
  renderSession(session);
  positionBubble(opts.anchor);
  unbindOutside();
  outsideHandler = (e) => {
    const bubble = document.getElementById(BUBBLE_ID);
    const t = e.target;
    if (bubble?.contains(/** @type {Node} */ (t)) || t === opts.anchor) return;
    hideNameKeypad();
  };
  outsideRaf = window.requestAnimationFrame(() => {
    outsideRaf = 0;
    if (!outsideHandler) return;
    document.addEventListener('pointerdown', outsideHandler, true);
  });
}
