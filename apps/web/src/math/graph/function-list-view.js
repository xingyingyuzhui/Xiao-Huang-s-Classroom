/**
 * FunctionListView：函数卡列表的 DOM 渲染与事件委托。
 *
 * 只负责渲染与发出意图（select / toggleVisible / menu action / edit）；
 * 业务状态与 store 接线由 function-panel.js 负责。
 *
 * 键盘：菜单按钮 Enter/Space 打开，Escape 关闭；
 * 连续 render() 不重复绑定（事件委托挂在 root 上）。
 */

import { graphFunctionDisplayLabel } from './function-analysis.js';
import { GRAPH_PRESETS } from './model.js';

/** @param {unknown} value */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{
 *   root: HTMLElement,
 *   callbacks?: {
 *     onSelect?: (id: string) => void,
 *     onToggleVisible?: (id: string) => void,
 *     onMenu?: (id: string, action: 'edit' | 'duplicate' | 'lock' | 'up' | 'down' | 'delete') => void,
 *   },
 * }} options
 */
export function createFunctionListView(options) {
  const root = options.root;
  const callbacks = options.callbacks || {};
  /** @type {string | null} */
  let openMenuId = null;

  function cardFor(fn, activeId, editMode) {
    const selected = fn.id === activeId;
    const formula = escapeHtml(graphFunctionDisplayLabel(fn));
    const meta = fn.kind === 'custom' ? null : GRAPH_PRESETS.find((p) => p.id === fn.preset);
    const typeLabel = fn.kind === 'custom' ? '自定义' : escapeHtml(meta?.label || '函数');
    const typeTip = fn.kind === 'custom' ? '自定义表达式' : escapeHtml(meta?.tip || '');
    const subtitle = typeTip
      ? `${typeLabel}<span class="math-fn-card-sub-dot" aria-hidden="true">·</span>${typeTip}`
      : typeLabel;
    const stateHints = [];
    if (!fn.visible) stateHints.push('已隐藏');
    if (fn.locked) stateHints.push('已锁定');
    const hintText = stateHints.length
      ? `<span class="math-fn-card-hints">${stateHints.map((h) => `<em>${h}</em>`).join('')}</span>`
      : '';
    const menuOpen = openMenuId === fn.id;
    return `
    <div class="math-fn-card${selected ? ' is-active' : ''}${editMode ? ' is-editing' : ''}${!fn.visible ? ' is-hidden' : ''}${fn.locked ? ' is-locked' : ''}" data-fn-id="${escapeHtml(fn.id)}" style="--fn-color:${escapeHtml(fn.color)}">
      <button type="button" class="math-fn-card-toggle" data-fn-toggle="${escapeHtml(fn.id)}" title="${fn.visible ? '隐藏' : '显示'}" aria-label="${fn.visible ? `隐藏 ${fn.name || '函数'}` : `显示 ${fn.name || '函数'}`}" aria-pressed="${fn.visible ? 'true' : 'false'}">${fn.visible ? '👁' : '—'}</button>
      <button type="button" class="math-fn-card-del" data-fn-del="${escapeHtml(fn.id)}" title="删除" aria-label="删除">×</button>
      <button type="button" class="math-fn-card-main" data-fn-id="${escapeHtml(fn.id)}">
        <span class="math-fn-card-swatch" aria-hidden="true"></span>
        <span class="math-fn-card-body">
          <strong class="math-fn-card-title" title="${formula}">${formula}</strong>
          <span class="math-fn-card-sub">${subtitle}${hintText}</span>
        </span>
      </button>
      <div class="math-fn-card-more">
        <button type="button" class="math-fn-card-menu-btn" data-fn-menu="${escapeHtml(fn.id)}" aria-haspopup="true" aria-expanded="${menuOpen ? 'true' : 'false'}" aria-label="${fn.name || '函数'} 更多操作" title="更多操作">⋯</button>
        ${menuOpen ? `
        <div class="math-fn-menu" role="menu" data-fn-menu-panel="${escapeHtml(fn.id)}">
          <button type="button" role="menuitem" data-fn-action="edit" data-fn-action-id="${escapeHtml(fn.id)}">编辑</button>
          <button type="button" role="menuitem" data-fn-action="duplicate" data-fn-action-id="${escapeHtml(fn.id)}">复制</button>
          <button type="button" role="menuitem" data-fn-action="lock" data-fn-action-id="${escapeHtml(fn.id)}">${fn.locked ? '解锁' : '锁定'}</button>
          <button type="button" role="menuitem" data-fn-action="up" data-fn-action-id="${escapeHtml(fn.id)}">上移</button>
          <button type="button" role="menuitem" data-fn-action="down" data-fn-action-id="${escapeHtml(fn.id)}">下移</button>
          <button type="button" role="menuitem" data-fn-action="delete" data-fn-action-id="${escapeHtml(fn.id)}">删除</button>
        </div>` : ''}
      </div>
    </div>`;
  }

  /**
   * @param {any[]} functions
   * @param {string | null} activeId
   * @param {boolean} [editMode]
   */
  function render(functions, activeId, editMode = false) {
    if (!root) return;
    if (!Array.isArray(functions) || !functions.length) {
      root.innerHTML = '<p class="math-fn-empty">点 ＋ 添加函数到画布</p>';
      return;
    }
    root.innerHTML = functions.map((fn) => cardFor(fn, activeId, editMode)).join('');
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

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeyDown);

  return {
    /** @param {any[]} functions @param {string | null} activeId @param {boolean} [editMode] */
    render(functions, activeId, editMode = false) {
      lastState = { functions, activeId, editMode };
      render(functions, activeId, editMode);
    },
    dispose() {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeyDown);
    },
  };
}
