import type { UiController } from '../contract.js';

export interface IconProps {
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  'aria-label'?: string;
}

export type IconEvents = Record<string, never>;

/** 图标：纯文本/unicode 占位（后续接图标字体或 svg sprite；安全文本输出）。 */
export function createIcon(initial: IconProps = {}): UiController<IconProps, IconEvents> {
  const element = document.createElement('span');
  element.className = 'ui-icon';
  const render = (props: IconProps) => {
    element.classList.toggle('is-sm', props.size === 'sm');
    element.classList.toggle('is-lg', props.size === 'lg');
    if (props['aria-label']) element.setAttribute('aria-label', props['aria-label']);
  };
  render(initial);
  return {
    element,
    update(next) {
      render({ ...initial, ...next });
    },
    on() {
      return () => {};
    },
    dispose() {
      element.remove();
    },
  };
}
