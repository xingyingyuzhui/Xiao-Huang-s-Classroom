import type { BaseProps, UiController } from '../contract.js';
import { applyStates } from '../contract.js';

export interface InputProps extends BaseProps {
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
}

export type InputEvents = { change: string };

export function createInput(initial: InputProps = {}): UiController<InputProps, InputEvents> {
  const element = document.createElement('input');
  element.type = 'text';
  element.className = 'ui-input';
  let props: InputProps = { ...initial };
  let changeHandler: ((payload: unknown) => void) | null = null;
  const render = () => {
    element.value = props.value ?? '';
    element.disabled = Boolean(props.disabled);
    applyStates(element, props);
    if (props.placeholder) element.setAttribute('placeholder', props.placeholder);
  };
  const onInput = () => {
    props.onChange?.(element.value);
    changeHandler?.(element.value);
  };
  element.addEventListener('input', onInput);
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
      element.removeEventListener('input', onInput);
      element.remove();
    },
  };
}
