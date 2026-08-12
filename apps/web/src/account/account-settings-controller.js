/**
 * Login / device / password / deletion UI for account settings.
 */
import { createButton, createInput } from '@xiaohuang/ui';
import { appConfirm } from '../shared/ui/app-dialog.js';
import { newRequestId } from '../shared/api/cloud-client.js';
import { showLoginDialog } from './login-dialog.js';
import { renderSyncPanel } from '../sync/sync-panel.js';
import { showConflictDialog } from '../sync/conflict-dialog.js';

export const DEVICE_ID_KEY = 'xh-device-id';

/**
 * @returns {string}
 */
export function getOrCreateDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(existing)) {
      return existing;
    }
  } catch {
    /* ignore */
  }
  const id = `dev_${newRequestId().replace(/-/g, '').slice(0, 24)}`;
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

/**
 * @typedef {{
 *   login: Function,
 *   restoreSession?: Function,
 *   logout?: Function,
 *   removeCard?: Function,
 *   capabilities?: Function,
 * }} DesktopAccountApi
 */

/** @returns {DesktopAccountApi | null} */
export function getDesktopAccountApi() {
  const api = /** @type {DesktopAccountApi | undefined} */ (globalThis.xiaohuangAccount);
  if (!api || typeof api.login !== 'function') return null;
  return api;
}

/**
 * @param {Record<string, unknown>} ipcResult
 * @param {string} fallbackDeviceId
 */
export function mapDesktopSession(ipcResult, fallbackDeviceId) {
  const expiresAt =
    typeof ipcResult.expiresAt === 'number'
      ? ipcResult.expiresAt
      : Date.parse(String(ipcResult.expiresAt ?? ''));
  return {
    accountId: String(ipcResult.accountId || ''),
    displayName: String(ipcResult.displayName || ipcResult.accountId || ''),
    accessToken: String(ipcResult.accessToken || ''),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 15 * 60_000,
    sessionId: String(ipcResult.sessionId || 'sess_desktop'),
    deviceId: String(ipcResult.deviceId || fallbackDeviceId),
    avatarUrl: typeof ipcResult.avatarUrl === 'string' ? ipcResult.avatarUrl : null,
  };
}

/**
 * @typedef {object} AccountSettingsControllerDeps
 * @property {import('./account-session-controller.js').AccountSessionController} session
 * @property {import('./remembered-account-store.ts').RememberedAccountStore} remembered
 * @property {import('../shared/api/cloud-client.ts').CloudClient} client
 * @property {import('../sync/sync-status-store.ts').SyncStatusStore} statusStore
 * @property {import('../sync/conflict-store.ts').ConflictStore} conflictStore
 * @property {import('../workspace/workspace-context-store.ts').WorkspaceContextStore} contextStore
 * @property {import('../sync/sync-controller.ts').SyncController | null} syncController
 * @property {string} deviceId
 * @property {{ getActiveSubjectId: () => string | null, activateSubject: (id: string) => Promise<void> } | null} subjectContext
 * @property {() => Promise<void>} switchToGuest
 * @property {() => Promise<void>} refreshClassList
 * @property {() => Promise<void>} refreshPendingCount
 * @property {() => Promise<void>} hydrateWave1FromLocal
 * @property {() => void} refreshSettingsSection
 * @property {(value: boolean) => void} setPendingDeletion
 * @property {() => boolean} getPendingDeletion
 */

/**
 * @param {AccountSettingsControllerDeps} deps
 */
