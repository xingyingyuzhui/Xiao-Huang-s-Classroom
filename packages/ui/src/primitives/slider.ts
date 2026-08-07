import type { BaseProps, UiController } from '../contract.js';
import { applyStates } from '../contract.js';

export interface SliderProps extends BaseProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
}

export type SliderEvents = { change: number };

export function createSlider(initial: SliderProps = {}): UiController<SliderProps, SliderEvents> {
  const element = document.createElement('input');
  element.type = 'range';
  element.className = 'ui-slider';
  let props: SliderProps = { ...initial };
  let changeHandler: ((payload: unknown) => void) | null = null;
  const render = () => {
    element.value = String(props.value ?? 0);
    element.min = String(props.min ?? 0);
    element.max = String(props.max ?? 100);
    element.step = String(props.step ?? 1);
    element.disabled = Boolean(props.disabled);
    applyStates(element, props);
  };
  const onInput = () => {
    const v = Number(element.value);
    props.onChange?.(v);
    changeHandler?.(v);
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
