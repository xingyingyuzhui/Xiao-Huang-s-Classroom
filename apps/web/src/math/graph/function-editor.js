/**
 * FunctionEditor：函数编辑表单（重命名 / 表达式 / 预设系数 / 独立定义域）。
 *
 * 校验规则：
 * - 名称 trim 后 1–20 字符；空名回退「函数」。
 * - 自定义表达式只有完整编译成功后才允许提交。
 * - domain 自定义模式 min < max（提交时排序由 normalize 兜底）。
 */

import { GRAPH_PRESETS, defaultCoeffsFor } from './model.js';
import { createCustomFunctionRecord } from './function-records.js';

/** @param {string} value */
function validName(value) {
  const name = String(value || '').trim();
  if (!name) return null;
  if (name.length > 20) return '名称最多 20 个字符';
  return name;
}

/**
 * @param {{
 *   root: HTMLElement,
 *   callbacks: {
 *     onSubmit: (patch: any) => void,
 *     onCancel: () => void,
 *   },
 * }} options
 */
export function createFunctionEditor(options) {
  const root = options.root;
  const callbacks = options.callbacks;
  /** @type {any | null} */
  let editing = null;

  function open(fn) {
    editing = fn;
    if (!root) return;
    const nameInput = root.querySelector('#mathFnEditName');
    const exprInput = root.querySelector('#mathFnEditExpr');
    const exprWrap = root.querySelector('#mathFnEditExprWrap');
    const coeffWrap = root.querySelector('#mathFnEditCoeffs');
    const domainMode = root.querySelector('#mathFnEditDomainMode');
    const domainWrap = root.querySelector('#mathFnEditDomainWrap');
    const domainMin = root.querySelector('#mathFnEditDomainMin');
    const domainMax = root.querySelector('#mathFnEditDomainMax');
    const status = root.querySelector('#mathFnEditStatus');

    if (nameInput) nameInput.value = fn?.name || '';
    if (exprInput) exprInput.value = fn?.kind === 'custom' ? (fn.expr || '') : '';
    if (exprWrap) exprWrap.hidden = fn?.kind !== 'custom';
    if (coeffWrap) {
      coeffWrap.hidden = fn?.kind !== 'preset';
      if (fn?.kind === 'preset') {
        for (const [key, id] of [['a', '#mathFnEditA'], ['b', '#mathFnEditB'], ['c', '#mathFnEditC']]) {
          const input = root.querySelector(id);
          if (input) input.value = String(fn.coeffs?.[key] ?? 0);
        }
        const presetSelect = root.querySelector('#mathFnEditPreset');
        if (presetSelect) {
          presetSelect.innerHTML = GRAPH_PRESETS.map(
            (p) => `<option value="${p.id}"${p.id === fn.preset ? ' selected' : ''}>${p.label}</option>`,
          ).join('');
        }
      }
    }
    const mode = fn?.domain?.mode === 'custom' ? 'custom' : 'viewport';
    if (domainMode) domainMode.value = mode;
    if (domainWrap) domainWrap.hidden = mode !== 'custom';
    if (domainMin) domainMin.value = String(fn?.domain?.min ?? -10);
    if (domainMax) domainMax.value = String(fn?.domain?.max ?? 10);
    if (status) status.textContent = '';
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => nameInput?.focus?.(), 50);
  }

  function close() {
    editing = null;
    root?.classList.remove('is-open');
    root?.setAttribute('aria-hidden', 'true');
  }

  function submit() {
    if (!editing) return;
    const status = root?.querySelector('#mathFnEditStatus');
    const name = validName(root?.querySelector('#mathFnEditName')?.value);
    if (name === null) {
      if (status) status.textContent = '请输入名称';
      return;
    }
    if (typeof name === 'string' && name.length > 20) {
      if (status) status.textContent = name;
      return;
    }
    const patch = { name };
    if (editing.kind === 'custom') {
      const raw = root?.querySelector('#mathFnEditExpr')?.value || '';
      const result = createCustomFunctionRecord({ id: editing.id, raw });
      if (!result.ok) {
        if (status) status.textContent = result.error || '表达式无法解析';
        return;
      }
      patch.expr = result.record.expr;
    } else {
      const preset = root?.querySelector('#mathFnEditPreset')?.value || editing.preset;
      const coeffs = {
        a: Number(root?.querySelector('#mathFnEditA')?.value || 0),
        b: Number(root?.querySelector('#mathFnEditB')?.value || 0),
        c: Number(root?.querySelector('#mathFnEditC')?.value || 0),
      };
      patch.preset = preset;
      patch.coeffs = coeffs;
    }
    const mode = root?.querySelector('#mathFnEditDomainMode')?.value;
    if (mode === 'custom') {
      patch.domain = {
        mode: 'custom',
        min: Number(root?.querySelector('#mathFnEditDomainMin')?.value || -10),
        max: Number(root?.querySelector('#mathFnEditDomainMax')?.value || 10),
      };
    } else {
      patch.domain = { mode: 'viewport' };
    }
    callbacks.onSubmit(patch);
    close();
  }

  function bind() {
    if (!root || root.dataset.mathEditorBound === '1') return;
    root.dataset.mathEditorBound = '1';
    const domainMode = root.querySelector('#mathFnEditDomainMode');
    domainMode?.addEventListener('change', () => {
      const wrap = root.querySelector('#mathFnEditDomainWrap');
      if (wrap) wrap.hidden = domainMode.value !== 'custom';
    });
    root.querySelector('#btnMathFnEditCancel')?.addEventListener('click', () => {
      close();
      callbacks.onCancel();
    });
    root.querySelector('#btnMathFnEditSubmit')?.addEventListener('click', () => submit());
    root.querySelector('#mathFnEditName')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
    root.querySelector('#mathFnEditExpr')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
  }

  return { open, close, submit, bind, getEditing: () => editing };
}
