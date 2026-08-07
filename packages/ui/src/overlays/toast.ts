import type { UiController } from '../contract.js';
import { setText } from '../contract.js';

export interface ToastProps {
  message?: string;
  kind?: 'info' | 'success' | 'error';
  durationMs?: number;
  onDismiss?: () => void;
}

export type ToastEvents = { dismiss: void };

/** Toast：短暂显示后自动消失（durationMs），dispose 清理 timer。 */
export function createToast(initial: ToastProps = {}): UiController<ToastProps, ToastEvents> {
  const element = document.createElement('div');
  element.className = 'ui-toast';
  element.setAttribute('role', 'status');

  let props: ToastProps = { ...initial };
  let dismissHandler: ((payload: unknown) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const render = () => {
    element.classList.toggle('is-info', props.kind === 'info');
    element.classList.toggle('is-success', props.kind === 'success');
    element.classList.toggle('is-error', props.kind === 'error');
    setText(element, props.message ?? '');
  };
  const schedule = () => {
    if (timer != null) clearTimeout(timer);
    const ms = props.durationMs ?? 3000;
    if (ms > 0) {
      timer = setTimeout(() => {
        if (disposed) return;
        timer = null;
        props.onDismiss?.();
        dismissHandler?.(undefined);
      }, ms);
    }
  };
  render();
  schedule();

  return {
    element,
    update(next) {
      props = { ...props, ...next };
      render();
      schedule();
    },
    on(event, handler) {
      if (event === 'dismiss') dismissHandler = handler;
      return () => {
        if (event === 'dismiss' && dismissHandler === handler) dismissHandler = null;
      };
    },
    dispose() {
      disposed = true;
      if (timer != null) clearTimeout(timer);
      timer = null;
      element.remove();
    },
  };
}
