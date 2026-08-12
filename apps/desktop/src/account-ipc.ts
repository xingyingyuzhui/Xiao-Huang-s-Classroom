/**
 * Account IPC handlers — registered once in the main process.
 *
 * Cloud origin is a trusted compile-time / config value, never from IPC payload.
 * Refresh tokens stay in main; renderer only receives accessToken + expiresAt.
 */
import { ipcMain, session as electronSession } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import {
  ACCOUNT_IPC_CHANNELS,
  isAllowedIpcSenderOrigin,
  ipcFail,
  type AccountIpcChannel,
} from '@xiaohuang/contracts';
import type { AuthVault } from './auth-vault.js';
import { cloudV1, createAccountIpcCore, sanitizeIpcError } from './account-ipc-core.js';

const REFRESH_COOKIE = 'xh_refresh';

export type AccountIpcOptions = {
  vault: AuthVault;
  cloudOrigin: string | null;
  getAppOrigin: () => string;
};

export function registerAccountIpc(options: AccountIpcOptions): () => void {
  const { vault, cloudOrigin, getAppOrigin } = options;
  const core = createAccountIpcCore({ vault, cloudOrigin });

  const handler = async (channel: AccountIpcChannel, event: IpcMainInvokeEvent, payload: unknown) => {
    try {
      const expected = getAppOrigin();
      const frame = event.senderFrame;
      const senderOrigin = frame?.origin;
      const allowedOrigins = expected ? [expected] : ['file://'];
      if (!isAllowedIpcSenderOrigin(senderOrigin, allowedOrigins)) {
        return ipcFail('IPC_DENIED', '不受信的调用方');
      }
      const result = await core.dispatch(channel, payload);
      if (channel === 'account:login' && result.success && cloudOrigin) {
        const session = result.data as { accountId: string };
        await mirrorRefreshCookie(vault, session.accountId, cloudOrigin);
      }
      if (
        (channel === 'account:logout' || channel === 'account:remove-card' || channel === 'account:revoke-remote') &&
        result.success &&
        cloudOrigin
      ) {
        await clearRefreshCookie(cloudOrigin);
      }
      return result;
    } catch (error) {
      return sanitizeIpcError(error);
    }
  };

  for (const channel of ACCOUNT_IPC_CHANNELS) {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event, payload) => handler(channel, event, payload));
  }

  void core.restoreLastSession().catch(() => {
    /* startup restore is best-effort */
  });

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const channel of ACCOUNT_IPC_CHANNELS) {
      ipcMain.removeHandler(channel);
    }
  };
}

async function mirrorRefreshCookie(
  vault: AuthVault,
  accountId: string,
  cloudOrigin: string,
): Promise<void> {
  try {
    const cred = await vault.retrieve(accountId);
    if (!cred) return;
    const url = cloudV1(cloudOrigin, '/auth/login');
    await electronSession.defaultSession.cookies.set({
      url,
      name: REFRESH_COOKIE,
      value: cred.refreshToken,
      path: '/api/cloud/v1/auth',
      httpOnly: true,
      secure: url.startsWith('https'),
    });
  } catch {
    /* cookie mirror optional */
  }
}

async function clearRefreshCookie(cloudOrigin: string): Promise<void> {
  try {
    await electronSession.defaultSession.cookies.remove(
      cloudV1(cloudOrigin, '/auth/login'),
      REFRESH_COOKIE,
    );
  } catch {
    /* cookie clear optional */
  }
}
