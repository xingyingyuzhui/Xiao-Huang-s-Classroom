/** 函数侧栏、添加弹窗与 AI 函数弹窗控制器。 */

import { aiApi } from '../../shared/api/client.js';
import { appAlert, appConfirm } from '../../shared/ui/app-dialog.js';
import { GRAPH_PRESETS } from './model.js';
import { createFunctionListView } from './function-list-view.js';
import { createFunctionEditor } from './function-editor.js';
import {
  createCustomFunctionRecord,
  createFunctionRecordFromAiSpec,
  createPresetFunctionRecord,
} from './function-records.js';

/** @param {unknown} value */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{
 *   state: any,
 *   activeFunction: () => any,
 *   mirrorActiveToLegacy: () => void,
 *   rebuildCurve: () => void,
 *   detachFunctionCurve: (fn: any) => void,
 *   paintReadouts: () => void,
 *   syncSliders: () => void,
 *   store: () => any,
 * }} context
 */
export function createFunctionPanelController(context) {
  const { state } = context;

  const nextFnId = () => {
    const allocator = context.idAllocator?.();
    if (allocator) return allocator.nextFunctionId();
    // 无 allocator（极旧路径）时退回随机唯一 id，绝不与文档冲突
    return `f${Math.floor(Math.random() * 1e6)}`;
  };
  /** 槽位由 allocator identity 派生（fN → N-1），身份与颜色不再共用同一真值 */
  const slotForFnId = (id) => {
    const m = /^f(\d+)$/.exec(String(id));
    return m ? Number(m[1]) - 1 : 0;
  };

  const pendingIdentity = () => {
    const id = nextFnId();
    return { id, colorSlot: slotForFnId(id) };
  };

  const commitRecord = (record) => {
    const store = context.store?.();
    if (store) {
      store.dispatch({ type: 'function/add', payload: { function: record } });
    } else {
      state.functions.push(record);
      state.activeFnId = record.id;
    }
  };

  // 函数列表视图（事件委托 + 更多菜单）
  const listHost = document.getElementById('mathFnList');
  const listView = createFunctionListView({
    root: listHost,
    callbacks: {
      onSelect: (id) => select(id),
      onToggleVisible: (id) => toggleVisible(id),
      onMenu: (id, action) => void handleMenuAction(id, action),
    },
  });

  // 编辑弹窗（重命名 / 表达式 / 系数 / 定义域）
  const editor = createFunctionEditor({
    root: /** @type {any} */ (document.getElementById('mathFnEditModal')),
    callbacks: {
      onSubmit: (patch) => {
        const store = context.store?.();
        const current = editor.getEditing?.() || state.functions.find((f) => f.id === state.activeFnId);
        if (!current || !store) return;
        store.dispatch({
          type: 'function/update',
          payload: { id: current.id, patch },
        });
      },
      onCancel: () => {},
    },
  });

  /** 删除依赖计数（文档点/构造中引用该函数者） */
  function dependentCount(id) {
    const store = context.store?.();
    const doc = store?.getDocument?.();
    if (!doc) return 0;
    const pointCount = (doc.points || []).filter((p) => {
      const c = p.constraint;
      return (
        (c?.kind === 'followFunction' && c.functionId === id) ||
        (c?.kind === 'followFeature' && c.functionId === id) ||
        (c?.kind === 'intersection' && c.targetIds?.includes(id))
      );
    }).length;
    const constructionCount = (doc.constructions || []).filter(
      (c) => c.fnId === id || c.fnIds?.includes(id),
    ).length;
    return pointCount + constructionCount;
  }

  async function handleMenuAction(id, action) {
    const store = context.store?.();
    const fn = state.functions.find((f) => f.id === id);
    if (!fn) return;
    if (action === 'reference') {
      if (!store) return;
      const { curve, ...definition } = fn;
      store.dispatch({
        type: 'presentation/update',
        payload: { patch: { compare: { reference: definition } } },
      });
      return;
    }
    if (action === 'edit') {
      if (fn.locked) return; // 锁定函数只允许解锁/查看
      editor.open(fn);
      return;
    }
    if (action === 'duplicate') {
      if (fn.locked) return;
      if (!store) return;
      const { curve, ...definition } = fn;
      const dupId = nextFnId();
      const dup = {
        ...definition,
        id: dupId,
        name: fn.name ? `${fn.name}（副本）` : '',
        colorSlot: slotForFnId(dupId),
        explicitColor: null,
      };
      store.dispatch({ type: 'function/duplicate', payload: { sourceId: id, function: dup } });
      return;
    }
    if (action === 'lock') {
      store?.dispatch({
        type: 'function/update',
        payload: { id, patch: { locked: !fn.locked } },
      });
      return;
    }
    if (action === 'up' || action === 'down') {
      if (!store) return;
      const ids = state.functions.map((f) => f.id);
      const index = ids.indexOf(id);
      const target = action === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= ids.length) return;
      const next = ids.slice();
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      store.dispatch({ type: 'function/reorder', payload: { ids: next } });
      return;
    }
    if (action === 'delete') {
      if (state.functions.length <= 1) {
        void appAlert('至少保留一条函数', { title: '无法删除' });
        return;
      }
      const count = dependentCount(id);
      const suffix = count > 0 ? `（将同时删除 ${count} 个关联对象）` : '';
      const ok = await appConfirm(`确定删除「${fn.name || '函数'}」？${suffix}`, {
        title: '删除函数',
        okText: '删除',
        cancelText: '取消',
      });
      if (ok) remove(id);
    }
  }

  function toggleVisible(id) {
    const fn = state.functions.find((f) => f.id === id);
    if (!fn) return;
    const store = context.store?.();
    if (store) {
      store.dispatch({
        type: 'function/update',
        payload: { id, patch: { visible: !fn.visible } },
      });
      return;
    }
    fn.visible = !fn.visible;
    context.rebuildCurve();
    render();
  }

  function render() {
    const host = document.getElementById('mathFnList');
    if (!host) return;
    host.classList.toggle('is-edit-mode', state.editMode);
    listView.render(state.functions, state.activeFnId, state.editMode);
  }

  function syncParams() {
    const panel = document.getElementById('mathFnParamPanel');
    const title = document.getElementById('mathFnParamTitle');
    const fn = context.activeFunction();
    if (!panel) return;
    if (!fn || fn.kind !== 'preset') {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    if (title) {
      const meta = GRAPH_PRESETS.find((preset) => preset.id === fn.preset);
      title.textContent = `${meta?.label || '函数'}参数`;
    }
    context.mirrorActiveToLegacy();
    context.syncSliders();
  }

  function hideAdd() {
    const backdrop = document.getElementById('mathFnAddBackdrop');
    const modal = document.getElementById('mathFnAddModal');
    backdrop?.classList.remove('is-open');
    modal?.classList.remove('is-open');
    backdrop?.setAttribute('aria-hidden', 'true');
    modal?.setAttribute('aria-hidden', 'true');
    const status = document.getElementById('mathFnExprStatus');
    if (status) status.textContent = '';
  }

  function showAdd() {
    const backdrop = document.getElementById('mathFnAddBackdrop');
    const modal = document.getElementById('mathFnAddModal');
    const status = document.getElementById('mathFnExprStatus');
    const input = /** @type {HTMLInputElement | null} */ (
      document.getElementById('mathFnExprInput')
    );
    if (status) status.textContent = '';
    if (input) input.value = '';
    backdrop?.classList.add('is-open');
    modal?.classList.add('is-open');
    backdrop?.setAttribute('aria-hidden', 'false');
    modal?.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => input?.focus());
  }

  function showAi() {
    const backdrop = document.getElementById('mathFnAiBackdrop');
    const modal = document.getElementById('mathFnAiModal');
    const prompt = /** @type {HTMLTextAreaElement | null} */ (
      document.getElementById('mathFnAiPrompt')
    );
    const status = document.getElementById('mathFnAiStatus');
    if (status) {
      status.textContent = '';
      status.classList.remove('is-ok', 'is-err');
    }
    if (prompt) prompt.value = '';
    backdrop?.classList.add('is-open');
    modal?.classList.add('is-open');
    backdrop?.setAttribute('aria-hidden', 'false');
    modal?.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => prompt?.focus());
  }

  function hideAi() {
    const backdrop = document.getElementById('mathFnAiBackdrop');
    const modal = document.getElementById('mathFnAiModal');
    backdrop?.classList.remove('is-open');
    modal?.classList.remove('is-open');
    backdrop?.setAttribute('aria-hidden', 'true');
    modal?.setAttribute('aria-hidden', 'true');
    const submit = document.getElementById('btnMathFnAiSubmit');
    if (submit instanceof HTMLButtonElement) {
      submit.disabled = false;
      submit.textContent = '生成并添加';
    }
  }

  function addPreset(preset) {
    const record = createPresetFunctionRecord({
      ...pendingIdentity(),
      preset,
    });
    commitRecord(record);
    hideAdd();
  }

  function addCustom(raw, options = {}) {
    const result = createCustomFunctionRecord({
      ...pendingIdentity(),
      raw,
    });
    if (!result.ok) {
      if (!options.quietStatus) {
        const status = document.getElementById('mathFnExprStatus');
        if (status) status.textContent = result.error;
      }
      return false;
    }
    commitRecord(result.record);
    const status = document.getElementById('mathFnExprStatus');
    if (status) status.textContent = '';
    hideAdd();
    return true;
  }

  function addFromAiSpec(spec) {
    const result = createFunctionRecordFromAiSpec(spec, pendingIdentity());
    if (!result.ok) return false;
    commitRecord(result.record);
    hideAdd();
    hideAi();
    return true;
  }

  async function generateWithAi() {
    const promptElement = /** @type {HTMLTextAreaElement | null} */ (
      document.getElementById('mathFnAiPrompt')
    );
    const status = document.getElementById('mathFnAiStatus');
    const submit = document.getElementById('btnMathFnAiSubmit');
    const prompt = promptElement?.value?.trim() || '';
    if (!prompt) {
      if (status) {
        status.textContent = '请输入函数描述';
        status.classList.add('is-err');
        status.classList.remove('is-ok');
      }
      return;
    }
    if (submit instanceof HTMLButtonElement) {
      submit.disabled = true;
      submit.textContent = '生成中…';
    }
    if (status) {
      status.textContent = '正在调用 DeepSeek…';
      status.classList.remove('is-ok', 'is-err');
    }
    try {
      const data = await aiApi.mathFnGenerate(prompt);
      if (!addFromAiSpec(data)) {
        throw new Error('生成结果无法上画布，请换种描述重试');
      }
      if (status) {
        status.textContent = '已生成并添加';
        status.classList.add('is-ok');
        status.classList.remove('is-err');
      }
      window.setTimeout(() => hideAi(), 400);
    } catch (error) {
      if (status) {
        status.textContent = error?.message || String(error);
        status.classList.add('is-err');
        status.classList.remove('is-ok');
      }
      if (submit instanceof HTMLButtonElement) {
        submit.disabled = false;
        submit.textContent = '生成并添加';
      }
    }
  }

  function select(id) {
    if (!state.functions.some((fn) => fn.id === id)) return;
    const store = context.store?.();
    if (store) {
      store.dispatch({
        type: 'presentation/update',
        payload: { patch: { activeFunctionId: id } },
      });
      return;
    }
    state.activeFnId = id;
    context.mirrorActiveToLegacy();
    render();
    syncParams();
    context.paintReadouts();
    context.rebuildCurve();
  }

  function remove(id) {
    if (state.functions.length <= 1) {
      void appAlert('至少保留一条函数', { title: '无法删除' });
      return;
    }
    const store = context.store?.();
    if (store) {
      store.dispatch({ type: 'function/remove', payload: { id } });
      return;
    }
    const record = state.functions.find((fn) => fn.id === id);
    context.detachFunctionCurve(record);
    state.functions = state.functions.filter((fn) => fn.id !== id);
    if (state.activeFnId === id) state.activeFnId = state.functions[0]?.id || null;
    context.mirrorActiveToLegacy();
    context.rebuildCurve();
  }

  function applyExpressionKey(input, key) {
    if (!input || !key) return;
    if (key === '清空') {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (key === '⌫') {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      if (start !== end) {
        input.value = input.value.slice(0, start) + input.value.slice(end);
        input.setSelectionRange(start, start);
      } else if (start > 0) {
        input.value = input.value.slice(0, start - 1) + input.value.slice(end);
        input.setSelectionRange(start - 1, start - 1);
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (key === '确定') {
      addCustom(input.value || '');
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + key + input.value.slice(end);
    const caret = start + key.length;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  function bind() {
    const list = document.getElementById('mathFnList');
    const addButton = document.getElementById('btnMathAddFn');
    const aiButton = document.getElementById('btnMathAiFn');
    const editButton = document.getElementById('btnMathEditFns');
    const cancelButton = document.getElementById('btnMathFnAddCancel');
    const closeButton = document.getElementById('btnMathFnAddClose');
    const backdrop = document.getElementById('mathFnAddBackdrop');
    const aiBackdrop = document.getElementById('mathFnAiBackdrop');
    const aiClose = document.getElementById('btnMathFnAiClose');
    const aiCancel = document.getElementById('btnMathFnAiCancel');
    const aiSubmit = document.getElementById('btnMathFnAiSubmit');
    const expressionAdd = document.getElementById('btnMathFnExprAdd');
    const expressionInput = /** @type {HTMLInputElement | null} */ (
      document.getElementById('mathFnExprInput')
    );
    const keypad = document.getElementById('mathFnExprKeypad');
    const presetsHost = document.getElementById('mathGraphPresets');

    // 函数列表事件委托已由 function-list-view 接管（含更多菜单/显隐/键盘）
    if (addButton && !addButton.dataset.bound) {
      addButton.dataset.bound = '1';
      addButton.addEventListener('click', showAdd);
    }
    if (aiButton && !aiButton.dataset.bound) {
      aiButton.dataset.bound = '1';
      aiButton.addEventListener('click', () => {
        hideAdd();
        showAi();
      });
    }
    if (editButton && !editButton.dataset.bound) {
      editButton.dataset.bound = '1';
      editButton.addEventListener('click', () => {
        state.editMode = !state.editMode;
        editButton.classList.toggle('is-on', state.editMode);
        editButton.textContent = state.editMode ? '完成' : '编辑';
        render();
      });
    }
    for (const element of [cancelButton, closeButton, backdrop]) {
      if (element && !element.dataset.bound) {
        element.dataset.bound = '1';
        element.addEventListener('click', hideAdd);
      }
    }
    for (const element of [aiBackdrop, aiClose, aiCancel]) {
      if (element && !element.dataset.bound) {
        element.dataset.bound = '1';
        element.addEventListener('click', hideAi);
      }
    }
    if (aiSubmit && !aiSubmit.dataset.bound) {
      aiSubmit.dataset.bound = '1';
      aiSubmit.addEventListener('click', () => void generateWithAi());
    }
    if (expressionAdd && !expressionAdd.dataset.bound) {
      expressionAdd.dataset.bound = '1';
      expressionAdd.addEventListener('click', () => addCustom(expressionInput?.value || ''));
    }
    if (expressionInput && !expressionInput.dataset.bound) {
      expressionInput.dataset.bound = '1';
      expressionInput.setAttribute('inputmode', 'none');
      expressionInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          addCustom(expressionInput.value || '');
        } else if (event.key === 'Escape') {
          event.preventDefault();
          hideAdd();
        }
      });
    }
    if (keypad && !keypad.dataset.bound) {
      keypad.dataset.bound = '1';
      keypad.addEventListener('mousedown', (event) => event.preventDefault());
      keypad.addEventListener('click', (event) => {
        const button = /** @type {HTMLElement} */ (event.target).closest?.('[data-expr-key]');
        if (button && expressionInput) {
          applyExpressionKey(
            expressionInput,
            button.getAttribute('data-expr-key') || '',
          );
        }
      });
    }
    editor.bind();

    if (presetsHost && !presetsHost.dataset.ready) {
      presetsHost.innerHTML = GRAPH_PRESETS.map(
        (preset) =>
          `<button type="button" class="chip" data-math-preset="${preset.id}" title="${preset.tip}">${preset.label}</button>`,
      ).join('');
      presetsHost.dataset.ready = '1';
      presetsHost.addEventListener('click', (event) => {
        const button = /** @type {HTMLElement} */ (event.target).closest?.('[data-math-preset]');
        if (button) addPreset(button.getAttribute('data-math-preset') || 'quadratic');
      });
    }
  }

  return {
    addPreset,
    bind,
    hideAdd,
    hideAi,
    render,
    syncParams,
  };
}

