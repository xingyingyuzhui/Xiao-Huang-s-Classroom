/**
 * 对象样式气泡（全局单例）
 *
 * 各 lab Tab 都会 bind 一次；DOM 与控件事件只初始化一次，
 * 避免「只有第一个打开的 Tab 能改样式」的闭包错绑。
 */

import {
  applyObjectStyle,
  COLOR_PRESETS,
  DASH_STYLES,
  kindLabel,
  readObjectStyle,
} from './object-style.js';

const BUBBLE_ID = 'mathObjectStyleBubble';

/** @type {ReturnType<typeof buildBubbleApi> | null} */
let bubbleApi = null;

/**
 * 当前占用气泡的 selection（outside/收起时 clear 它）
 * @type {import('./object-select.js').BoardSelectionController | null}
 */
let activeSelection = null;

/**
 * 点专属选项钩子（由 lab 注册，如函数图象）
 * @type {null | {
 *   canFollow?: (el: any) => boolean,
 *   getFollow?: (el: any) => boolean,
 *   setFollow?: (el: any, on: boolean) => void | Promise<void>,
 *   getShowCoords?: (el: any) => boolean,
 *   setShowCoords?: (el: any, on: boolean) => void,
 *   canDelete?: (el: any) => boolean,
 *   deletePoint?: (el: any) => void | Promise<void>,
 *   canExtend?: (el: any) => boolean,
 *   getExtend?: (el: any) => boolean,
 *   setExtend?: (el: any, on: boolean) => void,
 * }}
 */
let pointOptionHooks = null;

/**
 * @param {typeof pointOptionHooks} hooks
 */
export function setPointOptionHooks(hooks) {
  pointOptionHooks = hooks || null;
}

/**
 * 样式 intent 桥接（graph 等业务层注入）：
 * 样式修改先发给业务层（映射为文档 action），业务层返回 true 表示已接管；
 * 返回 false/未注入时维持原 runtime-only 行为（其它数学 lab）。
 * @type {((intent: { objectType: string, objectId?: string, patch: any }) => boolean) | null}
 */
let styleIntentBridge = null;

/** @param {((intent: { objectType: string, objectId?: string, patch: any }) => boolean) | null} bridge */
export function setStyleIntentBridge(bridge) {
  styleIntentBridge = bridge || null;
}

/**
 * @returns {HTMLElement}
 */
/** 布局版本：旧气泡 DOM 不匹配时整段重建 */
const BUBBLE_LAYOUT = 'v8-hidden-extend';

