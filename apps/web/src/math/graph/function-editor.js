/**
 * FunctionEditor：函数编辑表单（重命名 / 表达式 / 预设系数 / 独立定义域）。
 *
 * 校验规则：
 * - 名称 trim 后 1–20 字符；空名拒绝提交。
 * - 自定义表达式只有完整编译成功后才允许提交。
 * - domain 自定义模式 min < max（提交时排序由 normalize 兜底）。
 */

import { GRAPH_PRESETS } from './model.js';
import { createCustomFunctionRecord } from './function-records.js';
import { createButton } from '@xiaohuang/ui';

/**
 * @param {string} value
 * @returns {{ ok: true, name: string } | { ok: false, error: string }}
 */
function parseName(value) {
  const name = String(value || '').trim();
  if (!name) return { ok: false, error: '请输入名称' };
  if (name.length > 20) return { ok: false, error: '名称最多 20 个字符' };
  return { ok: true, name };
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

  /** P3.3：本实例登记的 @xiaohuang/ui 控制器；dispose 时统一卸载。 */
  const uiControllers = [];
  const trackController = (controller) => {
    uiControllers.push(controller);
    return controller;
  };

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
          // P3.3：受控 DOM 填充（GRAPH_PRESETS 为应用常量，但禁止 innerHTML 拼接习惯）
          presetSelect.replaceChildren(
            ...GRAPH_PRESETS.map((p) => {
              const option = document.createElement('option');
              option.value = p.id;
              option.textContent = p.label;
              option.selected = p.id === fn.preset;
              return option;
            }),
          );
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
    const nameResult = parseName(root?.querySelector('#mathFnEditName')?.value);
    if (!nameResult.ok) {
      if (status) status.textContent = nameResult.error;
      return;
    }
    const patch = { name: nameResult.name };
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
      if (!Object.values(coeffs).every(Number.isFinite)) {
        if (status) status.textContent = '系数必须是有限数值';
        return;
      }
      patch.preset = preset;
      patch.coeffs = coeffs;
    }
    const mode = root?.querySelector('#mathFnEditDomainMode')?.value;
    if (mode === 'custom') {
      const min = Number(root?.querySelector('#mathFnEditDomainMin')?.value || -10);
      const max = Number(root?.querySelector('#mathFnEditDomainMax')?.value || 10);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        if (status) status.textContent = '定义域必须是有限数值';
        return;
      }
      if (Math.min(min, max) === Math.max(min, max)) {
        if (status) status.textContent = '定义域上下限不能相等';
        return;
      }
      patch.domain = { mode: 'custom', min, max };
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

    // P3.3：模态主按钮（保存 / 取消）经 @xiaohuang/ui createButton 挂载；
    // className 桥接 .btn/.primary/.ghost 保视觉零回归（无 ui-kit 皮肤期不回归）
    const actionsHost = root.querySelector('.math-fn-add-actions');
    if (actionsHost && !actionsHost.dataset.mathEditorActionsBound) {
      actionsHost.dataset.mathEditorActionsBound = '1';
      const cancel = trackController(
        createButton({
          label: '取消',
          title: '取消编辑',
          onClick: () => {
            close();
            callbacks.onCancel();
          },
        }),
      );
      cancel.element.id = 'btnMathFnEditCancel';
      cancel.element.classList.add('btn', 'ghost');
      const submit = trackController(
        createButton({ label: '保存', title: '保存修改', onClick: () => submit() }),
      );
      submit.element.id = 'btnMathFnEditSubmit';
      submit.element.classList.add('btn', 'primary');
      actionsHost.replaceChildren(cancel.element, submit.element);
    }

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

  /** B5 样板：清除绑定标记，允许二次 mount 重建绑定（与 function-panel.dispose 对称）。 */
  function dispose() {
    if (root) {
      delete root.dataset.mathEditorBound;
      const actionsHost = root.querySelector('.math-fn-add-actions');
      if (actionsHost) delete actionsHost.dataset.mathEditorActionsBound;
    }
    for (const controller of uiControllers.splice(0)) {
      controller.dispose();
    }
  }

  return { open, close, submit, bind, getEditing: () => editing, dispose };
}
