/**
 * 开发态 UI Catalog（Program 3 Task 3.6 / UI 库计划 P1.3 验收场）。
 *
 * 非产品页面：不进正式导航与主包路径；仅 dev 构建 + `#dev-catalog` hash 时挂载。
 * 只从 @xiaohuang/ui 导入；全部皮肤来自全局 _ui-kit.css（主题语义 token）。
 * 桥接对比：className 挂既有业务类（math-fn-btn）vs 纯 ui-* 皮肤。
 */
import {
  createButton,
  createCheckbox,
  createDialog,
  createInput,
  createNumberInput,
  createReadoutCard,
  createSelect,
  createSlider,
  createStack,
  createStatus,
  createTabs,
  createToast,
  createToolGroup,
} from '@xiaohuang/ui';

function section(title) {
  const h = document.createElement('h2');
  h.textContent = title;
  return h;
}

function hint(text) {
  const p = document.createElement('p');
  p.className = 'catalog-hint';
  p.textContent = text;
  return p;
}

function mountCatalog(root) {
  // 目录页借用 #app 容器：恢复普通文档流并允许滚动
  root.style.display = 'block';
  root.style.overflow = 'auto';
  root.style.padding = '1.5rem';
  root.replaceChildren();

  const h1 = document.createElement('h1');
  h1.textContent = 'UI Catalog（开发态验收场）';
  root.appendChild(h1);
  root.appendChild(
    hint('非产品页面 · 换肤验证请改 <html data-theme="…"> · 皮肤全部来自 _ui-kit.css + 主题 token'),
  );

  /* —— Button：全部 kind / size / 状态 —— */
  root.appendChild(section('Button'));
  const kindRow = createStack({ direction: 'row', gap: 'md' });
  for (const [label, kind] of [
    ['主要 primary', 'primary'],
    ['次要 secondary', 'secondary'],
    ['幽灵 ghost', 'ghost'],
    ['危险 danger', 'danger'],
  ]) {
    kindRow.element.appendChild(createButton({ label, kind }).element);
  }
  root.appendChild(kindRow.element);

  const sizeRow = createStack({ direction: 'row', gap: 'md' });
  sizeRow.element.append(
    createButton({ label: '小号', size: 'sm' }).element,
    createButton({ label: '中号' }).element,
    createButton({ label: '大号', size: 'lg' }).element,
  );
  root.appendChild(sizeRow.element);

  const stateRow = createStack({ direction: 'row', gap: 'md' });
  stateRow.element.append(
    createButton({ label: '禁用', disabled: true }).element,
    createButton({ label: '保存中', loading: true }).element,
    createButton({ label: '主要·禁用', kind: 'primary', disabled: true }).element,
    createButton({ label: '危险·加载', kind: 'danger', loading: true }).element,
  );
  root.appendChild(stateRow.element);

  /* —— 桥接模式对比 —— */
  root.appendChild(section('桥接模式（className 挂既有业务类）'));
  const bridgeRow = createStack({ direction: 'row', gap: 'md' });
  bridgeRow.element.append(
    createButton({ label: '纯 ui 皮肤', kind: 'primary' }).element,
    createButton({ label: '桥接 math-fn-btn', className: 'math-fn-btn' }).element,
    createButton({
      label: '桥接 math-fn-btn + primary',
      kind: 'primary',
      className: 'math-fn-btn',
    }).element,
  );
  root.appendChild(bridgeRow.element);
  root.appendChild(
    hint('左：纯 ui-* 皮肤；中/右：className 桥接既有 .math-fn-btn 样式，迁移期双轨共存。'),
  );

  /* —— 表单控件 —— */
  root.appendChild(section('Input / Select / Slider / Checkbox / NumberInput'));
  const formStack = createStack({ direction: 'column', gap: 'md' });
  formStack.element.appendChild(
    createInput({ value: 'f(x) = x²', placeholder: '输入表达式' }).element,
  );
  const selectRow = createStack({ direction: 'row', gap: 'md' });
  selectRow.element.append(
    createSelect({
      options: [
        { value: 'a', label: '选项 A' },
        { value: 'b', label: '选项 B' },
        { value: 'c', label: '选项 C' },
      ],
    }).element,
    createCheckbox({ label: '显示坐标', checked: true }).element,
    createCheckbox({ label: '锁定比例' }).element,
  );
  formStack.element.appendChild(selectRow.element);
  formStack.element.appendChild(createSlider({ value: 42, min: 0, max: 100 }).element);
  formStack.element.appendChild(
    createNumberInput({ value: 5, min: 0, max: 10, step: 1 }).element,
  );
  root.appendChild(formStack.element);

  /* —— Tabs / ToolGroup —— */
  root.appendChild(section('Tabs / ToolGroup'));
  const tabs = createTabs({
    tabs: [
      { id: 'fn', label: '函数' },
      { id: 'pt', label: '点' },
      { id: 'line', label: '直线' },
    ],
    activeId: 'fn',
    onChange: (id) => tabs.update({ activeId: id }),
  });
  const tools = createToolGroup({
    tools: [
      { id: 'select', label: '选择' },
      { id: 'point', label: '描点' },
      { id: 'erase', label: '擦除' },
    ],
    activeId: 'select',
    onChange: (id) => tools.update({ activeId: id }),
  });
  const tabRow = createStack({ direction: 'column', gap: 'md' });
  tabRow.element.append(tabs.element, tools.element);
  root.appendChild(tabRow.element);

  /* —— ReadoutCard / Status —— */
  root.appendChild(section('ReadoutCard / Status'));
  const readoutRow = createStack({ direction: 'row', gap: 'md' });
  readoutRow.element.append(
    createReadoutCard({
      title: '特征卡',
      rows: [
        { key: '零点', value: 'x≈1.5' },
        { key: '极小值', value: '(0.5, -2.25)' },
        { key: '对称轴', value: 'x=0.5' },
      ],
    }).element,
    createReadoutCard({ rows: [], emptyText: '暂无读数' }).element,
  );
  root.appendChild(readoutRow.element);
  const statusStack = createStack({ direction: 'column', gap: 'md' });
  statusStack.element.append(
    createStatus({ kind: 'loading', message: '数值分析中…' }).element,
    createStatus({ kind: 'empty', message: '暂无数据' }).element,
    createStatus({ kind: 'error', message: '渲染失败：请刷新' }).element,
  );
  root.appendChild(statusStack.element);

  /* —— Dialog ——
   * 注意：当前 createDialog 的 render 会 setText 根节点（title），update 会清掉
   * 消费方追加的子节点；本演示用「创建即打开 + dispose 关闭」模式，避免该行为
   * （open 属性切换的语义收尾在 P2.4 app-dialog 决策时一并硬化）。
   */
  root.appendChild(section('Dialog'));
  const openDialog = createButton({
    label: '打开对话框',
    kind: 'secondary',
    onClick: () => {
      const dlg = createDialog({
        title: '确认删除函数？',
        open: true,
        onClose: () => dlg.dispose(),
      });
      const body = document.createElement('div');
      body.textContent = '删除后不可恢复，确定继续吗？';
      const actions = createStack({ direction: 'row', gap: 'sm' });
      actions.element.append(
        createButton({ label: '取消', onClick: () => dlg.dispose() }).element,
        createButton({
          label: '删除',
          kind: 'danger',
          onClick: () => dlg.dispose(),
        }).element,
      );
      dlg.element.appendChild(body);
      dlg.element.appendChild(actions.element);
      root.appendChild(dlg.element);
    },
  });
  root.appendChild(openDialog.element);
  root.appendChild(hint('ESC 或「取消/删除」关闭；背景由 .ui-dialog::before 遮罩。'));

  /* —— Toast —— */
  root.appendChild(section('Toast'));
  const toastStack = createStack({ direction: 'column', gap: 'md' });
  // 静态展示三种 kind（durationMs=0 不自动消失）；toast 均为 fixed 定位，
  // 用行内 bottom 错开避免重叠（仅目录页演示用）。
  for (const [message, kind, offset] of [
    ['提示：已完成', 'info', '1.5rem'],
    ['成功：已保存', 'success', '4.6rem'],
    ['错误：保存失败', 'error', '7.7rem'],
  ]) {
    const t = createToast({ message, kind, durationMs: 0 });
    t.element.style.bottom = offset;
    toastStack.element.appendChild(t.element);
  }
  root.appendChild(toastStack.element);
  const fireToast = createButton({
    label: '弹出 3 秒 Toast',
    onClick: () => {
      const t = createToast({
        message: '操作成功（3 秒后消失）',
        kind: 'success',
        durationMs: 3000,
        onDismiss: () => t.dispose(),
      });
      document.body.appendChild(t.element);
    },
  });
  root.appendChild(fireToast.element);
}

export { mountCatalog };
