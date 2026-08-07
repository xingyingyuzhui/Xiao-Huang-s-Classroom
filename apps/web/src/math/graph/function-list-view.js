/**
 * FunctionListView：函数卡列表的 DOM 渲染与事件委托。
 *
 * 只负责渲染与发出意图（select / toggleVisible / menu action / edit）；
 * 业务状态与 store 接线由 function-panel.js 负责。
 *
 * 安全渲染：卡片结构固定，所有用户字段（名称/公式/颜色）通过 DOM API
 * （createElement / textContent / dataset / setAttribute）赋值，绝不进入
 * 属性内插或 style 模板字符串；颜色经 resolveFunctionColor 解析为
 * 主题色板值或严格校验的 hex，写入 CSS custom property。
 *
 * 键盘：菜单按钮 Enter/Space 打开，Escape 关闭；
 * 连续 render() 不重复绑定（事件委托挂在 root 上）。
 */

import { graphFunctionDisplayLabel } from './function-analysis.js';
import { GRAPH_PRESETS } from './model.js';
import { resolveFunctionColor } from '../shared/math-theme.js';

/**
 * @param {{
 *   root: HTMLElement,
 *   callbacks?: {
 *     onSelect?: (id: string) => void,
 *     onToggleVisible?: (id: string) => void,
 *     onMenu?: (id: string, action: string) => void,
 *   },
 * }} options
 */
