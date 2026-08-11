import type { ClassRecord } from '@xiaohuang/contracts';
import { createButton, createInput } from '@xiaohuang/ui';
import { appConfirm } from '../shared/ui/app-dialog.js';

export type ClassSwitcherOptions = {
  classes: ClassRecord[];
  activeClassId: string | null;
  onSwitch: (classId: string | null) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (classId: string) => Promise<void>;
};

export function renderClassSwitcher(container: HTMLElement, options: ClassSwitcherOptions): void {
  const { classes, activeClassId, onSwitch, onCreate, onDelete } = options;
  container.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'class-switcher';

  const list = document.createElement('ul');
  list.className = 'class-switcher-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', '班级列表');

  // Personal space option
  const personalLi = document.createElement('li');
  personalLi.className = 'class-switcher-item';
  personalLi.setAttribute('role', 'option');
  personalLi.setAttribute('aria-selected', activeClassId == null ? 'true' : 'false');
  if (activeClassId == null) personalLi.classList.add('is-active');
  const personalLabel = document.createElement('span');
  personalLabel.textContent = '个人空间';
  personalLi.appendChild(personalLabel);
  personalLi.addEventListener('click', () => onSwitch(null));
  list.appendChild(personalLi);

  // Class rows
  for (const cls of classes) {
    const li = document.createElement('li');
    li.className = 'class-switcher-item';
    li.setAttribute('role', 'option');
    const isActive = cls.id === activeClassId;
    li.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (isActive) li.classList.add('is-active');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'class-switcher-name';
    nameSpan.textContent = cls.name;
    li.appendChild(nameSpan);

    li.addEventListener('click', () => onSwitch(cls.id));

    const deleteBtn = createButton({
      label: '删除',
      kind: 'danger',
      size: 'sm',
      onClick: async () => {
        const confirmed = await appConfirm(
          `确定删除班级「${cls.name}」吗？删除后可在废纸篓中恢复。`,
          { danger: true },
        );
        if (confirmed) await onDelete(cls.id);
      },
    });
    deleteBtn.element.classList.add('class-switcher-delete');
    li.appendChild(deleteBtn.element);

    list.appendChild(li);
  }

  wrapper.appendChild(list);

  // Create new class
  const createRow = document.createElement('div');
  createRow.className = 'class-switcher-create';

  const nameInput = createInput({ placeholder: '班级名称' });
  createRow.appendChild(nameInput.element);

  const createBtn = createButton({
    label: '新建班级',
    kind: 'secondary',
    onClick: async () => {
      const name = (nameInput.element as HTMLInputElement).value.trim();
      if (!name) return;
      await onCreate(name);
    },
  });
  createRow.appendChild(createBtn.element);

  wrapper.appendChild(createRow);
  container.appendChild(wrapper);
}