const BUBBLE_INNER = `
    <div class="brand-tip-card math-object-style-card">
      <div class="brand-tip-head">
        <span class="brand-tip-badge" data-role="badge">对象样式</span>
        <button type="button" class="brand-tip-btn brand-tip-btn-close" data-role="close" aria-label="关闭">收起</button>
      </div>
      <div class="brand-tip-body math-object-style-bubble-body">
        <p class="math-object-style-name">
          <strong data-role="kind">对象</strong>
          <span data-role="label">—</span>
        </p>
        <div class="math-field" data-field="strokeColor">
          <span class="math-field-label">颜色</span>
          <div class="math-color-row">
            <input type="color" data-role="strokeColor" value="#b45309" aria-label="描边颜色" />
            <div class="math-color-presets" data-role="strokePresets"></div>
          </div>
        </div>
        <div class="math-field" data-field="fillColor">
          <span class="math-field-label">填充色</span>
          <div class="math-color-row">
            <input type="color" data-role="fillColor" value="#b45309" aria-label="填充颜色" />
            <div class="math-color-presets" data-role="fillPresets"></div>
          </div>
        </div>
        <div class="math-field" data-field="strokeWidth">
          <label class="math-slider-label">
            <span class="math-slider-name">粗细</span>
            <span class="math-slider-val" data-role="strokeWidthVal">2</span>
          </label>
          <input type="range" data-role="strokeWidth" min="1" max="6" step="0.5" value="2" />
        </div>
        <div class="math-field" data-field="dash">
          <span class="math-field-label">线型</span>
          <div class="math-chip-row" data-role="dash" role="group" aria-label="线型"></div>
        </div>
        <div class="math-field" data-field="fillOpacity">
          <label class="math-slider-label">
            <span class="math-slider-name">填充透明度</span>
            <span class="math-slider-val" data-role="fillOpacityVal">0.2</span>
          </label>
          <input type="range" data-role="fillOpacity" min="0" max="1" step="0.05" value="0.2" />
        </div>
        <div class="math-field" data-field="size">
          <label class="math-slider-label">
            <span class="math-slider-name">点的大小</span>
            <span class="math-slider-val" data-role="sizeVal">4</span>
          </label>
          <input type="range" data-role="size" min="1" max="12" step="0.5" value="4" />
        </div>
        <div class="math-field" data-field="fontSize">
          <label class="math-slider-label">
            <span class="math-slider-name">标签字号</span>
            <span class="math-slider-val" data-role="fontSizeVal">16</span>
          </label>
          <input type="range" data-role="fontSize" min="8" max="28" step="1" value="16" />
        </div>
        <div class="math-field math-field-checks" data-field="pointOptions" hidden>
          <span class="math-field-label">点选项</span>
          <div class="math-check-row-inline math-point-options-row">
            <label class="math-check-row" data-field="showCoords">
              <input type="checkbox" data-role="showCoords" />
              <span>显示坐标</span>
            </label>
            <label class="math-check-row" data-field="followCurve" hidden>
              <input type="checkbox" data-role="followCurve" />
              <span>跟随函数</span>
            </label>
            <button type="button" class="math-point-delete-btn" data-role="deletePointInline" hidden>
              删除
            </button>
          </div>
        </div>
        <div class="math-field math-field-checks" data-field="lineOptions" hidden>
          <span class="math-field-label">线选项</span>
          <div class="math-check-row-inline math-point-options-row">
            <label class="math-check-row" data-field="extendLine">
              <input type="checkbox" data-role="extendLine" />
              <span>延长线</span>
            </label>
          </div>
        </div>
        <div class="math-field" data-field="objectDelete">
          <button type="button" class="math-point-delete-btn" data-role="deletePoint">
            删除
          </button>
        </div>
      </div>
    </div>
    <span class="brand-tip-arrow" aria-hidden="true"></span>
`;

function ensureBubbleEl() {
  let el = document.getElementById(BUBBLE_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = BUBBLE_ID;
    el.className = 'brand-tip-bubble math-object-style-bubble';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '对象样式');
    el.hidden = true;
    el.dataset.layout = BUBBLE_LAYOUT;
    el.innerHTML = BUBBLE_INNER;
    document.body.appendChild(el);
  } else if (el.dataset.layout !== BUBBLE_LAYOUT) {
    // 布局升级：整段替换，避免旧预选粗细/填充位次残留
    el.dataset.layout = BUBBLE_LAYOUT;
    el.innerHTML = BUBBLE_INNER;
    delete el.dataset.bound;
  }
  return el;
}

/**
 * @param {string} c
 */
function toColorInput(c) {
  if (!c) return '#000000';
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    const r = c[1];
    const g = c[2];
    const b = c[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  try {
    if (typeof document !== 'undefined') {
      const ctx = document.createElement('canvas').getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000';
        ctx.fillStyle = c;
        const v = String(ctx.fillStyle);
        if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
      }
    }
  } catch {
    /* */
  }
  return '#b45309';
}

