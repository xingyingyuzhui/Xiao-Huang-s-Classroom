import type { BaseProps, UiController } from '../contract.js';
import { applyStates, setText } from '../contract.js';

export interface ButtonProps extends BaseProps {
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** 附加 class（真实消费方保留既有样式时使用） */
  className?: string;
  /** 原生 tooltip（title 属性） */
  title?: string;
  onClick?: () => void;
}

export type ButtonEvents = { click: void };

export function createButton(initial: ButtonProps = {}): UiController<ButtonProps, ButtonEvents> {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'ui-btn';
  if (initial.className) element.classList.add(initial.className);

  let props: ButtonProps = { ...initial };
  let clickHandler: ((payload: unknown) => void) | null = null;

  const render = () => {
    element.classList.toggle('is-primary', props.kind === 'primary');
    element.classList.toggle('is-secondary', props.kind === 'secondary');
    element.classList.toggle('is-ghost', props.kind === 'ghost');
    element.classList.toggle('is-danger', props.kind === 'danger');
    element.classList.toggle('is-sm', props.size === 'sm');
    element.classList.toggle('is-lg', props.size === 'lg');
    applyStates(element, props);
    setText(element, props.loading ? '加载中…' : (props.label ?? ''));
    if (props.disabled) element.setAttribute('disabled', '');
    else element.removeAttribute('disabled');
    if (props['aria-label']) element.setAttribute('aria-label', props['aria-label']);
    if (props.title) element.setAttribute('title', props.title);
  };
  const onClick = () => {
    if (props.disabled || props.loading) return;
    props.onClick?.();
    clickHandler?.(undefined);
  };
  element.addEventListener('click', onClick);
  render();

  return {
    element,
    update(next) {
      props = { ...props, ...next };
      render();
    },
    on(event, handler) {
      if (event === 'click') clickHandler = handler;
      return () => {
        if (event === 'click' && clickHandler === handler) clickHandler = null;
      };
    },
    dispose() {
      element.removeEventListener('click', onClick);
      element.remove();
    },
  };
}