export function createAccountSettingsController(deps) {
  const {
    session,
    remembered,
    client,
    statusStore,
    conflictStore,
    contextStore,
    deviceId,
  } = deps;

  /**
   * @param {{
   *   accountId: string,
   *   displayName: string,
   *   accessToken: string,
   *   expiresAt: number,
   *   avatarUrl?: string | null,
   *   deviceId?: string,
   * }} result
   */
  async function afterLoginSuccess(result) {
    session.setSession({
      accountId: result.accountId,
      displayName: result.displayName,
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
      avatarUrl: result.avatarUrl ?? null,
    });
    remembered.remember({
      accountId: result.accountId,
      displayName: result.displayName,
      avatarUrl: result.avatarUrl ?? null,
      lastUsedAt: Date.now(),
    });
    if (result.deviceId) {
      try {
        localStorage.setItem(DEVICE_ID_KEY, result.deviceId);
      } catch {
        /* ignore */
      }
    }
    try {
      const activeSubject = deps.subjectContext?.getActiveSubjectId();
      if (activeSubject) {
        await deps.subjectContext.activateSubject(activeSubject);
      }
      await deps.refreshClassList();
      await deps.refreshPendingCount();
    } catch (err) {
      console.error('[account-cloud] workspace ensure failed', err);
      statusStore.update({
        phase: 'failed',
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
    deps.refreshSettingsSection();
  }

  /**
   * @param {HTMLElement | null} root
   */
  function renderAccountBlock(root) {
    if (!root) return;
    root.textContent = '';

    const wrap = document.createElement('div');
    wrap.className = 'account-settings-panel';

    const current = session.getSession();
    if (current && session.isAuthenticated()) {
      void (async () => {
        let profile = null;
        try {
          profile = await client.getAccountProfile();
        } catch (err) {
          console.error('[account-cloud] getAccountProfile failed', err);
        }

        wrap.textContent = '';
        const summary = document.createElement('div');
        summary.className = 'account-settings-summary';
        summary.textContent = `已登录：${profile?.displayName ?? current.displayName}`;
        wrap.appendChild(summary);

        if (profile?.status === 'pending_deletion') {
          deps.setPendingDeletion(true);
          const pendingHint = document.createElement('p');
          pendingHint.className = 'settings-hint account-danger-hint';
          const deadline = profile.pendingDeletionAt
            ? new Date(profile.pendingDeletionAt).toLocaleString()
            : '30 天内';
          pendingHint.textContent = `账户已申请删除，将于 ${deadline} 永久清除。30 天内可恢复。`;
          wrap.appendChild(pendingHint);

          const restoreBtn = createButton({
            label: '恢复账户',
            kind: 'primary',
            onClick: async () => {
              restoreBtn.update({ disabled: true, loading: true });
              try {
                await client.cancelAccountDeletion();
                const refreshed = await client.refreshSession();
                if (refreshed) {
                  session.setSession(refreshed);
                }
                deps.refreshSettingsSection();
              } catch (err) {
                console.error('[account-cloud] cancelAccountDeletion failed', err);
              } finally {
                restoreBtn.update({ disabled: false, loading: false });
              }
            },
          });
          wrap.appendChild(restoreBtn.element);

          const logoutBtn = createButton({
            label: '退出登录',
            kind: 'secondary',
            onClick: () => {
              void (async () => {
                const desktopApi = getDesktopAccountApi();
                try {
                  if (desktopApi?.logout && current) {
                    await desktopApi.logout(current.accountId, deviceId);
                  } else {
                    await client.logout();
                  }
                } catch {
                  /* local clear still proceeds */
                }
                session.clearSession();
                await deps.switchToGuest();
                deps.refreshSettingsSection();
              })();
            },
          });
          wrap.appendChild(logoutBtn.element);
          root.appendChild(wrap);
          return;
        }

        deps.setPendingDeletion(false);

        const wsHint = document.createElement('p');
        wsHint.className = 'settings-hint';
        const ctx = contextStore.getContext();
        wsHint.textContent =
          ctx.kind === 'class'
            ? `当前工作区：班级（${ctx.classId}）`
            : '当前工作区：个人空间';
        wrap.appendChild(wsHint);

        const logoutBtn = createButton({
          label: '退出登录',
          kind: 'secondary',
          onClick: () => {
            void (async () => {
              const desktopApi = getDesktopAccountApi();
              try {
                if (desktopApi?.logout && current) {
                  await desktopApi.logout(current.accountId, deviceId);
                } else {
                  await client.logout();
                }
              } catch {
                /* local clear still proceeds */
              }
              session.clearSession();
              await deps.switchToGuest();
              deps.refreshSettingsSection();
            })();
          },
        });
        wrap.appendChild(logoutBtn.element);

        const pwRow = document.createElement('div');
        pwRow.className = 'account-password-row';
        const currentPw = createInput({ placeholder: '当前密码', 'aria-label': '当前密码' });
        const nextPw = createInput({ placeholder: '新密码（至少 8 位）', 'aria-label': '新密码' });
        /** @type {HTMLInputElement} */ (currentPw.element).type = 'password';
        /** @type {HTMLInputElement} */ (nextPw.element).type = 'password';
        const pwBtn = createButton({
          label: '修改密码',
          kind: 'secondary',
          onClick: async () => {
            const currentPassword = /** @type {HTMLInputElement} */ (currentPw.element).value;
            const newPassword = /** @type {HTMLInputElement} */ (nextPw.element).value;
            if (!currentPassword || newPassword.length < 8) return;
            pwBtn.update({ disabled: true, loading: true });
            try {
              await client.changePassword(currentPassword, newPassword);
              /** @type {HTMLInputElement} */ (currentPw.element).value = '';
              /** @type {HTMLInputElement} */ (nextPw.element).value = '';
            } catch (err) {
              console.error('[account-cloud] changePassword failed', err);
            } finally {
              pwBtn.update({ disabled: false, loading: false });
            }
          },
        });
        pwRow.append(currentPw.element, nextPw.element, pwBtn.element);
        wrap.appendChild(pwRow);

        const deviceHost = document.createElement('div');
        deviceHost.className = 'account-device-list';
        deviceHost.textContent = '正在加载设备…';
        wrap.appendChild(deviceHost);
        try {
          const devices = await client.listDevices();
          deviceHost.textContent = '';
          if (!devices.length) {
            deviceHost.textContent = '没有活动设备';
          } else {
            for (const device of devices) {
              const row = document.createElement('div');
              row.className = 'account-device-row';
              const label = document.createElement('span');
              label.textContent = `${device.label}${device.current ? '（本机）' : ''}`;
              row.appendChild(label);
              if (!device.current) {
                const revokeBtn = createButton({
                  label: '远程撤销',
                  kind: 'danger',
                  size: 'sm',
                  onClick: async () => {
                    const ok = await appConfirm('撤销后该设备需重新登录。', { danger: true });
                    if (!ok) return;
                    await client.revokeDevice(device.sessionId);
                    deps.refreshSettingsSection();
                  },
                });
                row.appendChild(revokeBtn.element);
              }
              deviceHost.appendChild(row);
            }
          }
        } catch (err) {
          console.error('[account-cloud] listDevices failed', err);
          deviceHost.textContent = '无法加载设备列表';
        }

        const dangerZone = document.createElement('div');
        dangerZone.className = 'account-danger-zone';
        const dangerTitle = document.createElement('h4');
        dangerTitle.className = 'account-danger-title';
        dangerTitle.textContent = '危险区域';
        dangerZone.appendChild(dangerTitle);
        const dangerHint = document.createElement('p');
        dangerHint.className = 'settings-hint account-danger-hint';
        dangerHint.textContent =
          '删除账户后 30 天内可恢复；到期后云端班级、同步数据与 AI 凭据将被永久清除。';
        dangerZone.appendChild(dangerHint);
        const deletePw = createInput({
          placeholder: '当前密码',
          'aria-label': '删除账户确认密码',
        });
        /** @type {HTMLInputElement} */ (deletePw.element).type = 'password';
        const deleteName = createInput({
          placeholder: '输入显示名以确认',
          'aria-label': '删除账户确认显示名',
        });
        const deleteBtn = createButton({
          label: '删除账户',
          kind: 'danger',
          onClick: async () => {
            const currentPassword = /** @type {HTMLInputElement} */ (deletePw.element).value;
            const confirmDisplayName = /** @type {HTMLInputElement} */ (deleteName.element).value;
            if (!currentPassword || !confirmDisplayName) return;
            const ok = await appConfirm(
              '确定申请删除账户？提交后将立即退出登录，30 天内可恢复。',
              { danger: true },
            );
            if (!ok) return;
            deleteBtn.update({ disabled: true, loading: true });
            try {
              await client.requestAccountDeletion(confirmDisplayName, currentPassword);
              session.clearSession();
              await deps.switchToGuest();
              deps.refreshSettingsSection();
            } catch (err) {
              console.error('[account-cloud] requestAccountDeletion failed', err);
            } finally {
              deleteBtn.update({ disabled: false, loading: false });
            }
          },
        });
        dangerZone.append(deletePw.element, deleteName.element, deleteBtn.element);
        wrap.appendChild(dangerZone);
        root.appendChild(wrap);
      })();
      return;
    }

    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.textContent = '登录后可使用云同步（访客模式仍可离线使用教室）。';
    wrap.appendChild(hint);

    const cards = remembered.list();
    if (cards.length) {
      const cardList = document.createElement('div');
      cardList.className = 'account-remembered-list';
      for (const card of cards) {
        const row = document.createElement('div');
        row.className = 'account-remembered-card';
        const label = document.createElement('span');
        label.textContent = card.displayName;
        row.appendChild(label);
        const forgetBtn = createButton({
          label: '移除本机卡片',
          kind: 'ghost',
          size: 'sm',
          onClick: () => {
            void (async () => {
              const desktopApi = getDesktopAccountApi();
              try {
                if (desktopApi?.removeCard) {
                  await desktopApi.removeCard(card.accountId);
                }
              } catch (err) {
                console.error('[account-cloud] removeCard failed', err);
              }
              remembered.forget(card.accountId);
              deps.refreshSettingsSection();
            })();
          },
        });
        row.appendChild(forgetBtn.element);
        cardList.appendChild(row);
      }
      wrap.appendChild(cardList);
    }

    const loginBtn = createButton({
      label: '登录',
      kind: 'primary',
      onClick: async () => {
        const desktopApi = getDesktopAccountApi();
        /** @type {{ login: (u: string, p: string) => Promise<any> }} */
        const loginTarget = desktopApi
          ? {
              login: async (username, password) => {
                let rememberMe = false;
                try {
                  const caps = await desktopApi.capabilities?.();
                  rememberMe = Boolean(caps?.rememberMeAvailable);
                } catch {
                  /* keep false */
                }
                const ipcResult = await desktopApi.login({
                  username,
                  password,
                  deviceId,
                  deviceLabel: 'Desktop',
                  rememberMe,
                });
                return mapDesktopSession(ipcResult, deviceId);
              },
            }
          : client;

        const result = await showLoginDialog(/** @type {any} */ (loginTarget));
        if (!result) return;
        await afterLoginSuccess(result);
      },
    });
    wrap.appendChild(loginBtn.element);
    root.appendChild(wrap);
  }

  /**
   * @param {HTMLElement | null} root
   */
  function renderSyncBlock(root) {
    if (!root) return;
    if (!session.isAuthenticated()) {
      root.textContent = '';
      return;
    }
    const syncController = deps.syncController;
    renderSyncPanel(root, {
      status: statusStore.getStatus(),
      onSync: () => {
        if (!syncController) {
          statusStore.update({
            phase: 'failed',
            lastError: '本地同步库不可用',
          });
          return;
        }
        if (syncController.isRunning()) return;
        const ctx = contextStore.getContext();
        if (ctx.mode !== 'authenticated' || !ctx.workspaceId.startsWith('ws_')) {
          statusStore.update({
            phase: 'failed',
            lastError: '工作区未就绪，请重新登录',
          });
          return;
        }
        void syncController.startSync().then(async () => {
          await deps.refreshPendingCount();
          await deps.hydrateWave1FromLocal();
          deps.refreshSettingsSection();
        });
      },
      onViewConflicts: () => {
        const conflicts = conflictStore.listUnresolved();
        if (!conflicts.length) return;
        showConflictDialog({
          conflicts,
          onResolve: (conflictId, resolution) => {
            void (async () => {
              if (syncController) {
                await syncController.resolveConflict(conflictId, resolution);
              } else {
                conflictStore.resolve(conflictId, resolution);
              }
              statusStore.update({ conflictCount: conflictStore.listUnresolved().length });
              deps.refreshSettingsSection();
            })();
          },
          onClose: () => {},
        });
      },
    });
  }

  return {
    afterLoginSuccess,
    renderAccountBlock,
    renderSyncBlock,
  };
}