function buildBubbleApi() {
  const root = ensureBubbleEl();
  const $ = (role) => root.querySelector(`[data-role="${role}"]`);

  const badgeEl = /** @type {HTMLElement} */ ($('badge'));
  const kindEl = /** @type {HTMLElement} */ ($('kind'));
  const labelEl = /** @type {HTMLElement} */ ($('label'));
  const strokeColor = /** @type {HTMLInputElement} */ ($('strokeColor'));
  const fillColor = /** @type {HTMLInputElement} */ ($('fillColor'));
  const strokeWidth = /** @type {HTMLInputElement} */ ($('strokeWidth'));
  const strokeWidthVal = /** @type {HTMLElement} */ ($('strokeWidthVal'));
  const fillOpacity = /** @type {HTMLInputElement} */ ($('fillOpacity'));
  const fillOpacityVal = /** @type {HTMLElement} */ ($('fillOpacityVal'));
  const size = /** @type {HTMLInputElement} */ ($('size'));
  const sizeVal = /** @type {HTMLElement} */ ($('sizeVal'));
  const fontSize = /** @type {HTMLInputElement} */ ($('fontSize'));
  const fontSizeVal = /** @type {HTMLElement} */ ($('fontSizeVal'));
  const dashHost = /** @type {HTMLElement} */ ($('dash'));
  const strokePresets = /** @type {HTMLElement | null} */ ($('strokePresets'));
  const fillPresets = /** @type {HTMLElement | null} */ ($('fillPresets'));
  const closeBtn = /** @type {HTMLButtonElement} */ ($('close'));
  const showCoordsEl = /** @type {HTMLInputElement | null} */ ($('showCoords'));
  const followCurveEl = /** @type {HTMLInputElement | null} */ ($('followCurve'));
  const deletePointBtn = /** @type {HTMLButtonElement | null} */ ($('deletePoint'));
  const deletePointInlineBtn = /** @type {HTMLButtonElement | null} */ ($('deletePointInline'));
  const extendLineEl = /** @type {HTMLInputElement | null} */ ($('extendLine'));
  const pointOptionsHost = /** @type {HTMLElement | null} */ (
    root.querySelector('[data-field="pointOptions"]')
  );
  const lineOptionsHost = /** @type {HTMLElement | null} */ (
    root.querySelector('[data-field="lineOptions"]')
  );
  const followRow = /** @type {HTMLElement | null} */ (
    root.querySelector('[data-field="followCurve"]')
  );

  /** @type {any} */
  let target = null;
  let syncing = false;
  /** @type {((e: Event) => void) | null} */
  let outsideHandler = null;
  let outsideRaf = 0;
  let openToken = 0;

  function fillColorSwatches(host) {
    if (!host || host.dataset.ready) return;
    host.innerHTML = COLOR_PRESETS.map(
      (c) =>
        `<button type="button" class="math-color-swatch" data-color="${c}" style="--swatch:${c}" title="${c}" aria-label="颜色 ${c}"></button>`,
    ).join('');
    host.dataset.ready = '1';
  }

  if (dashHost && !dashHost.dataset.ready) {
    dashHost.innerHTML = DASH_STYLES.map(
      (d) =>
        `<button type="button" class="chip" data-dash="${d.dash}" title="${d.label}">${d.label}</button>`,
    ).join('');
    dashHost.dataset.ready = '1';
  }
  fillColorSwatches(strokePresets);
  fillColorSwatches(fillPresets);

  function setFieldVisible(field, on) {
    const el = root.querySelector(`[data-field="${field}"]`);
    if (el) /** @type {HTMLElement} */ (el).hidden = !on;
  }

  /**
   * @param {import('./object-style.js').ObjectStyleSnapshot} snap
   */
  function paintControls(snap) {
    syncing = true;
    if (badgeEl) badgeEl.textContent = `${kindLabel(snap.kind)}样式`;
    if (kindEl) kindEl.textContent = kindLabel(snap.kind);
    if (labelEl) labelEl.textContent = snap.label;
    if (strokeColor) strokeColor.value = toColorInput(snap.strokeColor);
    if (fillColor) fillColor.value = toColorInput(snap.fillColor);
    if (strokeWidth) strokeWidth.value = String(snap.strokeWidth);
    if (strokeWidthVal) strokeWidthVal.textContent = String(snap.strokeWidth);
    if (fillOpacity) fillOpacity.value = String(snap.fillOpacity);
    if (fillOpacityVal) {
      fillOpacityVal.textContent = String(Math.round(snap.fillOpacity * 100) / 100);
    }
    if (size) size.value = String(snap.size);
    if (sizeVal) sizeVal.textContent = String(snap.size);
    if (fontSize) fontSize.value = String(snap.fontSize);
    if (fontSizeVal) fontSizeVal.textContent = String(snap.fontSize);

    dashHost?.querySelectorAll('[data-dash]').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.getAttribute('data-dash')) === snap.dash);
    });

    setFieldVisible('strokeColor', snap.hasStroke);
    setFieldVisible('strokeWidth', snap.hasStroke);
    setFieldVisible('dash', snap.hasDash);
    setFieldVisible('fillColor', snap.hasFill);
    setFieldVisible('fillOpacity', snap.hasFill && snap.kind !== 'point');
    setFieldVisible('size', snap.hasSize);
    setFieldVisible('fontSize', snap.hasFont);

    // 点专属：显示坐标 / 跟随函数 / 行内删除（线/曲线绝不出这些）
    const isPoint = snap.kind === 'point';
    if (pointOptionsHost) pointOptionsHost.hidden = !isPoint;
    setFieldVisible('pointOptions', isPoint);
    if (isPoint && target) {
      const showC =
        typeof pointOptionHooks?.getShowCoords === 'function'
          ? Boolean(pointOptionHooks.getShowCoords(target))
          : Boolean(target._mathShowCoords);
      if (showCoordsEl) showCoordsEl.checked = showC;

      const canFollow =
        typeof pointOptionHooks?.canFollow === 'function'
          ? Boolean(pointOptionHooks.canFollow(target))
          : Boolean(target._mathUserPoint && target._mathCanFollow);
      if (followRow) followRow.hidden = !canFollow;
      if (canFollow && followCurveEl) {
        const fol =
          typeof pointOptionHooks?.getFollow === 'function'
            ? Boolean(pointOptionHooks.getFollow(target))
            : Boolean(target._mathFollow);
        followCurveEl.checked = fol;
      }
    } else {
      if (followRow) followRow.hidden = true;
      if (showCoordsEl) showCoordsEl.checked = false;
      if (followCurveEl) followCurveEl.checked = false;
    }

    // 仅线段 / 垂线实线段：延长线开关（点、直线、切线、曲线都不出）
    const canExtend =
      !isPoint &&
      snap.kind === 'line' &&
      typeof pointOptionHooks?.canExtend === 'function' &&
      Boolean(pointOptionHooks.canExtend(target));
    if (lineOptionsHost) lineOptionsHost.hidden = !canExtend;
    setFieldVisible('lineOptions', canExtend);
    if (canExtend && extendLineEl) {
      const ext =
        typeof pointOptionHooks?.getExtend === 'function'
          ? Boolean(pointOptionHooks.getExtend(target))
          : Boolean(target?._mathExtend);
      extendLineEl.checked = ext;
    } else if (extendLineEl) {
      extendLineEl.checked = false;
    }

    // 删除：点用行内按钮，其它对象用底部按钮
    const canDelete =
      typeof pointOptionHooks?.canDelete === 'function'
        ? Boolean(pointOptionHooks.canDelete(target))
        : Boolean(target?._mathUserPoint || target?._mathConstrId || target?._mathFnId);
    if (deletePointInlineBtn) {
      deletePointInlineBtn.hidden = !(isPoint && canDelete);
    }
    if (deletePointBtn) deletePointBtn.hidden = !(!isPoint && canDelete);
    setFieldVisible('objectDelete', !isPoint && canDelete);
    syncing = false;
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  function positionAt(clientX, clientY) {
    root.hidden = false;
    root.classList.add('is-visible');
    root.style.opacity = '1';
    root.style.pointerEvents = 'auto';
    root.style.zIndex = '200';

    const gap = 14;
    const pad = 10;
    const rect = root.getBoundingClientRect();
    const w = rect.width || 300;
    const h = rect.height || 320;
    let left = clientX + gap;
    let top = clientY + gap;
    if (left + w > window.innerWidth - pad) left = clientX - w - gap;
    if (top + h > window.innerHeight - pad) top = clientY - h - gap;
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    root.dataset.place = top + h / 2 < clientY ? 'above' : 'below';
  }

  function unbindOutside() {
    if (outsideRaf) {
      window.cancelAnimationFrame(outsideRaf);
      outsideRaf = 0;
    }
    if (outsideHandler) {
      document.removeEventListener('pointerdown', outsideHandler, true);
      outsideHandler = null;
    }
  }

  function hide() {
    root.classList.remove('is-visible');
    root.hidden = true;
    root.style.opacity = '';
    unbindOutside();
    target = null;
  }

  function requestClose() {
    // 清当前占用的 selection → onSelect(null) → hide
    if (activeSelection) {
      activeSelection.clear();
    } else {
      hide();
    }
  }

  /**
   * 点气泡外关闭（对齐 math-num-keypad / brand-tip）
   * @param {number} token
   */
  function bindOutside(token) {
    unbindOutside();
    outsideHandler = (ev) => {
      if (token !== openToken) return;
      const t = /** @type {EventTarget | null} */ (ev.target);
      // 点在气泡内：不关
      if (t instanceof Node && root.contains(t)) return;
      // 原生 color 面板等可能不在 bubble 树内，若当前焦点仍在本气泡控件上则先不关
      // （仅当 target 也不是「明确的外部节点」时；一般点画板/侧栏都会关）
      requestClose();
    };
    // 下一帧再绑，避免打开当次 pointer/dblclick 残留把气泡立刻关掉
    outsideRaf = window.requestAnimationFrame(() => {
      outsideRaf = 0;
      if (token !== openToken || !outsideHandler) return;
      document.addEventListener('pointerdown', outsideHandler, true);
    });
  }

  /**
   * @param {import('./object-style.js').ObjectStylePatch} patch
   */
  function commit(patch) {
    if (syncing || !target) return;
    // 业务层 intent 桥接优先（函数画布 → 文档 action；其余 lab 保持 runtime-only）
    if (target?._mathUserPoint || target?._mathConstrId) {
      const objectType = target._mathConstrId ? 'construction' : 'point';
      const objectId = target._mathConstrId || target._mathPointId || null;
      if (objectId && typeof styleIntentBridge === 'function') {
        if (styleIntentBridge({ objectType, objectId, patch: { ...patch } })) return;
      }
    }
    applyObjectStyle(target, patch);
    // polygonalchain 等：边线也一并改
    try {
      const borders = target.borders;
      if (Array.isArray(borders)) {
        for (const b of borders) applyObjectStyle(b, patch);
      }
    } catch {
      /* */
    }
    const snap = readObjectStyle(target, target._mathSelectLabel);
    paintControls(snap);
  }

  /**
   * @param {any} el
   * @param {{ label?: string, clientX?: number, clientY?: number } | null} [meta]
   */
  function open(el, meta = null) {
    if (!el) {
      hide();
      return;
    }
    target = el;
    openToken += 1;
    const token = openToken;

    const snap = readObjectStyle(el, meta?.label);
    if (meta?.label) snap.label = meta.label;
    paintControls(snap);

    const x = Number.isFinite(meta?.clientX) ? /** @type {number} */ (meta.clientX) : window.innerWidth / 2;
    const y = Number.isFinite(meta?.clientY) ? /** @type {number} */ (meta.clientY) : window.innerHeight / 2;
    positionAt(x, y);
    requestAnimationFrame(() => {
      if (token !== openToken) return;
      positionAt(x, y);
    });
    bindOutside(token);
  }

  // 控件只绑一次（单例）
  if (!root.dataset.bound) {
    root.dataset.bound = '1';
    closeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      requestClose();
    });
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.addEventListener('dblclick', (e) => e.stopPropagation());

    strokeColor?.addEventListener('input', () => commit({ strokeColor: strokeColor.value }));
    fillColor?.addEventListener('input', () => commit({ fillColor: fillColor.value }));
    strokeWidth?.addEventListener('input', () => {
      if (strokeWidthVal) strokeWidthVal.textContent = strokeWidth.value;
      commit({ strokeWidth: Number(strokeWidth.value) });
    });
    fillOpacity?.addEventListener('input', () => {
      if (fillOpacityVal) fillOpacityVal.textContent = fillOpacity.value;
      commit({ fillOpacity: Number(fillOpacity.value) });
    });
    size?.addEventListener('input', () => {
      if (sizeVal) sizeVal.textContent = size.value;
      commit({ size: Number(size.value) });
    });
    fontSize?.addEventListener('input', () => {
      if (fontSizeVal) fontSizeVal.textContent = fontSize.value;
      commit({ fontSize: Number(fontSize.value) });
    });
    dashHost?.addEventListener('click', (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target).closest?.('[data-dash]');
      if (!btn) return;
      commit({ dash: Number(btn.getAttribute('data-dash')) });
    });
    strokePresets?.addEventListener('click', (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target).closest?.('[data-color]');
      if (!btn) return;
      const c = btn.getAttribute('data-color') || '';
      if (strokeColor) strokeColor.value = toColorInput(c);
      commit({ strokeColor: c });
    });
    fillPresets?.addEventListener('click', (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target).closest?.('[data-color]');
      if (!btn) return;
      const c = btn.getAttribute('data-color') || '';
      if (fillColor) fillColor.value = toColorInput(c);
      commit({ fillColor: c });
    });

    showCoordsEl?.addEventListener('change', () => {
      if (syncing || !target) return;
      const on = Boolean(showCoordsEl.checked);
      if (typeof pointOptionHooks?.setShowCoords === 'function') {
        pointOptionHooks.setShowCoords(target, on);
      } else {
        target._mathShowCoords = on;
        // 无 lab 钩子时也要立刻刷标签（依赖 getText 读 _mathShowCoords）
        try {
          if (typeof target._mathLiveLabelTick === 'function') {
            target._mathLiveLabelTick();
          }
        } catch {
          /* */
        }
        try {
          target.board?.update?.();
        } catch {
          /* */
        }
        try {
          target.board?._mathSchedulePointLabelFusion?.();
        } catch {
          /* */
        }
      }
    });
    followCurveEl?.addEventListener('change', () => {
      if (syncing || !target) return;
      const on = Boolean(followCurveEl.checked);
      if (typeof pointOptionHooks?.setFollow === 'function') {
        void pointOptionHooks.setFollow(target, on);
      } else {
        target._mathFollow = on;
      }
    });
    deletePointBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!target) return;
      const el = target;
      if (typeof pointOptionHooks?.deletePoint === 'function') {
        void pointOptionHooks.deletePoint(el);
      }
    });
    deletePointInlineBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!target) return;
      const el = target;
      if (typeof pointOptionHooks?.deletePoint === 'function') {
        void pointOptionHooks.deletePoint(el);
      }
    });
    extendLineEl?.addEventListener('change', () => {
      if (syncing || !target) return;
      const on = Boolean(extendLineEl.checked);
      if (typeof pointOptionHooks?.setExtend === 'function') {
        pointOptionHooks.setExtend(target, on);
      } else {
        target._mathExtend = on;
      }
    });
  }

  return {
    root,
    open,
    hide,
    /**
     * @param {any | null} el
     * @param {{ label?: string, clientX?: number, clientY?: number } | null} [meta]
     */
    setTarget(el, meta = null) {
      if (!el) hide();
      else open(el, meta);
    },
    getTarget: () => target,
    /**
     * @param {import('./object-select.js').BoardSelectionController | null} sel
     */
    setActiveSelection(sel) {
      activeSelection = sel;
    },
    getActiveSelection: () => activeSelection,
    dispose() {
      // 单例不销毁 DOM，仅收起
      openToken += 1;
      if (activeSelection) {
        // 不递归 clear，只藏 UI
        activeSelection = null;
      }
      hide();
    },
  };
}

