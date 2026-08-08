import type { BaseProps, UiController } from '../contract.js';
import { applyStates, setText } from '../contract.js';

export interface DialogProps extends BaseProps {
  title?: string;
  open?: boolean;
  /** 打开前的焦点元素（opener）；关闭时焦点归还（a11y 基线）。 */
  opener?: HTMLElement | null;
  onClose?: () => void;
}

export type DialogEvents = { close: void };

let dialogSeq = 0;

/** Dialog：role=dialog + aria-modal + ESC 关闭 + 焦点归还 opener + mount/update/dispose。
 *  title 渲染进独立 h2.ui-dialog-title（供 aria-labelledby），调用方可安全追加内容子节点。 */
export function createDialog(initial: DialogProps = {}): UiController<DialogProps, DialogEvents> {
  const element = document.createElement('div');
  element.className = 'ui-dialog';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');

  const titleEl = document.createElement('h2');
  titleEl.className = 'ui-dialog-title';
  titleEl.id = `ui-dialog-title-${++dialogSeq}`;
  element.appendChild(titleEl);

  let props: DialogProps = { ...initial };
  let closeHandler: ((payload: unknown) => void) | null = null;
  let onKeyDown: ((ev: KeyboardEvent) => void) | null = null;

  const render = () => {
    element.hidden = !props.open;
    applyStates(element, props);
    const title = props.title ?? '';
    titleEl.hidden = !title;
    setText(titleEl, title);
    if (title) element.setAttribute('aria-labelledby', titleEl.id);
    else element.removeAttribute('aria-labelledby');
  };
  const requestClose = () => {
    if (!props.open) return;
    props.onClose?.();
    closeHandler?.(undefined);
    props.opener?.focus?.();
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
