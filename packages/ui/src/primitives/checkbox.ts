import type { BaseProps, UiController } from '../contract.js';
import { applyStates } from '../contract.js';

export interface CheckboxProps extends BaseProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export type CheckboxEvents = { change: boolean };

export function createCheckbox(
  initial: CheckboxProps = {},
): UiController<CheckboxProps, CheckboxEvents> {
  const element = document.createElement('input');
  element.type = 'checkbox';
  element.className = 'ui-checkbox';

  let props: CheckboxProps = { ...initial };
  let changeHandler: ((payload: unknown) => void) | null = null;

  const render = () => {
    element.checked = Boolean(props.checked);
    element.disabled = Boolean(props.disabled);
    applyStates(element, props);
  };
  const onChange = () => {
    if (props.disabled) return;
    props.onChange?.(element.checked);
    changeHandler?.(element.checked);
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
