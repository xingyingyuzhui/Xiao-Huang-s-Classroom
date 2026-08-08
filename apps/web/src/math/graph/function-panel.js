/** 函数侧栏、添加弹窗与 AI 函数弹窗控制器。 */

import { aiApi } from '../../shared/api/client.js';
import { appAlert, appConfirm } from '../../shared/ui/app-dialog.js';
import { GRAPH_PRESETS } from './model.js';
import { createFunctionListView } from './function-list-view.js';
import { createButton } from '@xiaohuang/ui';

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

  /** B5 样板：实例内 DOM 绑定登记。dispose 时清除标记，允许二次 mount 重建绑定。 */
  const boundEls = new Set();
  const markBound = (el, key = 'bound') => {
    if (!el) return;
    boundEls.add(el);
    el.dataset[key] = '1';
  };

  /** P3：实例内登记的 @xiaohuang/ui 控制器；dispose 时统一卸载（UiController 合同）。 */
  const uiControllers = [];
  const trackController = (controller) => {
    uiControllers.push(controller);
    return controller;
  };

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
        const current =
          editor.getEditing?.() || state.functions.find((f) => f.id === state.activeFnId);
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

  /**
   * P3.1：工具条主按钮（添加 / AI / 编辑）全部由 @xiaohuang/ui createButton 挂载。
   * className 桥接既有样式类（math-fn-btn 等）保视觉零回归；宿主打 bound 标记，
   * 幂等（重复 bind 不双挂）；dispose 时控制器统一卸载并移除节点。
   */
  function mountToolbarButtons() {
    const toolbar = document.querySelector('.math-fn-toolbar');
    if (!toolbar || toolbar.dataset.bound) return;
    markBound(toolbar);

    const add = trackController(
      createButton({ label: '＋', title: '添加函数', onClick: () => showAdd() }),
    );
    add.element.classList.add('math-fn-btn', 'math-fn-btn-add');
    const plus = document.createElement('strong');
    plus.className = 'math-fn-add-plus';
    plus.textContent = '＋';
    add.element.replaceChildren(plus);

    const ai = trackController(
      createButton({
        label: 'AI',
        title: 'AI 生成函数',
        onClick: () => {
          hideAdd();
          showAi();
        },
      }),
    );
    ai.element.id = 'btnMathAiFn';
    ai.element.classList.add('math-fn-btn', 'math-fn-btn-ai');
    const aiLabel = document.createElement('span');
    aiLabel.className = 'math-fn-ai-label';
    aiLabel.textContent = 'AI';
    ai.element.replaceChildren(aiLabel);

    const edit = trackController(
      createButton({
        label: '编辑',
        title: '编辑列表',
        onClick: () => {
          state.editMode = !state.editMode;
          edit.element.classList.toggle('is-on', state.editMode);
          edit.update({ label: state.editMode ? '完成' : '编辑' });
          render();
        },
      }),
    );
    edit.element.id = 'btnMathEditFns';
    edit.element.classList.add('math-fn-btn', 'math-fn-btn-edit');

    toolbar.appendChild(add.element);
    toolbar.appendChild(ai.element);
    toolbar.appendChild(edit.element);
  }

  /**
   * P3.1：项目操作（导入 / 导出 / 重置）由 createButton 挂载；点击行为仍由
   * graph-mount-controller 按既有 id（btnMathGraph*）绑定 persistenceController。
   */
  function mountProjectButtons() {
    const row = document.querySelector('.math-project-row');
    if (!row || row.dataset.bound) return;
    markBound(row);

    const mk = (label, title, extraClass) => {
      const ctrl = trackController(createButton({ label, title }));
      ctrl.element.classList.add('math-project-btn');
      if (extraClass) ctrl.element.classList.add(extraClass);
      return ctrl;
    };
    const importBtn = mk('导入', '导入项目 JSON');
    importBtn.element.id = 'btnMathGraphImport';
    const exportBtn = mk('导出', '导出项目 JSON');
    exportBtn.element.id = 'btnMathGraphExport';
    const resetBtn = mk('重置', '重置画布', 'math-project-btn-danger');
    resetBtn.element.id = 'btnMathGraphReset';

    row.appendChild(importBtn.element);
    row.appendChild(exportBtn.element);
    row.appendChild(resetBtn.element);
  }

  function bind() {
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

    // 工具条 / 项目操作按钮由 @xiaohuang/ui createButton 挂载（P3.1，幂等）
    mountToolbarButtons();
    mountProjectButtons();

    for (const element of [cancelButton, closeButton, backdrop]) {
      if (element && !element.dataset.bound) {
        markBound(element);
        element.addEventListener('click', hideAdd);
      }
    }
    for (const element of [aiBackdrop, aiClose, aiCancel]) {
      if (element && !element.dataset.bound) {
        markBound(element);
        element.addEventListener('click', hideAi);
      }
    }
    if (aiSubmit && !aiSubmit.dataset.bound) {
      markBound(aiSubmit);
      aiSubmit.addEventListener('click', () => void generateWithAi());
    }
    if (expressionAdd && !expressionAdd.dataset.bound) {
      markBound(expressionAdd);
      expressionAdd.addEventListener('click', () => addCustom(expressionInput?.value || ''));
    }
    if (expressionInput && !expressionInput.dataset.bound) {
      markBound(expressionInput);
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
      markBound(keypad);
      keypad.addEventListener('mousedown', (event) => event.preventDefault());
      keypad.addEventListener('click', (event) => {
        const button = /** @type {HTMLElement} */ (event.target).closest?.('[data-expr-key]');
        if (button && expressionInput) {
          applyExpressionKey(expressionInput, button.getAttribute('data-expr-key') || '');
        }
      });
    }
    editor.bind();

    if (presetsHost && !presetsHost.dataset.ready) {
      presetsHost.innerHTML = GRAPH_PRESETS.map(
        (preset) =>
          `<button type="button" class="chip" data-math-preset="${preset.id}" title="${preset.tip}">${preset.label}</button>`,
      ).join('');
      markBound(presetsHost, 'ready');
      presetsHost.addEventListener('click', (event) => {
        const button = /** @type {HTMLElement} */ (event.target).closest?.('[data-math-preset]');
        if (button) addPreset(button.getAttribute('data-math-preset') || 'quadratic');
      });
    }
  }

  /** B5 样板：解绑并置空实例捕获，允许二次 mount 重建绑定（关 D3 幽灵引用）。 */
  function dispose() {
    for (const el of boundEls) {
      delete el.dataset.bound;
      delete el.dataset.ready;
    }
    boundEls.clear();
    // P3：卸载 @xiaohuang/ui 控制器（createButton.dispose 幂等：解监听 + 移除节点）
    for (const controller of uiControllers.splice(0)) {
      controller.dispose();
    }
    editor.dispose?.();
    listView.dispose?.();
  }

  return {
    addPreset,
    bind,
    hideAdd,
    hideAi,
    render,
    syncParams,
    dispose,
  };
}
