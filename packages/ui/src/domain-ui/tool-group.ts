import type { UiController } from '../contract.js';
import { setText } from '../contract.js';

export interface ToolItem {
  id: string;
  label: string;
  tip?: string;
}

export interface ToolGroupProps {
  tools?: ToolItem[];
  activeId?: string | null;
  onChange?: (id: string) => void;
}

export type ToolGroupEvents = { change: string };

/** ToolGroup：单选工具组（罗盘/画板工具栏语义）。 */
export function createToolGroup(
  initial: ToolGroupProps = {},
): UiController<ToolGroupProps, ToolGroupEvents> {
  const element = document.createElement('div');
  element.className = 'ui-tool-group';
  element.setAttribute('role', 'toolbar');

  let props: ToolGroupProps = { ...initial };
  let changeHandler: ((payload: unknown) => void) | null = null;
  const buttons = new Map<string, HTMLElement>();

  const select = (id: string) => {
    if (!props.tools?.some((t) => t.id === id)) return;
    props.onChange?.(id);
    changeHandler?.(id);
  };

  const render = () => {
    element.replaceChildren();
    buttons.clear();
    for (const tool of props.tools ?? []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ui-tool';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', tool.id === props.activeId ? 'true' : 'false');
      if (tool.id === props.activeId) btn.classList.add('is-active');
      if (tool.tip) btn.setAttribute('aria-label', tool.tip);
      setText(btn, tool.label);
      btn.addEventListener('click', () => select(tool.id));
      buttons.set(tool.id, btn);
      element.appendChild(btn);
    }
  };
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
      element.remove();
    },
  };
}
