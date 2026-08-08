import type { BaseProps, UiController } from '../contract.js';
import { applyAriaLabel, applyStates } from '../contract.js';

export interface NumberInputProps extends BaseProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;
}

export type NumberInputEvents = { change: number; commit: number };

/** NumberInput：数值输入 + 上下键步进 + Enter 提交（高频 change 与提交分离）。 */
export function createNumberInput(
  initial: NumberInputProps = {},
): UiController<NumberInputProps, NumberInputEvents> {
  const element = document.createElement('input');
  element.type = 'number';
  element.className = 'ui-number-input';

  let props: NumberInputProps = { ...initial };
  let changeHandler: ((payload: unknown) => void) | null = null;
  let commitHandler: ((payload: unknown) => void) | null = null;

  const clamp = (v: number): number => {
    let n = Number.isFinite(v) ? v : 0;
    if (props.min != null) n = Math.max(props.min, n);
    if (props.max != null) n = Math.min(props.max, n);
    return n;
  };

  const render = () => {
    element.value = String(clamp(props.value ?? 0));
    element.disabled = Boolean(props.disabled);
    applyStates(element, props);
    applyAriaLabel(element, props['aria-label']);
    if (props.min != null) element.setAttribute('min', String(props.min));
    if (props.max != null) element.setAttribute('max', String(props.max));
  };

  const onInput = () => {
    const n = Number(element.value);
    const clamped = clamp(Number.isFinite(n) ? n : (props.value ?? 0));
    props.onChange?.(clamped);
    changeHandler?.(clamped);
  };
  const onKeyDown = (ev: KeyboardEvent) => {
    const step = props.step ?? 1;
    let next: number | null = null;
    if (ev.key === 'ArrowUp') next = clamp((props.value ?? 0) + step);
    else if (ev.key === 'ArrowDown') next = clamp((props.value ?? 0) - step);
    else if (ev.key === 'Enter') {
      ev.preventDefault();
      props.onCommit?.(props.value ?? 0);
      commitHandler?.(props.value ?? 0);
      return;
    }
    if (next != null) {
      ev.preventDefault();
      props.onChange?.(next);
      changeHandler?.(next);
    }
  };
  element.addEventListener('input', onInput);
  element.addEventListener('keydown', onKeyDown);
  render();

  return {
    element,
    update(next) {
      props = { ...props, ...next };
      render();
    },
    on(event, handler) {
      if (event === 'change') changeHandler = handler;
      if (event === 'commit') commitHandler = handler;
      return () => {
        if (event === 'change' && changeHandler === handler) changeHandler = null;
        if (event === 'commit' && commitHandler === handler) commitHandler = null;
      };
    },
    dispose() {
      element.removeEventListener('input', onInput);
      element.removeEventListener('keydown', onKeyDown);
      element.remove();
    },
  };
}
