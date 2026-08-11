import type { ConflictRecord, ConflictResolution } from '@xiaohuang/sync-core';

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

function makeBtn(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

export function showConflictDialog(options: ConflictDialogOptions): void {
  const { conflicts, onResolve, onClose } = options;

  const overlay = document.createElement('div');
  overlay.className = 'conflict-dialog-overlay';

  const panel = document.createElement('div');
  panel.className = 'conflict-dialog-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const title = document.createElement('h2');
  title.textContent = '同步冲突';
  panel.appendChild(title);

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

    actions.appendChild(makeBtn('保留本地版本', () => onResolve(conflict.conflictId, 'keepLocal')));
    actions.appendChild(makeBtn('使用云端版本', () => onResolve(conflict.conflictId, 'keepCloud')));

    if (conflict.supportsDuplicateLocal) {
      actions.appendChild(makeBtn('两者都保留', () => onResolve(conflict.conflictId, 'duplicateLocal')));
    }

    card.appendChild(actions);
    body.appendChild(card);
  }

  panel.appendChild(body);

  const closeBtn = makeBtn('关闭', () => {
    overlay.remove();
    onClose();
  });
  panel.appendChild(closeBtn);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}
