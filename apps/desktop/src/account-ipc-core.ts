/**
 * Account IPC core — no Electron imports so unit tests can drive it.
 * Refresh tokens stay in the vault; outputs are schema-checked envelopes.
 */
import { AppError } from '@xiaohuang/domain-core';
import {
  ACCOUNT_IPC_CHANNELS,
  accountIpcRefreshDataSchema,
  accountIpcRestoreDataSchema,
  accountIpcSessionDataSchema,
  ipcFail,
  ipcOk,
  parseAccountIpcPayload,
  payloadHasForbiddenOriginField,
  type AccountIpcChannel,
  type AccountIpcLoginInput,
  type AccountIpcSessionData,
  type IpcResult,
} from '@xiaohuang/contracts';
import type { AuthVault, VaultAccountMeta } from './auth-vault.js';

const REFRESH_COOKIE = 'xh_refresh';
const STABLE_CODES = new Set([
  'VALIDATION_SCHEMA',
  'IPC_DENIED',
  'IPC_INVALID_PAYLOAD',
  'INTERNAL_UNKNOWN',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_SESSION_EXPIRED',
  'AUTH_REFRESH_REUSE',
  'AUTH_RATE_LIMITED',
  'AUTH_REGISTRATION_CLOSED',
  'AUTH_FEATURE_DISABLED',
  'FORBIDDEN_TENANT',
  'ACCOUNT_NOT_FOUND',
  'ACCOUNT_PENDING_DELETION',
  'NETWORK_TIMEOUT',
  'NETWORK_OFFLINE',
  'CREDENTIAL_NOT_CONFIGURED',
  'CREDENTIAL_INVALID',
]);

export type AccountIpcCoreDeps = {
  vault: Pick<
    AuthVault,
    | 'isAvailable'
    | 'store'
    | 'retrieve'
    | 'remove'
    | 'listAccounts'
    | 'getLastUsedAccountId'
  >;
  cloudOrigin: string | null;
  fetchFn?: typeof fetch;
};

type CloudJson = {
  success?: unknown;
  data?: unknown;
  error?: { code?: unknown; message?: unknown };
};

type CachedSession = AccountIpcSessionData;

