import type { ClassRecord } from '@xiaohuang/contracts';
import { createButton, createInput } from '@xiaohuang/ui';
import { appConfirm } from '../shared/ui/app-dialog.js';

export type ClassSwitcherOptions = {
  classes: ClassRecord[];
  trash?: ClassRecord[];
  activeClassId: string | null;
  onSwitch: (classId: string | null) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (classId: string) => Promise<void>;
  onCopy?: (classId: string, name: string) => Promise<void>;
  onRestore?: (classId: string) => Promise<void>;
};

export function renderClassSwitcher(container: HTMLElement, options: ClassSwitcherOptions): void {
  const { classes, trash = [], activeClassId, onSwitch, onCreate, onDelete, onCopy, onRestore } =
    options;
  container.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'class-switcher';

  const list = document.createElement('ul');
  list.className = 'class-switcher-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', '班级列表');

  const personalLi = document.createElement('li');
  personalLi.className = 'class-switcher-item';
  personalLi.setAttribute('role', 'option');
  personalLi.setAttribute('aria-selected', activeClassId == null ? 'true' : 'false');
  if (activeClassId == null) personalLi.classList.add('is-active');
  const personalLabel = document.createElement('span');
  personalLabel.textContent = '个人空间';
  personalLi.appendChild(personalLabel);
  personalLi.addEventListener('click', () => {
    if (activeClassId == null) return;
    onSwitch(null);
  });
  list.appendChild(personalLi);

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

    li.addEventListener('click', () => {
      if (cls.id === activeClassId) return;
      onSwitch(cls.id);
    });

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
    deleteBtn.element.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    li.appendChild(deleteBtn.element);

    if (onCopy) {
      const copyBtn = createButton({
        label: '复制',
        kind: 'ghost',
        size: 'sm',
        onClick: async () => {
          const name = `${cls.name} 副本`;
          copyBtn.update({ disabled: true, loading: true });
          try {
            await onCopy(cls.id, name);
          } finally {
            copyBtn.update({ disabled: false, loading: false });
          }
        },
      });
      copyBtn.element.classList.add('class-switcher-copy');
      copyBtn.element.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      li.appendChild(copyBtn.element);
    }

    list.appendChild(li);
  }

  wrapper.appendChild(list);

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
      createBtn.update({ disabled: true, loading: true });
      try {
        await onCreate(name);
        (nameInput.element as HTMLInputElement).value = '';
      } finally {
        createBtn.update({ disabled: false, loading: false });
      }
    },
  });
  createRow.appendChild(createBtn.element);

  wrapper.appendChild(createRow);

  if (onRestore && trash.length > 0) {
    const trashTitle = document.createElement('p');
    trashTitle.className = 'settings-hint';
    trashTitle.textContent = '回收站（30 天内可恢复）';
    wrapper.appendChild(trashTitle);

    const trashList = document.createElement('ul');
    trashList.className = 'class-switcher-list class-switcher-trash';
    for (const cls of trash) {
      const li = document.createElement('li');
      li.className = 'class-switcher-item';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = cls.name;
      li.appendChild(nameSpan);
      const restoreBtn = createButton({
        label: '恢复',
        kind: 'secondary',
        size: 'sm',
        onClick: async () => {
          restoreBtn.update({ disabled: true, loading: true });
          try {
            await onRestore(cls.id);
          } finally {
            restoreBtn.update({ disabled: false, loading: false });
          }
        },
      });
      li.appendChild(restoreBtn.element);
      trashList.appendChild(li);
    }
    wrapper.appendChild(trashList);
  }

  container.appendChild(wrapper);
}
