import type { UiController } from '../contract.js';

export interface ProgressProps {
  value?: number;
  max?: number;
}

export type ProgressEvents = Record<string, never>;

export function createProgress(initial: ProgressProps = {}): UiController<ProgressProps, ProgressEvents> {
  const element = document.createElement('progress');
  element.className = 'ui-progress';
  const render = (props: ProgressProps) => {
    element.value = props.value ?? 0;
    element.max = props.max ?? 100;
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
