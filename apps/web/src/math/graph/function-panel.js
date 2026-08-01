/** 函数侧栏、添加弹窗与 AI 函数弹窗控制器。 */

import { colorForFnIndex } from '../shared/math-theme.js';
import { aiApi } from '../../shared/api/client.js';
import { appAlert } from '../../shared/ui/app-dialog.js';
import { GRAPH_PRESETS } from './model.js';
import { graphFunctionDisplayLabel } from './function-analysis.js';
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
 * }} context
 */
export function createFunctionPanelController(context) {
  const { state } = context;

  const pendingIdentity = () => ({
    id: `f${state.fnSeq}`,
    color: colorForFnIndex(state.fnSeq),
  });

  const commitRecord = (record) => {
    state.fnSeq += 1;
    state.functions.push(record);
    state.activeFnId = record.id;
  };

  function render() {
    const host = document.getElementById('mathFnList');
    if (!host) return;
    host.classList.toggle('is-edit-mode', state.editMode);
    if (!state.functions.length) {
      host.innerHTML = '<p class="math-fn-empty">点 ＋ 添加函数到画布</p>';
      return;
    }
    host.innerHTML = state.functions
      .map((fn) => {
        const selected = fn.id === state.activeFnId;
        const formula = escapeHtml(graphFunctionDisplayLabel(fn));
        const meta = fn.kind === 'custom'
          ? null
          : GRAPH_PRESETS.find((preset) => preset.id === fn.preset);
        const typeLabel = fn.kind === 'custom'
          ? '自定义'
          : escapeHtml(meta?.label || '函数');
        const typeTip = fn.kind === 'custom'
          ? '自定义表达式'
          : escapeHtml(meta?.tip || '');
        const subtitle = typeTip
          ? `${typeLabel}<span class="math-fn-card-sub-dot" aria-hidden="true">·</span>${typeTip}`
          : typeLabel;
        return `
      <div class="math-fn-card${selected ? ' is-active' : ''}${state.editMode ? ' is-editing' : ''}" data-fn-id="${escapeHtml(fn.id)}" style="--fn-color:${escapeHtml(fn.color)}">
        <button type="button" class="math-fn-card-del" data-fn-del="${escapeHtml(fn.id)}" title="删除" aria-label="删除">×</button>
        <button type="button" class="math-fn-card-main" data-fn-id="${escapeHtml(fn.id)}">
          <span class="math-fn-card-swatch" aria-hidden="true"></span>
          <span class="math-fn-card-body">
            <strong class="math-fn-card-title" title="${formula}">${formula}</strong>
            <span class="math-fn-card-sub">${subtitle}</span>
          </span>
        </button>
      </div>`;
      })
      .join('');
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
    context.mirrorActiveToLegacy();
    hideAdd();
    context.rebuildCurve();
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
    context.rebuildCurve();
    return true;
  }

  function addFromAiSpec(spec) {
    const result = createFunctionRecordFromAiSpec(spec, pendingIdentity());
    if (!result.ok) return false;
    commitRecord(result.record);
    if (result.record.kind === 'preset') context.mirrorActiveToLegacy();
    hideAdd();
    hideAi();
    context.rebuildCurve();
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

    if (list && !list.dataset.bound) {
      list.dataset.bound = '1';
      list.addEventListener('click', (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        const deleteButton = target.closest?.('[data-fn-del]');
        if (deleteButton) {
          event.preventDefault();
          event.stopPropagation();
          if (state.editMode) remove(deleteButton.getAttribute('data-fn-del') || '');
          return;
        }
        if (state.editMode) return;
        const card = target.closest?.('[data-fn-id]');
        if (card) select(card.getAttribute('data-fn-id') || '');
      });
    }
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

