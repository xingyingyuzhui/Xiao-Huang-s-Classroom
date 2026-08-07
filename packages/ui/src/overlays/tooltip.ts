import type { UiController } from '../contract.js';
import { setText } from '../contract.js';

export interface TooltipProps {
  text?: string;
  visible?: boolean;
}

export type TooltipEvents = Record<string, never>;

export function createTooltip(initial: TooltipProps = {}): UiController<TooltipProps, TooltipEvents> {
  const element = document.createElement('div');
  element.className = 'ui-tooltip';
  element.setAttribute('role', 'tooltip');
  const render = (props: TooltipProps) => {
    element.hidden = !props.visible;
    setText(element, props.text ?? '');
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
