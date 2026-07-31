/**
 * 数学参数数值气泡键盘（对标分步配平系数键盘 / brand-tip 气泡）
 *
 * 输入策略：打开/切到输入框后，首次数字/小数点为「整段替换」；
 * 之后同一会话内追加，直到 确定/关闭/切框。
 */

const BUBBLE_ID = 'mathNumKeypadBubble';

/** @type {HTMLInputElement | null} */
let activeInput = null;
/** @type {((e: Event) => void) | null} */
let outsideHandler = null;
let hideTimer = 0;
/** 下一次数字键是否整段替换当前值 */
let replaceOnNextType = true;

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function keypadInnerHtml() {
  const keys = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '±',
    '0',
    '.',
    '清空',
    '⌫',
    '确定',
  ];
  const btns = keys
    .map((k) => {
      const action = k === '清空' || k === '⌫' || k === '±' || k === '确定';
      const cls = action ? 'math-num-key is-action' : 'math-num-key';
      const wide = k === '清空' || k === '确定' ? ' is-wide' : '';
      return `<button type="button" class="${cls}${wide}" data-math-num-key="${escapeHtml(k)}">${escapeHtml(k)}</button>`;
    })
    .join('');
  return `
    <div class="brand-tip-card" id="mathNumKeypadCard">
      <div class="brand-tip-head">
        <span class="brand-tip-badge">输入数值</span>
        <button type="button" class="brand-tip-btn brand-tip-btn-close" data-math-num-keypad-dismiss>收起</button>
      </div>
      <div class="brand-tip-body math-num-keypad-body">
        <div class="math-num-keypad-grid">${btns}</div>
      </div>
    </div>
    <span class="brand-tip-arrow" aria-hidden="true"></span>`;
}

function ensureBubble() {
  let el = document.getElementById(BUBBLE_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = BUBBLE_ID;
  el.className = 'brand-tip-bubble math-num-keypad-bubble';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '输入数值');
  el.hidden = true;
  el.innerHTML = keypadInnerHtml();
  document.body.appendChild(el);

  el.querySelectorAll('[data-math-num-keypad-dismiss]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      // 收起时提交当前值
      if (activeInput) {
        activeInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      hideNumKeypad();
    });
  });

  el.addEventListener('mousedown', (e) => {
    // 防止点键时 input 失焦导致立刻收起
    e.preventDefault();
  });

  el.querySelectorAll('[data-math-num-key]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleKey(btn.getAttribute('data-math-num-key') || '');
    });
  });

  return el;
}

function positionBubble(anchor) {
  const el = ensureBubble();
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const gap = 12;
  const maxW = Math.min(280, window.innerWidth - 24);

  el.style.width = `${maxW}px`;
  el.style.maxWidth = `${maxW}px`;
  el.style.left = '0px';
  el.style.top = '0px';
  el.hidden = false;

  void el.offsetWidth;
  const bw = el.offsetWidth;
  const bh = el.offsetHeight;

  let left = rect.left;
  let top = rect.bottom + gap;
  let placeAbove = false;

  if (left + bw > window.innerWidth - 12) {
    left = Math.max(12, window.innerWidth - 12 - bw);
  }
  if (top + bh > window.innerHeight - 12 && rect.top - gap - bh > 12) {
    top = rect.top - gap - bh;
    placeAbove = true;
  }
  if (top < 12) top = 12;

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.dataset.place = placeAbove ? 'above' : 'below';

  const tipX = Math.min(Math.max(rect.left + rect.width / 2 - left, 28), bw - 28);
  el.style.setProperty('--tip-x', `${Math.round(tipX)}px`);
}

function unbindOutside() {
  if (outsideHandler) {
    document.removeEventListener('pointerdown', outsideHandler, true);
    outsideHandler = null;
  }
}

/**
 * 写回输入框并通知绑定逻辑
 * @param {string} next
 * @param {{ commit?: boolean }} [opts]
 */
