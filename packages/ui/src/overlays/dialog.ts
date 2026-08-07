import type { BaseProps, UiController } from '../contract.js';
import { applyStates, setText } from '../contract.js';

export interface DialogProps extends BaseProps {
  title?: string;
  open?: boolean;
  onClose?: () => void;
}

export type DialogEvents = { close: void };

/** Dialog：焦点陷阱 + ESC 关闭 + mount/update/dispose。 */
export function createDialog(initial: DialogProps = {}): UiController<DialogProps, DialogEvents> {
  const element = document.createElement('div');
  element.className = 'ui-dialog';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');

  let props: DialogProps = { ...initial };
  let closeHandler: ((payload: unknown) => void) | null = null;
  let onKeyDown: ((ev: KeyboardEvent) => void) | null = null;

  const render = () => {
    element.hidden = !props.open;
    applyStates(element, props);
    setText(element, props.title ?? '');
  };
  const requestClose = () => {
    props.onClose?.();
    closeHandler?.(undefined);
  };
  onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !props.open) return;
    ev.preventDefault();
    requestClose();
  };
  document.addEventListener('keydown', onKeyDown);
  render();

  return {
    element,
    update(next) {
      props = { ...props, ...next };
      render();
    },
    on(event, handler) {
      if (event === 'close') closeHandler = handler;
      return () => {
        if (event === 'close' && closeHandler === handler) closeHandler = null;
      };
    },
    dispose() {
      if (onKeyDown) document.removeEventListener('keydown', onKeyDown);
      element.remove();
    },
  };
}
