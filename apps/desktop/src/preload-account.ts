/**
 * Preload script — exposes a narrow account API to the renderer.
 * Must be loaded via webPreferences.preload in BrowserWindow config.
 * Refresh tokens never cross this boundary.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { AccountIpcChannel } from '@xiaohuang/contracts';

type IpcEnvelope<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };

async function invokeAccount<T>(channel: AccountIpcChannel, payload?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, payload)) as IpcEnvelope<T>;
  if (!result || typeof result !== 'object') {
    const err = new Error('账户服务无响应');
    err.name = 'INTERNAL_UNKNOWN';
    throw err;
  }
  if ('success' in result && result.success === false) {
    const err = new Error(result.error.message);
    err.name = result.error.code;
    throw err;
  }
  if ('success' in result && result.success === true) {
    return result.data;
  }
  return result as T;
}

contextBridge.exposeInMainWorld('xiaohuangAccount', {
  listSavedAccounts: () => invokeAccount('account:list-saved'),

  capabilities: () => invokeAccount('account:capabilities'),

  login: (credentials: {
    username: string;
    password: string;
    deviceId: string;
    deviceLabel: string;
    rememberMe?: boolean;
  }) => invokeAccount('account:login', credentials),

  refreshSession: (accountId: string, deviceId: string) =>
    invokeAccount('account:refresh-session', { accountId, deviceId }),

  restoreSession: (accountId?: string, deviceId?: string) =>
    invokeAccount('account:restore-session', {
      ...(accountId ? { accountId } : {}),
      ...(deviceId ? { deviceId } : {}),
    }),

  logout: (accountId: string, deviceId: string) =>
    invokeAccount('account:logout', { accountId, deviceId }),

  removeCard: (accountId: string) => invokeAccount('account:remove-card', { accountId }),

  revokeRemote: (accountId: string, sessionId: string) =>
    invokeAccount('account:revoke-remote', { accountId, sessionId }),
});
