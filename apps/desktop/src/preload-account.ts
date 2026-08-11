/**
 * Preload script — exposes a narrow account API to the renderer.
 * Must be loaded via webPreferences.preload in BrowserWindow config.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('xiaohuangAccount', {
  listSavedAccounts: () => ipcRenderer.invoke('account:list-saved'),

  login: (credentials: {
    username: string;
    password: string;
    deviceId: string;
    deviceLabel: string;
  }) => ipcRenderer.invoke('account:login', credentials),

  refreshSession: (accountId: string, deviceId: string) =>
    ipcRenderer.invoke('account:refresh-session', { accountId, deviceId }),

  logout: (accountId: string, deviceId: string) =>
    ipcRenderer.invoke('account:logout', { accountId, deviceId }),

  removeCard: (accountId: string) =>
    ipcRenderer.invoke('account:remove-card', { accountId }),
});
