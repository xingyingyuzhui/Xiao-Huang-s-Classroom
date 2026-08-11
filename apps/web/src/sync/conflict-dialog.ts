import type { ConflictRecord, ConflictResolution } from '@xiaohuang/sync-core';
import { createButton, createDialog } from '@xiaohuang/ui';

export type ConflictDialogOptions = {
  conflicts: ConflictRecord[];
  onResolve: (conflictId: string, resolution: ConflictResolution) => void;
  onClose: () => void;
};

function summarize(value: unknown): string {
  if (value == null) return '（无）';
  if (typeof value === 'string') return value.length > 80 ? value.slice(0, 80) + '…' : value;
  try {
    const json = JSON.stringify(value);
    return json.length > 80 ? json.slice(0, 80) + '…' : json;
  } catch {
    return String(value);
  }
}

export function showConflictDialog(options: ConflictDialogOptions): void {
  const { conflicts, onResolve, onClose } = options;

  const dialog = createDialog({
    title: '同步冲突',
    open: true,
    onClose: () => {
      dialog.dispose();
      onClose();
    },
  });

  const body = document.createElement('div');
  body.className = 'conflict-dialog-body';

  for (const conflict of conflicts) {
    const card = document.createElement('div');
    card.className = 'conflict-card';
    card.setAttribute('data-conflict-id', conflict.conflictId);

    const header = document.createElement('div');
    header.className = 'conflict-card-header';
    header.textContent = `${conflict.resourceType} / ${conflict.resourceId}`;
    card.appendChild(header);

    const localDiv = document.createElement('div');
    localDiv.className = 'conflict-local';
    localDiv.textContent = `本地：${summarize(conflict.snapshot.local)}`;
    card.appendChild(localDiv);

    const cloudDiv = document.createElement('div');
    cloudDiv.className = 'conflict-cloud';
    cloudDiv.textContent = `云端：${summarize(conflict.snapshot.cloud)}`;
    card.appendChild(cloudDiv);

    const actions = document.createElement('div');
    actions.className = 'conflict-actions';

    const keepLocalBtn = createButton({
      label: '保留本地版本',
      kind: 'secondary',
      onClick: () => onResolve(conflict.conflictId, 'keepLocal'),
    });
    actions.appendChild(keepLocalBtn.element);

    const keepCloudBtn = createButton({
      label: '使用云端版本',
      kind: 'secondary',
      onClick: () => onResolve(conflict.conflictId, 'keepCloud'),
    });
    actions.appendChild(keepCloudBtn.element);

    if (conflict.supportsDuplicateLocal) {
      const dupBtn = createButton({
        label: '两者都保留',
        kind: 'ghost',
        onClick: () => onResolve(conflict.conflictId, 'duplicateLocal'),
      });
      actions.appendChild(dupBtn.element);
    }

    card.appendChild(actions);
    body.appendChild(card);
  }

  dialog.element.appendChild(body);
  document.body.appendChild(dialog.element);
}
