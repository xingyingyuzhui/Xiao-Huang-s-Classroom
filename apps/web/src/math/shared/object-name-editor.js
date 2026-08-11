/**
 * 对象样式气泡内的名称分段编辑（样式/字母/数字）+ keypad 绑定。
 */

import { hideNameKeypad, showNameKeypad } from './name-keypad.js';
import {
  formatStructuredName,
  isEmptyNameSegments,
  parseStructuredName,
} from './name-segments.js';

/**
 * @param {{
 *   root: HTMLElement,
 *   getTarget: () => any,
 *   getNameEditHooks: () => null | {
 *     canEditName?: (el: any) => boolean,
 *     getName?: (el: any) => string,
 *     getNameKind?: (el: any) => 'point' | 'line',
 *     setName?: (el: any, formatted: string, segments: { style: string, letter: string, number: string }) => void,
 *   },
 *   detectObjectKind: (el: any) => string,
 *   setFieldVisible: (field: string, on: boolean) => void,
 * }} opts
 */
export function createObjectNameEditor(opts) {
  const { root, getTarget, getNameEditHooks, detectObjectKind, setFieldVisible } = opts;

  const nameSegmentsHost = /** @type {HTMLElement | null} */ (
    root.querySelector('[data-role="nameSegments"]')
  );
  const nameStyleBtn = /** @type {HTMLButtonElement | null} */ (
    root.querySelector('[data-seg="style"]')
  );
  const nameLetterBtn = /** @type {HTMLButtonElement | null} */ (
    root.querySelector('[data-seg="letter"]')
  );
  const nameNumberBtn = /** @type {HTMLButtonElement | null} */ (
    root.querySelector('[data-seg="number"]')
  );

  /** @type {{ style: string, letter: string, number: string }} */
  let nameSegments = { style: '', letter: '', number: '' };
  let bound = false;

  function resolveNameKind() {
    const target = getTarget();
    const hooks = getNameEditHooks();
    if (typeof hooks?.getNameKind === 'function' && target) {
      const k = hooks.getNameKind(target);
      if (k === 'line' || k === 'point') return k;
    }
    const kind = detectObjectKind(target);
    return kind === 'line' ? 'line' : 'point';
  }

  function readCurrentName() {
    const target = getTarget();
    const hooks = getNameEditHooks();
    if (typeof hooks?.getName === 'function' && target) {
      return String(hooks.getName(target) || '');
    }
    return String(target?._mathBaseName || target?._mathSelectLabel || target?.name || '');
  }

  function canEditCurrentName() {
    const target = getTarget();
    if (!target) return false;
    const hooks = getNameEditHooks();
    if (typeof hooks?.canEditName === 'function') {
      return Boolean(hooks.canEditName(target));
    }
    const kind = detectObjectKind(target);
    return kind === 'point' || kind === 'line';
  }

  function paintNameSegments() {
    const editable = canEditCurrentName();
    setFieldVisible('nameRow', editable);
    if (!editable) return;
    nameSegments = parseStructuredName(readCurrentName(), resolveNameKind());
    if (nameStyleBtn) {
      nameStyleBtn.textContent = nameSegments.style || '样式';
      nameStyleBtn.classList.toggle('is-placeholder', !nameSegments.style);
    }
    if (nameLetterBtn) {
      nameLetterBtn.textContent = nameSegments.letter || '字母';
      nameLetterBtn.classList.toggle('is-placeholder', !nameSegments.letter);
    }
    if (nameNumberBtn) {
      nameNumberBtn.textContent = nameSegments.number || '—';
      nameNumberBtn.classList.toggle('is-placeholder', !nameSegments.number);
    }
  }

  /**
   * @param {{ style?: string, letter?: string, number?: string }} patch
   */
  function commitNameSegments(patch) {
    const target = getTarget();
    if (!target) return;
    const next = {
      style: patch.style !== undefined ? patch.style : nameSegments.style,
      letter: patch.letter !== undefined ? patch.letter : nameSegments.letter,
      number: patch.number !== undefined ? patch.number : nameSegments.number,
    };
    if (isEmptyNameSegments(next)) return;
    const formatted = formatStructuredName(next);
    nameSegments = next;
    const hooks = getNameEditHooks();
    if (typeof hooks?.setName === 'function') {
      hooks.setName(target, formatted, next);
    } else {
      target._mathBaseName = formatted;
      target._mathSelectLabel = formatted;
      try {
        target.name = formatted;
      } catch {
        /* */
      }
      try {
        target._mathLiveLabelTick?.();
      } catch {
        /* */
      }
      try {
        target.board?.update?.();
      } catch {
        /* */
      }
    }
    paintNameSegments();
  }

  function onSegmentsClick(ev) {
    const btn = /** @type {HTMLElement} */ (ev.target).closest?.('[data-seg]');
    const target = getTarget();
    if (!btn || !target || !canEditCurrentName()) return;
    ev.preventDefault();
    ev.stopPropagation();
    const seg = btn.getAttribute('data-seg');
    const kind = resolveNameKind();
    if (seg === 'style') {
      showNameKeypad({
        anchor: btn,
        mode: 'style',
        kind,
        onPick: (word) => commitNameSegments({ style: word }),
        onClear: () => commitNameSegments({ style: '' }),
      });
      return;
    }
    if (seg === 'letter') {
      showNameKeypad({
        anchor: btn,
        mode: 'letter',
        kind,
        onPick: (letter) => commitNameSegments({ letter }),
        onClear: () => commitNameSegments({ letter: '' }),
      });
      return;
    }
    if (seg === 'number') {
      showNameKeypad({
        anchor: btn,
        mode: 'number',
        kind,
        onPick: (digit) => {
          if (digit === '⌫') {
            commitNameSegments({ number: nameSegments.number.slice(0, -1) });
            return;
          }
          if (/^\d$/.test(digit)) {
            const next = `${nameSegments.number}${digit}`.slice(0, 4);
            commitNameSegments({ number: next });
          }
        },
        onClear: () => commitNameSegments({ number: '' }),
      });
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    nameSegmentsHost?.addEventListener('click', onSegmentsClick);
  }

  function hide() {
    hideNameKeypad();
  }

  function dispose() {
    hideNameKeypad();
    if (bound) {
      nameSegmentsHost?.removeEventListener('click', onSegmentsClick);
      bound = false;
    }
    nameSegments = { style: '', letter: '', number: '' };
  }

  return {
    resolveNameKind,
    readCurrentName,
    canEditCurrentName,
    paintNameSegments,
    commitNameSegments,
    bind,
    hide,
    dispose,
  };
}