export function createFunctionListView(options) {
  const root = options.root;
  const callbacks = options.callbacks || {};
  /** @type {string | null} */
  let openMenuId = null;

  /** @param {string} tag @param {string} [cls] */
  function el(tag, cls) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  }

  function cardFor(fn, activeId, editMode) {
    const selected = fn.id === activeId;
    const formula = graphFunctionDisplayLabel(fn);
    const meta = fn.kind === 'custom' ? null : GRAPH_PRESETS.find((p) => p.id === fn.preset);
    const typeLabel = fn.kind === 'custom' ? '自定义' : meta?.label || '函数';
    const typeTip = fn.kind === 'custom' ? '自定义表达式' : meta?.tip || '';
    const menuOpen = openMenuId === fn.id;

    const card = el('div', 'math-fn-card');
    if (selected) card.classList.add('is-active');
    if (editMode) card.classList.add('is-editing');
    if (!fn.visible) card.classList.add('is-hidden');
    if (fn.locked) card.classList.add('is-locked');
    card.dataset.fnId = fn.id;
    card.style.setProperty('--fn-color', resolveFunctionColor(fn));

    const toggle = el('button', 'math-fn-card-toggle');
    toggle.type = 'button';
    toggle.dataset.fnToggle = fn.id;
    toggle.title = fn.visible ? '隐藏' : '显示';
    toggle.setAttribute('aria-label', `${fn.visible ? '隐藏' : '显示'} ${fn.name || '函数'}`);
    toggle.setAttribute('aria-pressed', fn.visible ? 'true' : 'false');
    toggle.textContent = fn.visible ? '隐藏' : '显示';
    card.appendChild(toggle);

    const del = el('button', 'math-fn-card-del');
    del.type = 'button';
    del.dataset.fnDel = fn.id;
    del.title = '删除';
    del.setAttribute('aria-label', '删除');
    del.textContent = '×';
    card.appendChild(del);

    const main = el('button', 'math-fn-card-main');
    main.type = 'button';
    main.dataset.fnId = fn.id;
    const swatch = el('span', 'math-fn-card-swatch');
    swatch.setAttribute('aria-hidden', 'true');
    main.appendChild(swatch);
    const body = el('span', 'math-fn-card-body');
    const title = el('strong', 'math-fn-card-title');
    title.textContent = formula;
    title.title = formula;
    body.appendChild(title);
    const sub = el('span', 'math-fn-card-sub');
    sub.append(typeLabel);
    if (typeTip) {
      const dot = el('span', 'math-fn-card-sub-dot');
      dot.setAttribute('aria-hidden', 'true');
      dot.textContent = '·';
      sub.append(dot, typeTip);
    }
    if (fn.locked) {
      const hints = el('span', 'math-fn-card-hints');
      const em = el('em');
      em.textContent = '已锁定';
      hints.appendChild(em);
      sub.appendChild(hints);
    }
    body.appendChild(sub);
    main.appendChild(body);
    card.appendChild(main);

    const more = el('div', 'math-fn-card-more');
    const menuBtn = el('button', 'math-fn-card-menu-btn');
    menuBtn.type = 'button';
    menuBtn.dataset.fnMenu = fn.id;
    menuBtn.setAttribute('aria-haspopup', 'true');
    menuBtn.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', `${fn.name || '函数'} 更多操作`);
    menuBtn.title = '更多操作';
    menuBtn.textContent = '⋯';
    more.appendChild(menuBtn);
    if (menuOpen) {
      const menu = el('div', 'math-fn-menu');
      menu.setAttribute('role', 'menu');
      menu.dataset.fnMenuPanel = fn.id;
      const items = [
        ['reference', '设为参考'],
        ['edit', '编辑'],
        ['duplicate', '复制'],
        ['lock', fn.locked ? '解锁' : '锁定'],
      ];
      for (const [action, label] of items) {
        const item = el('button');
        item.type = 'button';
        item.setAttribute('role', 'menuitem');
        item.dataset.fnAction = action;
        item.dataset.fnActionId = fn.id;
        item.textContent = label;
        menu.appendChild(item);
      }
      more.appendChild(menu);
    }
    card.appendChild(more);
    return card;
  }

  /**
   * @param {any[]} functions
   * @param {string | null} activeId
   * @param {boolean} [editMode]
   */
  function render(functions, activeId, editMode = false) {
    if (!root) return;
    root.replaceChildren();
    if (!Array.isArray(functions) || !functions.length) {
      const empty = el('p', 'math-fn-empty');
      empty.textContent = '点 ＋ 添加函数到画布';
      root.appendChild(empty);
      return;
    }
    for (const fn of functions) root.appendChild(cardFor(fn, activeId, editMode));
  }

  /** @param {Event} event */
  function onClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const closeMenu = () => {
      openMenuId = null;
      renderLast();
    };

    const toggle = target.closest?.('[data-fn-toggle]');
    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      callbacks.onToggleVisible?.(toggle.getAttribute('data-fn-toggle') || '');
      return;
    }
    const del = target.closest?.('[data-fn-del]');
    if (del) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      callbacks.onMenu?.(del.getAttribute('data-fn-del') || '', 'delete');
      return;
    }
    const menuBtn = target.closest?.('[data-fn-menu]');
    if (menuBtn) {
      event.preventDefault();
      event.stopPropagation();
      const id = menuBtn.getAttribute('data-fn-menu') || '';
      openMenuId = openMenuId === id ? null : id;
      renderLast();
      return;
    }
    const action = target.closest?.('[data-fn-action]');
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      const id = action.getAttribute('data-fn-action-id') || '';
      const name = action.getAttribute('data-fn-action') || '';
      closeMenu();
      callbacks.onMenu?.(id, /** @type {any} */ (name));
      return;
    }
    // 菜单开着时点卡片其它区域 → 关菜单；编辑模式下不选中
    if (openMenuId) {
      openMenuId = null;
      renderLast();
      return;
    }
    const card = target.closest?.('[data-fn-id]');
    if (card) callbacks.onSelect?.(card.getAttribute('data-fn-id') || '');
  }

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    if (event.key === 'Escape' && openMenuId) {
      openMenuId = null;
      renderLast();
      event.preventDefault();
      return;
    }
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (!target?.closest?.('.math-fn-card-menu-btn')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const id = target.closest('[data-fn-menu]')?.getAttribute('data-fn-menu') || '';
      openMenuId = openMenuId === id ? null : id;
      renderLast();
    }
  }

  let lastState = { functions: [], activeId: null, editMode: false };
  function renderLast() {
    render(lastState.functions, lastState.activeId, lastState.editMode);
  }

  /** 点击菜单/菜单按钮之外的任意位置时收起菜单（含函数列表外部；
   *  捕获阶段监听，避免画布层 stopPropagation 拦截冒泡） */
  function onDocumentClick(event) {
    if (!openMenuId) return;
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (!target) return;
    if (target.closest?.('.math-fn-menu') || target.closest?.('[data-fn-menu]')) return;
    openMenuId = null;
    renderLast();
  }

  const doc = typeof document !== 'undefined' ? document : null;
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeyDown);
  if (doc) doc.addEventListener('click', onDocumentClick, true);

  return {
    /** @param {any[]} functions @param {string | null} activeId @param {boolean} [editMode] */
    render(functions, activeId, editMode = false) {
      lastState = { functions, activeId, editMode };
      render(functions, activeId, editMode);
    },
    dispose() {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeyDown);
      if (doc) doc.removeEventListener('click', onDocumentClick, true);
    },
  };
}
