/**
 * Account IPC handlers — registered once in the main process.
 *
 * Cloud origin is a trusted compile-time / config value, never from IPC payload.
 * Refresh tokens stay in main; renderer only receives accessToken + expiresAt.
 */
import { ipcMain } from 'electron';
import type { AuthVault } from './auth-vault.js';

export function registerAccountIpc(vault: AuthVault, cloudOrigin: string): void {
  ipcMain.handle('account:list-saved', async () => {
    return vault.listAccounts();
  });

  ipcMain.handle('account:login', async (_event, { username, password, deviceId, deviceLabel }) => {
    const res = await fetch(`${cloudOrigin}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, deviceLabel }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as Record<string, unknown>).error as string ?? `Login failed (${res.status})`);
    }
    const body = (await res.json()) as {
      data: {
        accountId: string;
        displayName: string;
        avatarUrl: string | null;
        accessToken: string;
        accessTokenExpiresAt: string;
        refreshToken: string;
        deviceId: string;
      };
    };
    const d = body.data;
    await vault.store(d.accountId, d.displayName, d.avatarUrl, d.refreshToken);
    return {
      accountId: d.accountId,
      displayName: d.displayName,
      avatarUrl: d.avatarUrl,
      accessToken: d.accessToken,
      expiresAt: d.accessTokenExpiresAt,
      deviceId: d.deviceId ?? deviceId,
    };
  });

  ipcMain.handle('account:refresh-session', async (_event, { accountId, deviceId }) => {
    const cred = await vault.retrieve(accountId);
    if (!cred) throw new Error('No stored credentials for this account');

    const res = await fetch(`${cloudOrigin}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cred.refreshToken}`,
      },
      body: JSON.stringify({ deviceId }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        await vault.remove(accountId);
        throw new Error('Session expired — please log in again');
      }
      throw new Error(`Refresh failed (${res.status})`);
    }
    const body = (await res.json()) as {
      data: {
        accessToken: string;
        accessTokenExpiresAt: string;
        refreshToken: string;
      };
    };
    const d = body.data;
    const meta = vault.listAccounts().find((a) => a.accountId === accountId);
    await vault.store(accountId, meta?.displayName ?? '', meta?.avatarUrl ?? null, d.refreshToken);
    return { accessToken: d.accessToken, expiresAt: d.accessTokenExpiresAt };
  });

  ipcMain.handle('account:logout', async (_event, { accountId, deviceId }) => {
    const cred = await vault.retrieve(accountId);
    if (cred) {
      await fetch(`${cloudOrigin}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cred.refreshToken}`,
        },
        body: JSON.stringify({ deviceId }),
      }).catch(() => {});
    }
    await vault.remove(accountId);
    return { ok: true };
  });

  ipcMain.handle('account:remove-card', async (_event, { accountId }) => {
    await vault.remove(accountId);
    return { ok: true };
  });
}
