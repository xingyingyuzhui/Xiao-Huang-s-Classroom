/**
 * 品牌图标小知识 + 通用左上角气泡
 * 课堂提示/解答：持久气泡，重新生成 / 关闭，点外部关闭，不自动消失
 */

import { aiApi } from '../api/client.js';
import { getCurrentSubjectId } from '../../subjects/session.js';

const AUTO_HIDE_MS = 7000;
const MIN_LOADING_MS = 900;

const FALLBACK_TIPS_CHEM = [
  '可乐能除水垢，是因为其中的磷酸能与碳酸钙反应，把壶底的水垢慢慢溶解掉。',
  '不锈钢不易生锈，主要靠表面一层极薄的铬氧化物膜，把铁和空气、水隔开。',
  '切完洋葱爱流泪，是因为洋葱破损后释放的含硫气体刺激了眼睛。',
  '加碘盐里的碘多是碘酸钾；受潮、暴晒会损失，所以盐罐最好密封避光。',
  '铅笔芯其实是石墨和黏土，并不是铅；石墨质软、能留下痕迹才好写字。',
  '胃药里常见的小苏打是碳酸氢钠，能和过多的胃酸中和，暂时缓解不适。',
  '钻石和铅笔芯的主要成分都是碳，只是原子排列方式不同，性质天差地别。',
  '肥皂能去油，是因为一端亲水、一端亲油，把油污包裹成小液滴冲走。',
  '铁锈主要是含水氧化铁；铁在潮湿空气中更易锈，所以要保持干燥或涂层保护。',
  '柠檬能让茶水变浅，是因为酸性会改变茶中色素分子的颜色表现。',
];

const FALLBACK_TIPS_MATH = [
  '二次函数顶点公式 x=-b/(2a)，对称轴和最值常常一起出现。',
  '判别式 Δ=b²-4ac：大于 0 两个实根，等于 0 重根，小于 0 没有实根。',
  '单位圆上 cos 是 x、sin 是 y，所以 sin²θ+cos²θ 恒等于 1。',
  '对数和指数互为反函数，就像加减、乘除是一对逆运算。',
  '等差数列求和像首尾配对：Sₙ = n(a₁+aₙ)/2。',
  '反比例 y=k/x 的图象是双曲线，k 的符号决定落在哪两个象限。',
  '绝对值 |x-a| 表示数轴上到 a 的距离，图象常是 V 字平移。',
  '正弦型函数 y=A sin(ωx+φ) 里，A 振幅、ω 管周期、φ 是初相。',
  '指数底数大于 1 时增长很快，这和复利、传播模型是同一类味道。',
  '函数奇偶性：f(-x)=f(x) 偶函数对称 y 轴；f(-x)=-f(x) 奇函数对称原点。',
];

let bubbleEl = null;
let hideTimer = 0;
let loading = false;
let outsideHandler = null;
let lastFallbackIdx = -1;
let seq = 0;
/** @type {null | (() => void | Promise<void>)} */
let regenerateHandler = null;
let currentAnchor = null;

function subjectTipMeta() {
  const sid = getCurrentSubjectId() || 'chemistry';
  if (sid === 'math') {
    return {
      subjectId: 'math',
      tips: FALLBACK_TIPS_MATH,
      badge: '课间一句话',
      title: '点我听一条数学小知识',
      aria: '点击获取数学小知识',
      failLog: '数学小知识请求失败，使用前端本地兜底',
    };
  }
  return {
    subjectId: 'chemistry',
    tips: FALLBACK_TIPS_CHEM,
    badge: '课间一句话',
    title: '点我听一条化学小知识',
    aria: '点击获取化学小知识',
    failLog: '化学小知识请求失败，使用前端本地兜底',
  };
}

function pickFallback() {
  const { tips } = subjectTipMeta();
  if (tips.length === 1) return tips[0];
  let i = Math.floor(Math.random() * tips.length);
  if (i === lastFallbackIdx) i = (i + 1) % tips.length;
  lastFallbackIdx = i;
  return tips[i];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureBubble() {
  if (bubbleEl) return bubbleEl;
  bubbleEl = document.createElement('div');
  bubbleEl.id = 'brandTipBubble';
  bubbleEl.className = 'brand-tip-bubble';
  bubbleEl.setAttribute('role', 'status');
  bubbleEl.setAttribute('aria-live', 'polite');
  bubbleEl.hidden = true;
  document.body.appendChild(bubbleEl);
  return bubbleEl;
}

function clearHideTimer() {
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  }
}

