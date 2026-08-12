/**
 * Account IPC handlers — registered once in the main process.
 *
 * Cloud origin is a trusted compile-time / config value, never from IPC payload.
 * Refresh tokens stay in main; renderer only receives accessToken + expiresAt.
 */
import { ipcMain, session as electronSession } from 'electron';
import type { AuthVault } from './auth-vault.js';

const REFRESH_COOKIE = 'xh_refresh';

function cloudV1(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/api/cloud/v1${path.startsWith('/') ? path : `/${path}`}`;
}

function parseRefreshFromSetCookie(header: string | null): string | null {
  if (!header) return null;
  // fetch may join multiple Set-Cookie with comma; match our cookie name first.
  const match = header.match(new RegExp(`${REFRESH_COOKIE}=([^;\\s,]+)`));
  return match?.[1] ?? null;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export function registerAccountIpc(vault: AuthVault, cloudOrigin: string): void {
  ipcMain.handle('account:list-saved', async () => {
    return vault.listAccounts();
  });

  ipcMain.handle('account:login', async (_event, { username, password, deviceId, deviceLabel }) => {
    const label = deviceLabel === 'Mobile' ? 'Mobile' : 'Desktop';
    const res = await fetch(cloudV1(cloudOrigin, '/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        deviceLabel: label,
        ...(typeof deviceId === 'string' && deviceId ? { deviceId } : {}),
      }),
    });
    const body = await readJson(res);
    if (!res.ok || !body.success) {
      const err = body.error as { message?: string } | undefined;
      throw new Error(err?.message ?? `Login failed (${res.status})`);
    }

    const data = body.data as {
      session: {
        accountId: string;
        sessionId: string;
        deviceId: string;
        accessTokenExpiresAt: string;
      };
      accessToken: string;
    };

    const setCookie =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie().join(',')
        : res.headers.get('set-cookie');
    const refreshToken = parseRefreshFromSetCookie(setCookie);
    if (!refreshToken) {
      throw new Error('Login succeeded but refresh cookie was missing');
    }

    // Best-effort profile for display name
    let displayName = username;
    let avatarUrl: string | null = null;
    try {
      const profileRes = await fetch(cloudV1(cloudOrigin, '/account'), {
        headers: { Authorization: `Bearer ${data.accessToken}` },
      });
      const profileBody = await readJson(profileRes);
      if (profileRes.ok && profileBody.success) {
        const profile = profileBody.data as { displayName?: string; avatarUrl?: string | null };
        displayName = profile.displayName || username;
        avatarUrl = profile.avatarUrl ?? null;
      }
    } catch {
      /* optional */
    }

    await vault.store(data.session.accountId, displayName, avatarUrl, refreshToken);

    // Mirror cookie into Electron session for renderer fetches with credentials.
    try {
      const url = cloudV1(cloudOrigin, '/auth/login');
      await electronSession.defaultSession.cookies.set({
        url,
        name: REFRESH_COOKIE,
        value: refreshToken,
        path: '/api/cloud/v1/auth',
        httpOnly: true,
        secure: url.startsWith('https'),
      });
    } catch {
      /* cookie mirror optional */
    }

    return {
      accountId: data.session.accountId,
      displayName,
      avatarUrl,
      accessToken: data.accessToken,
      expiresAt: data.session.accessTokenExpiresAt,
      deviceId: data.session.deviceId || deviceId,
      sessionId: data.session.sessionId,
    };
  });

  ipcMain.handle('account:refresh-session', async (_event, { accountId, deviceId }) => {
    const cred = await vault.retrieve(accountId);
    if (!cred) throw new Error('No stored credentials for this account');

    const res = await fetch(cloudV1(cloudOrigin, '/auth/refresh'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${REFRESH_COOKIE}=${cred.refreshToken}`,
      },
      body: JSON.stringify({ deviceId }),
    });
    const body = await readJson(res);
    if (!res.ok || !body.success) {
      if (res.status === 401) {
        await vault.remove(accountId);
        throw new Error('Session expired — please log in again');
      }
      const err = body.error as { message?: string } | undefined;
      throw new Error(err?.message ?? `Refresh failed (${res.status})`);
    }

    const data = body.data as {
      session: { accessTokenExpiresAt: string };
      accessToken: string;
    };
    const setCookie =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie().join(',')
        : res.headers.get('set-cookie');
    const nextRefresh = parseRefreshFromSetCookie(setCookie) ?? cred.refreshToken;
    const meta = vault.listAccounts().find((a) => a.accountId === accountId);
    await vault.store(accountId, meta?.displayName ?? '', meta?.avatarUrl ?? null, nextRefresh);

    return {
      accessToken: data.accessToken,
      expiresAt: data.session.accessTokenExpiresAt,
    };
  });

  ipcMain.handle('account:logout', async (_event, { accountId, deviceId }) => {
    const cred = await vault.retrieve(accountId);
    if (cred) {
      await fetch(cloudV1(cloudOrigin, '/auth/logout'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${REFRESH_COOKIE}=${cred.refreshToken}`,
        },
        body: JSON.stringify({
          ...(typeof deviceId === 'string' && deviceId ? { deviceId } : {}),
        }),
      }).catch(() => {});
    }
    await vault.remove(accountId);
    try {
      await electronSession.defaultSession.cookies.remove(
        cloudV1(cloudOrigin, '/auth/login'),
        REFRESH_COOKIE,
      );
    } catch {
      /* cookie clear optional */
    }
    return { ok: true };
  });

  ipcMain.handle('account:remove-card', async (_event, { accountId }) => {
    await vault.remove(accountId);
    return { ok: true };
  });
}
