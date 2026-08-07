import type { UiController } from '../contract.js';
import { setText } from '../contract.js';

export interface ReadoutRow {
  key: string;
  value: string;
}

export interface ReadoutCardProps {
  title?: string;
  rows?: ReadoutRow[];
  emptyText?: string;
}

export type ReadoutCardEvents = Record<string, never>;

/** ReadoutCard：特征/读数卡（长文本截断由 CSS 处理；安全文本输出）。 */
export function createReadoutCard(
  initial: ReadoutCardProps = {},
): UiController<ReadoutCardProps, ReadoutCardEvents> {
  const element = document.createElement('div');
  element.className = 'ui-readout-card';
  const render = (props: ReadoutCardProps) => {
    element.replaceChildren();
    if (props.title) {
      const h = document.createElement('h3');
      h.className = 'ui-readout-title';
      setText(h, props.title);
      element.appendChild(h);
    }
    const rows = props.rows ?? [];
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'ui-readout-empty';
      setText(empty, props.emptyText ?? '暂无数据');
      element.appendChild(empty);
      return;
    }
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'ui-readout-row';
      const k = document.createElement('span');
      k.className = 'ui-readout-key';
      const v = document.createElement('span');
      v.className = 'ui-readout-value';
      setText(k, row.key);
      setText(v, row.value);
      line.appendChild(k);
      line.appendChild(v);
      element.appendChild(line);
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
