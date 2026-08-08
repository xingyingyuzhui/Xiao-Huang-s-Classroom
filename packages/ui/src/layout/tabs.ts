import type { UiController } from '../contract.js';
import { setText } from '../contract.js';

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs?: TabItem[];
  activeId?: string | null;
  onChange?: (id: string) => void;
}

export type TabsEvents = { change: string };

/** Tabs：键盘左右切换 + 激活态。 */
export function createTabs(initial: TabsProps = {}): UiController<TabsProps, TabsEvents> {
  const element = document.createElement('div');
  element.className = 'ui-tabs';
  element.setAttribute('role', 'tablist');

  let props: TabsProps = { ...initial };
  let changeHandler: ((payload: unknown) => void) | null = null;
  const buttons = new Map<string, HTMLElement>();
  /** 当前按钮的 click 解绑函数（render 重建与 dispose 时执行，防泄漏） */
  let clickCleanups: Array<() => void> = [];

  const select = (id: string) => {
    if (!props.tabs?.some((t) => t.id === id)) return;
    props.onChange?.(id);
    changeHandler?.(id);
  };

  const render = () => {
    for (const off of clickCleanups) off();
    clickCleanups = [];
    element.replaceChildren();
    buttons.clear();
    for (const tab of props.tabs ?? []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ui-tab';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('data-tab-id', tab.id);
      if (tab.id === props.activeId) btn.classList.add('is-active');
      setText(btn, tab.label);
      const onClick = () => select(tab.id);
      btn.addEventListener('click', onClick);
      clickCleanups.push(() => btn.removeEventListener('click', onClick));
      buttons.set(tab.id, btn);
      element.appendChild(btn);
    }
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const tabs = props.tabs ?? [];
    if (!tabs.length) return;
    const idx = tabs.findIndex((t) => t.id === props.activeId);
    const next =
      ev.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
    ev.preventDefault();
    const nextTab = tabs[next];
    if (nextTab) {
      select(nextTab.id);
      buttons.get(nextTab.id)?.focus?.();
    }
  };
  element.addEventListener('keydown', onKeyDown);
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
      for (const off of clickCleanups) off();
      clickCleanups = [];
      element.removeEventListener('keydown', onKeyDown);
      element.remove();
    },
  };
}
