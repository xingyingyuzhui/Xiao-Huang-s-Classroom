import type { UiController } from '../contract.js';

export interface StackProps {
  direction?: 'row' | 'column';
  gap?: 'sm' | 'md' | 'lg';
  children?: unknown[];
}

export type StackEvents = Record<string, never>;

/** Stack：方向与间距布局容器。 */
export function createStack(initial: StackProps = {}): UiController<StackProps, StackEvents> {
  const element = document.createElement('div');
  element.className = 'ui-stack';
  const render = (props: StackProps) => {
    element.classList.toggle('is-row', props.direction === 'row');
    element.classList.toggle('is-column', props.direction !== 'row');
    element.classList.toggle('is-gap-sm', props.gap === 'sm');
    element.classList.toggle('is-gap-lg', props.gap === 'lg');
    if (props.children) {
      element.replaceChildren();
      for (const child of props.children) {
        if (child instanceof HTMLElement) element.appendChild(child);
      }
    }
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