/**
 * 全局单例气泡
 */
export function getObjectStyleBubble() {
  if (!bubbleApi) bubbleApi = buildBubbleApi();
  return bubbleApi;
}

/**
 * 切 Tab / 离开教室时收起气泡并清选中
 * （不销毁单例 DOM）
 */
export function dismissObjectStyleBubble() {
  if (!bubbleApi && !document.getElementById(BUBBLE_ID)) return;
  const panel = getObjectStyleBubble();
  const sel = panel.getActiveSelection?.();
  if (sel) {
    // clear → onSelect(null) → hide；再兜底 hide
    try {
      sel.clear();
    } catch {
      /* */
    }
    panel.setActiveSelection(null);
  }
  panel.hide();
}

/**
 * @deprecated 使用 getObjectStyleBubble
 */
export function createObjectStyleBubble() {
  return getObjectStyleBubble();
}

/**
 * @deprecated
 * @param {HTMLElement | null} [_panelRoot]
 */
export function mountObjectStylePanel(_panelRoot) {
  return getObjectStyleBubble();
}

/**
 * 每 lab 一次：挂自己的 selection，共用单例气泡
 * @param {HTMLElement | null} _panelRoot
 * @param {typeof import('./object-select.js').createBoardSelectionController} createSelection
 */
export function bindObjectStyleForPanel(_panelRoot, createSelection) {
  if (typeof createSelection !== 'function') return null;

  const panel = getObjectStyleBubble();

  const selection = createSelection({
    onSelect(el, meta) {
      if (el) {
        panel.setActiveSelection(selection);
        panel.open(el, meta);
      } else if (panel.getActiveSelection() === selection) {
        panel.setActiveSelection(null);
        panel.hide();
      }
    },
  });

  return {
    panel,
    selection,
    /**
     * @param {any} board
     * @param {any[]} els
     * @param {(el: any, i: number) => { label?: string } | void} [metaFor]
     */
    wireBoard(board, els, metaFor) {
      selection.attachBoard(board);
      selection.registerMany(els, metaFor);
    },
    dispose() {
      if (panel.getActiveSelection() === selection) {
        panel.setActiveSelection(null);
        panel.hide();
      }
      selection.dispose();
      // 不 dispose 单例 panel
    },
  };
}
