/**
 * 开发态 UI Catalog（Program 3 Task 3.6）。
 *
 * 非产品页面：不进正式导航与主包路径；仅 dev 构建 + `#dev-catalog` hash 时挂载。
 * 展示全组件状态矩阵（五主题对照由主题切换器体现；此处渲染状态矩阵）。
 */
import {
  createButton,
  createCheckbox,
  createTabs,
  createNumberInput,
  createToolGroup,
  createReadoutCard,
  createStatus,
  createDialog,
  createStack,
} from '@xiaohuang/ui';

function section(title) {
  const h = document.createElement('h2');
  h.textContent = title;
  return h;
}

function mountCatalog(root) {
  root.innerHTML =
    '<h1>UI Catalog（开发态）</h1><p class="catalog-hint">非产品页面 · 五主题对照请用右上主题切换器</p>';
  root.appendChild(section('Button'));
  const btnStack = createStack({ direction: 'row', gap: 'md' });
  for (const [label, kind] of [
    ['主要', 'primary'],
    ['次要', 'secondary'],
    ['幽灵', 'ghost'],
    ['危险', 'danger'],
  ]) {
    btnStack.element.appendChild(createButton({ label, kind }).element);
  }
  const disabledBtn = createButton({ label: '禁用', disabled: true });
  const loadingBtn = createButton({ label: '保存', loading: true });
  btnStack.element.append(disabledBtn.element, loadingBtn.element);
  root.appendChild(btnStack.element);

  root.appendChild(section('Checkbox / NumberInput'));
  const row2 = createStack({ direction: 'row', gap: 'md' });
  row2.element.appendChild(createCheckbox({ label: '显示坐标', checked: true }).element);
  row2.element.appendChild(createNumberInput({ value: 5, min: 0, max: 10 }).element);
  root.appendChild(row2.element);

  root.appendChild(section('Tabs / ToolGroup'));
  const tabs = createTabs({
    tabs: [
      { id: 'a', label: '函数' },
      { id: 'b', label: '点' },
    ],
    activeId: 'a',
    onChange: (id) => tabs.update({ activeId: id }),
  });
  const tools = createToolGroup({
    tools: [
      { id: 'select', label: '选择' },
      { id: 'point', label: '点' },
    ],
    activeId: 'select',
    onChange: (id) => tools.update({ activeId: id }),
  });
  root.appendChild(tabs.element);
  root.appendChild(tools.element);

  root.appendChild(section('ReadoutCard / Status'));
  root.appendChild(
    createReadoutCard({
      title: '特征卡',
      rows: [
        { key: '零点', value: 'x≈1.5' },
        { key: '极小值', value: '(0.5, -2.25)' },
      ],
    }).element,
  );
  root.appendChild(createStatus({ kind: 'loading', message: '数值分析中…' }).element);
  root.appendChild(createStatus({ kind: 'error', message: '渲染失败：请刷新' }).element);

  root.appendChild(section('Dialog'));
  const dlg = createDialog({ title: '确认删除？', open: false });
  const openBtn = createButton({
    label: '打开对话框',
    kind: 'secondary',
    onClick: () => dlg.update({ open: true }),
  });
  const closeBtn = createButton({ label: '关闭', onClick: () => dlg.update({ open: false }) });
  dlg.element.appendChild(closeBtn.element);
  root.appendChild(openBtn.element);
  root.appendChild(dlg.element);
}

export { mountCatalog };
