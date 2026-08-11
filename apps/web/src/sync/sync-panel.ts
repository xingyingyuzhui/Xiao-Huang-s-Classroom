import type { SyncStatus } from './sync-status-store.js';
import { createButton } from '@xiaohuang/ui';

export type SyncPanelOptions = {
  status: SyncStatus;
  onSync: () => void;
  onViewConflicts: () => void;
};

const PHASE_LABELS: Record<SyncStatus['phase'], string> = {
  idle: '就绪',
  pushing: '正在上传…',
  pulling: '正在下载…',
  completed: '同步完成',
  failed: '同步失败',
  cancelled: '同步已取消',
  conflict: '存在冲突',
};

function formatRelativeTime(ts: number | null): string {
  if (ts == null) return '从未同步';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时前`;
}

export function renderSyncPanel(container: HTMLElement, options: SyncPanelOptions): void {
  const { status, onSync, onViewConflicts } = options;
  container.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'sync-panel';

  // Online/offline indicator
  const onlineRow = document.createElement('div');
  onlineRow.className = 'sync-panel-online';
  const onlineDot = document.createElement('span');
  onlineDot.className = status.online ? 'sync-dot is-online' : 'sync-dot is-offline';
  onlineDot.setAttribute('aria-hidden', 'true');
  const onlineLabel = document.createElement('span');
  onlineLabel.textContent = status.online ? '在线' : '离线';
  onlineRow.appendChild(onlineDot);
  onlineRow.appendChild(onlineLabel);
  wrapper.appendChild(onlineRow);

  // Phase
  const phaseEl = document.createElement('div');
  phaseEl.className = 'sync-panel-phase';
  phaseEl.setAttribute('data-phase', status.phase);
  phaseEl.textContent = PHASE_LABELS[status.phase];
  wrapper.appendChild(phaseEl);

  // Pending count
  if (status.pendingCount > 0) {
    const pendingEl = document.createElement('div');
    pendingEl.className = 'sync-panel-pending';
    pendingEl.textContent = `${status.pendingCount} 项待同步`;
    wrapper.appendChild(pendingEl);
  }

  // Conflict count
  if (status.conflictCount > 0) {
    const conflictBtn = document.createElement('button');
    conflictBtn.type = 'button';
    conflictBtn.className = 'sync-panel-conflicts';
    conflictBtn.textContent = `${status.conflictCount} 项冲突`;
    conflictBtn.addEventListener('click', onViewConflicts);
    wrapper.appendChild(conflictBtn);
  }

  // Error message
  if (status.phase === 'failed' && status.lastError) {
    const errorEl = document.createElement('div');
    errorEl.className = 'sync-panel-error';
    errorEl.setAttribute('role', 'alert');
    errorEl.textContent = status.lastError;
    wrapper.appendChild(errorEl);
  }

  // Last synced
  const lastEl = document.createElement('div');
  lastEl.className = 'sync-panel-last';
  lastEl.textContent = `上次同步：${formatRelativeTime(status.lastSyncedAt)}`;
  wrapper.appendChild(lastEl);

  // Sync button
  const isBusy = status.phase === 'pushing' || status.phase === 'pulling';
  const syncBtn = createButton({
    label: '同步',
    kind: 'primary',
    disabled: isBusy,
    loading: isBusy,
    onClick: onSync,
  });
  wrapper.appendChild(syncBtn.element);

  container.appendChild(wrapper);
}

export { formatRelativeTime };