export function cloudV1(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/api/cloud/v1${path.startsWith('/') ? path : `/${path}`}`;
}

export function parseRefreshFromSetCookie(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`${REFRESH_COOKIE}=([^;\\s,]+)`));
  return match?.[1] ?? null;
}

export function createAccountIpcCore(deps: AccountIpcCoreDeps) {
  const fetchFn = deps.fetchFn ?? fetch;
  let cached: CachedSession | null = null;

  function requireOrigin(): IpcResult<string> {
    if (!deps.cloudOrigin) {
      return ipcFail('AUTH_FEATURE_DISABLED', '云端地址未配置');
    }
    return ipcOk(deps.cloudOrigin);
  }

  async function readJson(res: Response): Promise<CloudJson> {
    return (await res.json().catch(() => ({}))) as CloudJson;
  }

  function mapHttpError(res: Response, body: CloudJson, fallback: string): IpcResult<never> {
    const rawCode = typeof body.error?.code === 'string' ? body.error.code : '';
    const rawMessage = typeof body.error?.message === 'string' ? body.error.message : '';
    if (res.status === 429) {
      return ipcFail('AUTH_RATE_LIMITED', rawMessage || '登录过于频繁，请稍后再试');
    }
    if (res.status === 401 || res.status === 403) {
      const code = STABLE_CODES.has(rawCode) ? rawCode : fallback;
      return ipcFail(code, rawMessage || '认证失败');
    }
    if (STABLE_CODES.has(rawCode)) {
      return ipcFail(rawCode, rawMessage || '请求失败');
    }
    return ipcFail(fallback, rawMessage || `请求失败（${res.status}）`);
  }

  async function cloudFetch(
    origin: string,
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    return fetchFn(cloudV1(origin, path), {
      ...init,
      redirect: 'error',
      headers: {
        Origin: origin,
        ...(init.headers ?? {}),
      },
    });
  }

  function toCards(accounts: VaultAccountMeta[]) {
    return accounts.map((account) => ({
      accountId: account.accountId,
      displayName: account.displayName || account.accountId,
      avatarUrl: account.avatarUrl,
      lastUsedAt: account.lastUsedAt,
      vaultRef: `vault:${account.accountId}`,
    }));
  }

  async function fetchProfile(
    origin: string,
    accessToken: string,
    fallbackName: string,
  ): Promise<{ displayName: string; avatarUrl: string | null }> {
    try {
      const res = await cloudFetch(origin, '/account', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await readJson(res);
      if (!res.ok || body.success !== true || !body.data || typeof body.data !== 'object') {
        return { displayName: fallbackName, avatarUrl: null };
      }
      const profile = body.data as { displayName?: unknown; avatarUrl?: unknown };
      const displayName =
        typeof profile.displayName === 'string' && profile.displayName.trim()
          ? profile.displayName.trim().slice(0, 120)
          : fallbackName;
      const avatarUrl = typeof profile.avatarUrl === 'string' ? profile.avatarUrl.slice(0, 512) : null;
      return { displayName, avatarUrl };
    } catch {
      return { displayName: fallbackName, avatarUrl: null };
    }
  }

  function cookieHeader(refreshToken: string): string {
    return `${REFRESH_COOKIE}=${refreshToken}`;
  }

  function setCookieHeader(res: Response): string | null {
    if (typeof res.headers.getSetCookie === 'function') {
      const list = res.headers.getSetCookie();
      return list.length ? list.join(',') : null;
    }
    return res.headers.get('set-cookie');
  }

  async function persistRotatedRefresh(
    accountId: string,
    displayName: string,
    avatarUrl: string | null,
    deviceId: string | null,
    persist: boolean,
    previous: string,
    res: Response,
  ): Promise<void> {
    const next = parseRefreshFromSetCookie(setCookieHeader(res)) ?? previous;
    await deps.vault.store({
      accountId,
      displayName,
      avatarUrl,
      refreshToken: next,
      deviceId,
      persist,
    });
  }

  async function login(input: AccountIpcLoginInput): Promise<IpcResult<AccountIpcSessionData>> {
    const originRes = requireOrigin();
    if (!originRes.success) return originRes;
    const rememberMe = input.rememberMe !== false;
    if (rememberMe && !deps.vault.isAvailable()) {
      return ipcFail('AUTH_FEATURE_DISABLED', '当前设备无法安全记住登录，请使用一次性登录');
    }

    const label = /mobile/i.test(input.deviceLabel) ? 'Mobile' : 'Desktop';
    let res: Response;
    try {
      res = await cloudFetch(originRes.data, '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: input.username,
          password: input.password,
          deviceLabel: label,
          ...(input.deviceId ? { deviceId: input.deviceId } : {}),
        }),
      });
    } catch (error) {
      return networkFail(error);
    }

    const body = await readJson(res);
    if (!res.ok || body.success !== true) {
      return mapHttpError(res, body, 'AUTH_INVALID_CREDENTIALS');
    }
    const data = body.data as {
      session?: {
        accountId?: string;
        sessionId?: string;
        deviceId?: string;
        accessTokenExpiresAt?: string;
      };
      accessToken?: string;
    };
    const refreshToken = parseRefreshFromSetCookie(setCookieHeader(res));
    if (!refreshToken || !data.session || !data.accessToken) {
      return ipcFail('INTERNAL_UNKNOWN', '登录响应不完整');
    }

    const profile = await fetchProfile(originRes.data, data.accessToken, input.username);
    const deviceId = data.session.deviceId || input.deviceId;
    if (!deviceId || !data.session.accountId || !data.session.sessionId || !data.session.accessTokenExpiresAt) {
      return ipcFail('INTERNAL_UNKNOWN', '登录响应不完整');
    }

    try {
      await deps.vault.store({
        accountId: data.session.accountId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        refreshToken,
        deviceId,
        persist: rememberMe,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'CREDENTIAL_STORAGE_UNAVAILABLE') {
        return ipcFail('AUTH_FEATURE_DISABLED', '当前设备无法安全记住登录，请使用一次性登录');
      }
      return ipcFail('INTERNAL_UNKNOWN', '无法保存登录状态');
    }

    const session: AccountIpcSessionData = {
      accountId: data.session.accountId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      accessToken: data.accessToken,
      expiresAt: data.session.accessTokenExpiresAt,
      deviceId,
      sessionId: data.session.sessionId,
      remembered: rememberMe,
    };
    const checked = accountIpcSessionDataSchema.safeParse(session);
    if (!checked.success) {
      return ipcFail('INTERNAL_UNKNOWN', '登录结果不符合合同');
    }
    cached = checked.data;
    return ipcOk(checked.data);
  }

  async function refreshSession(input: {
    accountId: string;
    deviceId: string;
  }): Promise<IpcResult<{ accessToken: string; expiresAt: string; deviceId: string; sessionId?: string }>> {
    const originRes = requireOrigin();
    if (!originRes.success) return originRes;
    const cred = await deps.vault.retrieve(input.accountId);
    if (!cred) {
      return ipcFail('AUTH_SESSION_EXPIRED', '没有可用的本地凭据，请重新登录');
    }

    let res: Response;
    try {
      res = await cloudFetch(originRes.data, '/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader(cred.refreshToken),
        },
        body: JSON.stringify({ deviceId: input.deviceId }),
      });
    } catch (error) {
      return networkFail(error);
    }

    const body = await readJson(res);
    if (!res.ok || body.success !== true) {
      if (res.status === 401) {
        await deps.vault.remove(input.accountId);
        if (cached?.accountId === input.accountId) cached = null;
      }
      return mapHttpError(res, body, 'AUTH_SESSION_EXPIRED');
    }

    const data = body.data as {
      session?: { accessTokenExpiresAt?: string; sessionId?: string; deviceId?: string };
      accessToken?: string;
    };
    if (!data.accessToken || !data.session?.accessTokenExpiresAt) {
      return ipcFail('INTERNAL_UNKNOWN', '刷新响应不完整');
    }

    const meta = deps.vault.listAccounts().find((account) => account.accountId === input.accountId);
    const persist = Boolean(meta);
    await persistRotatedRefresh(
      input.accountId,
      meta?.displayName ?? cached?.displayName ?? input.accountId,
      meta?.avatarUrl ?? cached?.avatarUrl ?? null,
      data.session.deviceId || input.deviceId,
      persist,
      cred.refreshToken,
      res,
    );

    const payload = {
      accessToken: data.accessToken,
      expiresAt: data.session.accessTokenExpiresAt,
      deviceId: data.session.deviceId || input.deviceId,
      ...(data.session.sessionId ? { sessionId: data.session.sessionId } : {}),
    };
    const checked = accountIpcRefreshDataSchema.safeParse(payload);
    if (!checked.success) {
      return ipcFail('INTERNAL_UNKNOWN', '刷新结果不符合合同');
    }
    const refreshData = {
      accessToken: checked.data.accessToken,
      expiresAt: checked.data.expiresAt,
      deviceId: checked.data.deviceId ?? input.deviceId,
      ...(checked.data.sessionId ? { sessionId: checked.data.sessionId } : {}),
    };
    if (cached?.accountId === input.accountId) {
      cached = {
        ...cached,
        accessToken: refreshData.accessToken,
        expiresAt: refreshData.expiresAt,
        deviceId: refreshData.deviceId,
        sessionId: refreshData.sessionId ?? cached.sessionId,
      };
    }
    return ipcOk(refreshData);
  }

  async function logout(input: { accountId: string; deviceId?: string }): Promise<IpcResult<{ ok: true }>> {
    const cred = await deps.vault.retrieve(input.accountId);
    const originRes = requireOrigin();
    if (cred && originRes.success) {
      try {
        await cloudFetch(originRes.data, '/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: cookieHeader(cred.refreshToken),
          },
          body: JSON.stringify({
            ...(input.deviceId ? { deviceId: input.deviceId } : {}),
          }),
        });
      } catch {
        /* remote logout is best-effort; local vault still clears */
      }
    }
    await deps.vault.remove(input.accountId);
    if (cached?.accountId === input.accountId) cached = null;
    return ipcOk({ ok: true as const });
  }

  async function removeCard(input: { accountId: string }): Promise<IpcResult<{ ok: true }>> {
    await deps.vault.remove(input.accountId);
    if (cached?.accountId === input.accountId) cached = null;
    return ipcOk({ ok: true as const });
  }

  async function revokeRemote(input: {
    accountId: string;
    sessionId: string;
  }): Promise<IpcResult<{ ok: true }>> {
    const originRes = requireOrigin();
    const cred = await deps.vault.retrieve(input.accountId);
    if (originRes.success && cred) {
      const deviceId = cred.deviceId;
      if (deviceId) {
        const refreshed = await refreshSession({ accountId: input.accountId, deviceId });
        if (refreshed.success) {
          try {
            await cloudFetch(originRes.data, `/devices/${input.sessionId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${refreshed.data.accessToken}` },
            });
          } catch {
            /* remote revoke best-effort */
          }
        }
      }
    }
    await deps.vault.remove(input.accountId);
    if (cached?.accountId === input.accountId) cached = null;
    return ipcOk({ ok: true as const });
  }

  async function restoreSession(input: {
    accountId?: string;
    deviceId?: string;
  }): Promise<IpcResult<{ restored: false } | (AccountIpcSessionData & { restored: true })>> {
    const accountId = input.accountId || deps.vault.getLastUsedAccountId();
    if (!accountId) {
      return ipcOk({ restored: false as const });
    }
    if (cached && cached.accountId === accountId && Date.parse(cached.expiresAt) - 30_000 > Date.now()) {
      return ipcOk({ ...cached, restored: true as const });
    }
    const cred = await deps.vault.retrieve(accountId);
    const deviceId = input.deviceId || cred?.deviceId;
    if (!cred || !deviceId) {
      return ipcOk({ restored: false as const });
    }
    const refreshed = await refreshSession({ accountId, deviceId });
    if (!refreshed.success) {
      return ipcOk({ restored: false as const });
    }
    const sessionId = refreshed.data.sessionId ?? cached?.sessionId;
    if (!sessionId) {
      return ipcOk({ restored: false as const });
    }
    const meta = deps.vault.listAccounts().find((account) => account.accountId === accountId);
    const session = {
      accountId,
      displayName: meta?.displayName || cached?.displayName || accountId,
      avatarUrl: meta?.avatarUrl ?? cached?.avatarUrl ?? null,
      accessToken: refreshed.data.accessToken,
      expiresAt: refreshed.data.expiresAt,
      deviceId: refreshed.data.deviceId || deviceId,
      sessionId,
      remembered: Boolean(meta),
      restored: true as const,
    };
    const checked = accountIpcRestoreDataSchema.safeParse(session);
    if (!checked.success || checked.data.restored !== true) {
      return ipcOk({ restored: false as const });
    }
    const restored = checked.data;
    cached = {
      accountId: restored.accountId,
      displayName: restored.displayName,
      avatarUrl: restored.avatarUrl,
      accessToken: restored.accessToken,
      expiresAt: restored.expiresAt,
      deviceId: restored.deviceId,
      sessionId: restored.sessionId,
      remembered: restored.remembered,
    };
    return ipcOk(restored);
  }

  async function dispatch(channel: AccountIpcChannel, payload: unknown): Promise<IpcResult<unknown>> {
    if (payloadHasForbiddenOriginField(payload)) {
      return ipcFail('IPC_DENIED', '不允许由渲染进程指定云端地址');
    }
    const parsed = parseAccountIpcPayload(channel, payload);
    if (!parsed.success) {
      return ipcFail('IPC_INVALID_PAYLOAD', '请求参数无效');
    }
    switch (channel) {
      case 'account:list-saved':
        return ipcOk(toCards(deps.vault.listAccounts()));
      case 'account:capabilities':
        return ipcOk({
          vaultAvailable: deps.vault.isAvailable(),
          rememberMeAvailable: deps.vault.isAvailable(),
        });
      case 'account:login':
        return login(parsed.data as AccountIpcLoginInput);
      case 'account:refresh-session':
        return refreshSession(parsed.data as { accountId: string; deviceId: string });
      case 'account:logout':
        return logout(parsed.data as { accountId: string; deviceId?: string });
      case 'account:remove-card':
        return removeCard(parsed.data as { accountId: string });
      case 'account:restore-session':
        return restoreSession(parsed.data as { accountId?: string; deviceId?: string });
      case 'account:revoke-remote':
        return revokeRemote(parsed.data as { accountId: string; sessionId: string });
      default: {
        const _never: never = channel;
        return ipcFail('IPC_DENIED', `未实现的通道: ${String(_never)}`);
      }
    }
  }

  return {
    channels: ACCOUNT_IPC_CHANNELS,
    dispatch,
    restoreLastSession: () => restoreSession({}),
  };
}

function networkFail(error: unknown): IpcResult<never> {
  const message = error instanceof Error ? error.message : '';
  if (/timeout/i.test(message)) {
    return ipcFail('NETWORK_TIMEOUT', '云端请求超时');
  }
  return ipcFail('NETWORK_OFFLINE', '无法连接云端');
}

export function sanitizeIpcError(error: unknown): IpcResult<never> {
  if (error instanceof AppError) {
    return ipcFail(error.code, error.message);
  }
  return ipcFail('INTERNAL_UNKNOWN', '账户服务暂时不可用');
}
