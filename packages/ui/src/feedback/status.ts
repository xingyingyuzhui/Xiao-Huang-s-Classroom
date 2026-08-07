import type { BaseProps, UiController } from '../contract.js';
import { applyStates, setText } from '../contract.js';

export interface StatusProps extends BaseProps {
  kind?: 'loading' | 'empty' | 'error';
  message?: string;
}

export type StatusEvents = Record<string, never>;

/** Loading/Empty/Error 状态组件（spec §8.2 feedback）。 */
export function createStatus(initial: StatusProps = {}): UiController<StatusProps, StatusEvents> {
  const element = document.createElement('div');
  element.className = 'ui-status';
  const render = (props: StatusProps) => {
    element.classList.toggle('is-loading', props.kind === 'loading');
    element.classList.toggle('is-empty', props.kind === 'empty');
    element.classList.toggle('is-error', props.kind === 'error');
    applyStates(element, props);
    setText(
      element,
      props.kind === 'loading' ? (props.message ?? '加载中…') : (props.message ?? ''),
    );
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