function writeValue(next, opts = {}) {
  const input = activeInput;
  if (!input) return;
  input.value = next;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (opts.commit) {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function handleKey(k) {
  const input = activeInput;
  if (!input || !k) return;
  let v = String(input.value ?? '');

  if (k === '清空') {
    writeValue('');
    replaceOnNextType = true;
    return;
  }
  if (k === '⌫') {
    if (replaceOnNextType) {
      // 尚未开始输入：整段清掉
      writeValue('');
      replaceOnNextType = true;
      return;
    }
    writeValue(v.slice(0, -1));
    if (!input.value) replaceOnNextType = true;
    return;
  }
  if (k === '确定') {
    writeValue(v, { commit: true });
    hideNumKeypad();
    return;
  }
  if (k === '±') {
    if (replaceOnNextType) {
      // 在旧值上取反后进入编辑，下一位追加
      if (v.startsWith('-')) writeValue(v.slice(1) || '0');
      else if (v === '' || v === '0') writeValue('-');
      else writeValue(`-${v}`);
      replaceOnNextType = false;
      return;
    }
    if (v.startsWith('-')) writeValue(v.slice(1));
    else if (v === '' || v === '0' || v === '0.') writeValue(v === '' ? '-' : `-${v}`);
    else writeValue(`-${v}`);
    return;
  }
  if (k === '.') {
    if (replaceOnNextType) {
      writeValue('0.');
      replaceOnNextType = false;
      return;
    }
    if (v.includes('.')) return;
    if (v === '' || v === '-') writeValue(`${v}0.`);
    else writeValue(`${v}.`);
    return;
  }
  if (/^\d$/.test(k)) {
    if (replaceOnNextType) {
      writeValue(k);
      replaceOnNextType = false;
      return;
    }
    if (v === '0') writeValue(k);
    else if (v === '-0') writeValue(`-${k}`);
    else writeValue(v + k);
  }
}

/**
 * 数字键盘是否正在显示
 */
export function isNumKeypadOpen() {
  const el = document.getElementById(BUBBLE_ID);
  return Boolean(el && !el.hidden && el.classList.contains('is-visible'));
}

export function hideNumKeypad() {
  unbindOutside();
  const el = document.getElementById(BUBBLE_ID);
  if (!el) {
    activeInput = null;
    replaceOnNextType = true;
    return;
  }
  el.classList.remove('is-visible');
  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (!el.classList.contains('is-visible')) el.hidden = true;
    hideTimer = 0;
  }, 200);
  activeInput = null;
  replaceOnNextType = true;
}

/**
 * @param {HTMLInputElement} input
 */
export function showNumKeypad(input) {
  if (!(input instanceof HTMLInputElement)) return;
  const switched = activeInput !== input;
  activeInput = input;
  // 新打开或切换输入框：下一次数字整段替换
  if (switched || !isNumKeypadOpen()) {
    replaceOnNextType = true;
  }
  const el = ensureBubble();
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  }
  positionBubble(input);
  void el.offsetWidth;
  el.classList.add('is-visible');
  // 高于坐标轴设置等业务气泡（CSS 200），避免被挡住
  el.style.zIndex = '260';

  unbindOutside();
  outsideHandler = (e) => {
    const bubble = document.getElementById(BUBBLE_ID);
    const t = e.target;
    if (bubble?.contains(/** @type {Node} */ (t)) || t === activeInput) return;
    // 点到其它数值框：交给对方 focus 切换，不在这里抢收
    if (t instanceof HTMLInputElement && t.classList.contains('math-num-input')) return;
    // 提交当前值再关（仅关键盘；设置气泡由各自 outside 处理）
    if (activeInput) {
      activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    hideNumKeypad();
  };
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', outsideHandler, true);
  });
}

/**
 * 为容器内 .math-num-input 挂载气泡键盘
 * @param {ParentNode} [root]
 */
export function mountMathNumKeypads(root = document) {
  const scope = root.querySelectorAll ? root : document;
  const inputs = scope.querySelectorAll('.math-num-input');
  inputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    if (input.dataset.mathNumKeypadBound === '1') return;
    input.dataset.mathNumKeypadBound = '1';
    // 与配平系数框一致：点选弹出键盘；仍允许桌面直接键入
    input.setAttribute('inputmode', 'decimal');
    input.addEventListener('focus', () => showNumKeypad(input));
    input.addEventListener('click', () => showNumKeypad(input));
  });
}