function unbindOutside() {
  if (outsideHandler) {
    document.removeEventListener('pointerdown', outsideHandler, true);
    outsideHandler = null;
  }
}

export function hideBrandTip() {
  clearHideTimer();
  unbindOutside();
  regenerateHandler = null;
  const el = ensureBubble();
  el.classList.remove('is-visible', 'is-loading', 'is-scrollable', 'has-actions');
  window.setTimeout(() => {
    if (!el.classList.contains('is-visible')) el.hidden = true;
  }, 200);
}

function positionBubble(anchor) {
  const el = ensureBubble();
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const gap = 14;
  const maxW = Math.min(400, window.innerWidth - 24);

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

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.dataset.place = placeAbove ? 'above' : 'below';

  const tipX = Math.min(Math.max(rect.left + rect.width / 2 - left, 28), bw - 28);
  el.style.setProperty('--tip-x', `${Math.round(tipX)}px`);
}

/**
 * @param {HTMLElement} anchor
 * @param {object} opts
 */
function showBubble(anchor, opts) {
  const el = ensureBubble();
  clearHideTimer();
  unbindOutside();
  currentAnchor = anchor;

  const {
    mode,
    text = '',
    source = 'ai',
    note = '',
    badge = '课间一句话',
    sourceLabel: sourceLabelOpt,
    duration = AUTO_HIDE_MS,
    scrollable = false,
    loadingText = '老师想一想……',
    showActions = false,
    onRegenerate = null,
  } = opts;
  const isLoading = mode === 'loading';

  regenerateHandler = typeof onRegenerate === 'function' ? onRegenerate : null;

  el.classList.toggle('is-loading', isLoading);
  el.classList.toggle('is-scrollable', Boolean(scrollable) && !isLoading);
  el.classList.toggle('has-actions', Boolean(showActions) && !isLoading);

  if (isLoading) {
    el.innerHTML = `
      <div class="brand-tip-card">
        <div class="brand-tip-head">
          <span class="brand-tip-badge">${escapeHtml(badge)}</span>
        </div>
        <div class="brand-tip-body brand-tip-body-loading">
          <span class="brand-tip-spinner" aria-hidden="true"></span>
          <p class="brand-tip-text">${escapeHtml(loadingText)}</p>
        </div>
      </div>
      <span class="brand-tip-arrow" aria-hidden="true"></span>
    `;
  } else {
    const sourceLabel =
      sourceLabelOpt || (source === 'ai' ? 'AI · DeepSeek' : '本地小知识');
    const sourceClass = source === 'ai' ? 'is-ai' : 'is-local';
    const canRegen = showActions && typeof onRegenerate === 'function';
    const actionsHtml =
      showActions
        ? `<div class="brand-tip-actions">
            ${
              canRegen
                ? `<button type="button" class="brand-tip-btn brand-tip-btn-regen" data-tip-act="regen">重新生成</button>`
                : ''
            }
            <button type="button" class="brand-tip-btn brand-tip-btn-close" data-tip-act="close">关闭</button>
          </div>`
        : '';
    el.innerHTML = `
      <div class="brand-tip-card">
        <div class="brand-tip-head">
          <span class="brand-tip-badge">${escapeHtml(badge)}</span>
          <span class="brand-tip-source ${sourceClass}">${escapeHtml(sourceLabel)}</span>
        </div>
        <div class="brand-tip-body">
          <p class="brand-tip-text">${escapeHtml(text)}</p>
          ${note ? `<p class="brand-tip-note">${escapeHtml(note)}</p>` : ''}
          ${actionsHtml}
        </div>
      </div>
      <span class="brand-tip-arrow" aria-hidden="true"></span>
    `;

    el.querySelector('[data-tip-act="close"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideBrandTip();
    });
    el.querySelector('[data-tip-act="regen"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!regenerateHandler) return;
      try {
        await regenerateHandler();
      } catch (err) {
        console.warn('重新生成失败', err);
      }
    });
  }

  el.hidden = false;
  el.classList.remove('is-visible');
  requestAnimationFrame(() => {
    el.classList.add('is-visible');
    positionBubble(anchor);
  });

  outsideHandler = (e) => {
    if (el.contains(e.target)) return;
    if (anchor && anchor.contains(e.target)) return;
    hideBrandTip();
  };
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', outsideHandler, true);
  });

  // duration > 0 才自动关；课堂提示/解答传 0
  if (!isLoading && duration > 0) {
    hideTimer = window.setTimeout(() => hideBrandTip(), duration);
  }
}

