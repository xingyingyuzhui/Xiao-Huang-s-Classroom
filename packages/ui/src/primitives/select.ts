import type { BaseProps, UiController } from '../contract.js';
import { applyAriaLabel, applyStates, setText } from '../contract.js';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends BaseProps {
  options?: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
}

export type SelectEvents = { change: string };

export function createSelect(initial: SelectProps = {}): UiController<SelectProps, SelectEvents> {
  const element = document.createElement('select');
  element.className = 'ui-select';
  let props: SelectProps = { ...initial };
  let changeHandler: ((payload: unknown) => void) | null = null;
  const render = () => {
    element.replaceChildren();
    for (const opt of props.options ?? []) {
      const el = document.createElement('option');
      el.value = opt.value;
      setText(el, opt.label);
      element.appendChild(el);
    }
    element.value = props.value ?? props.options?.[0]?.value ?? '';
    element.disabled = Boolean(props.disabled);
    applyStates(element, props);
    applyAriaLabel(element, props['aria-label']);
  };
  const onChange = () => {
    props.onChange?.(element.value);
    changeHandler?.(element.value);
  };
  element.addEventListener('change', onChange);
  render();
  return {
    element,
    update(next) {
      props = { ...props, ...next };
      render();
    },
    on(event, handler) {
      if (event === 'change') changeHandler = handler;
      return () => {
        if (event === 'change' && changeHandler === handler) changeHandler = null;
      };
    },
    dispose() {
      element.removeEventListener('change', onChange);
      element.remove();
    },
  };
}