/**
 * 通用气泡
 * @param {{ title?: string, text?: string, loading?: boolean, duration?: number, scrollable?: boolean, source?: string, persistent?: boolean, onRegenerate?: function, showActions?: boolean, loadingText?: string }} opts
 */
export function showAppBubble(opts = {}) {
  const anchor = document.getElementById('appBrandIcon');
  if (!anchor) return;
  const {
    title = '课堂',
    text = '',
    loading = false,
    duration,
    scrollable = true,
    source = 'ai',
    persistent = false,
    onRegenerate = null,
    showActions = false,
    loadingText = '老师想一想……',
  } = opts;

  const autoMs = persistent ? 0 : duration !== undefined ? duration : 10000;
  // 持久气泡默认有关闭；是否有「重新生成」取决于 onRegenerate
  const actions = persistent || showActions || typeof onRegenerate === 'function';

  if (loading) {
    showBubble(anchor, {
      mode: 'loading',
      badge: title,
      loadingText,
      duration: 0,
    });
    return;
  }

  showBubble(anchor, {
    mode: 'ready',
    badge: title,
    text,
    source,
    duration: autoMs,
    scrollable,
    showActions: actions,
    onRegenerate,
  });
}

function syncBrandTipA11y(icon) {
  if (!icon) return;
  const meta = subjectTipMeta();
  icon.setAttribute('title', meta.title);
  icon.setAttribute('aria-label', meta.aria);
}

async function onBrandClick(anchor) {
  if (loading) return;
  loading = true;
  const mySeq = ++seq;
  const meta = subjectTipMeta();
  syncBrandTipA11y(anchor);

  showBubble(anchor, { mode: 'loading', badge: meta.badge, duration: 0 });
  const t0 = performance.now();

  let tip = '';
  let source = 'ai';

  try {
    // withAiSubject 会带上当前学科；数学教室 → subjectId=math
    const data = await aiApi.tip();
    tip = (data?.tip || '').trim();
    source = data?.source === 'local' ? 'local' : 'ai';
    if (!tip) {
      tip = pickFallback();
      source = 'local';
    }
  } catch (err) {
    console.warn(`${meta.failLog}:`, err?.message || err);
    tip = pickFallback();
    source = 'local';
  }

  const elapsed = performance.now() - t0;
  if (elapsed < MIN_LOADING_MS) await sleep(MIN_LOADING_MS - elapsed);

  if (mySeq !== seq) {
    loading = false;
    return;
  }

  // 课间小知识：可自动消失，无重新生成按钮
  showBubble(anchor, {
    mode: 'ready',
    badge: meta.badge,
    text: tip,
    source,
    duration: AUTO_HIDE_MS,
    showActions: false,
  });
  loading = false;
}

export function initBrandTip() {
  const icon = document.getElementById('appBrandIcon');
  if (!icon) return;

  icon.classList.add('brand-mark-clickable');
  icon.setAttribute('role', 'button');
  icon.setAttribute('tabindex', '0');
  syncBrandTipA11y(icon);

  const trigger = () => {
    syncBrandTipA11y(icon);
    onBrandClick(icon);
  };

  icon.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    trigger();
  });

  icon.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideBrandTip();
  });

  window.addEventListener('resize', () => {
    if (bubbleEl && bubbleEl.classList.contains('is-visible') && currentAnchor) {
      positionBubble(currentAnchor);
    }
  });
}
