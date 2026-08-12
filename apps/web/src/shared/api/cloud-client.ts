import { AppError } from '@xiaohuang/domain-core';
import type {
  SyncPushResponse,
  SyncPullResponse,
  SyncOperation,
  ClassRecord,
} from '@xiaohuang/contracts';

export type CloudDeviceLabel = 'Web' | 'Desktop' | 'Mobile';

export type CloudClientConfig = {
  /** Base URL including `/api/cloud/v1` (no trailing slash). */
  baseUrl: string;
  getAccessToken: () => string | null;
  getDeviceId?: () => string;
  /** Called after a successful cookie refresh so the session controller can store the new access token. */
  onRefreshed?: (result: CloudLoginResult) => void;
  onUnauthorized?: () => void;
};

export type CloudLoginResult = {
  accountId: string;
  displayName: string;
  accessToken: string;
  expiresAt: number;
  sessionId: string;
  deviceId: string;
  avatarUrl: string | null;
};

export type PersonalWorkspace = {
  id: string;
  classId: string | null;
  accountId: string;
  subjectId: string;
  kind: 'personal' | 'class';
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** HTTP 公网非 secure context 下 crypto.randomUUID 可能不可用。 */
export function newRequestId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

type RequestOpts = {
  signal?: AbortSignal;
  tokenOverride?: string;
  auth?: boolean;
  skipRefresh?: boolean;
};

export class CloudClient {
  private refreshInflight: Promise<CloudLoginResult | null> | null = null;
  private readonly pendingAborts = new Set<AbortController>();
  private memoryAccessToken: string | null = null;

  constructor(private config: CloudClientConfig) {}

  abortInflight(): void {
    this.refreshInflight = null;
    for (const controller of this.pendingAborts) {
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    }
    this.pendingAborts.clear();
  }

  async login(
    username: string,
    password: string,
    deviceLabel: CloudDeviceLabel = 'Web',
  ): Promise<CloudLoginResult> {
    const deviceId = this.config.getDeviceId?.();
    const json = await this.requestRaw<{
      session: {
        accountId: string;
        sessionId: string;
        deviceId: string;
        accessTokenExpiresAt: string;
      };
      accessToken: string;
    }>(
      'POST',
      '/auth/login',
      {
        username,
        password,
        deviceLabel,
        ...(deviceId ? { deviceId } : {}),
      },
      { auth: false, skipRefresh: true },
    );

    const result = await this.hydrateLoginResult(json);
    this.memoryAccessToken = result.accessToken;
    return result;
  }

  async logout(allDevices = false): Promise<void> {
    const deviceId = this.config.getDeviceId?.();
    this.abortInflight();
    this.memoryAccessToken = null;
    try {
      await this.requestRaw(
        'POST',
        '/auth/logout',
        {
          ...(deviceId ? { deviceId } : {}),
          ...(allDevices ? { allDevices: true } : {}),
        },
        { auth: true, skipRefresh: true },
      );
    } catch {
      /* local session is cleared by caller regardless */
    }
  }

  async refreshSession(): Promise<CloudLoginResult | null> {
    const deviceId = this.config.getDeviceId?.();
    if (!deviceId) return null;
    const json = await this.requestRaw<{
      session: {
        accountId: string;
        sessionId: string;
        deviceId: string;
        accessTokenExpiresAt: string;
      };
      accessToken: string;
    }>('POST', '/auth/refresh', { deviceId }, { auth: false, skipRefresh: true });
    const result = await this.hydrateLoginResult(json);
    this.memoryAccessToken = result.accessToken;
    this.config.onRefreshed?.(result);
    return result;
  }

  async ensurePersonalWorkspace(subjectId: string): Promise<PersonalWorkspace> {
    return this.request<PersonalWorkspace>('POST', '/workspaces/personal', { subjectId });
  }

  async ensureClassWorkspace(classId: string, subjectId: string): Promise<PersonalWorkspace> {
    return this.request<PersonalWorkspace>('POST', '/workspaces/class', { classId, subjectId });
  }

  async listClasses(): Promise<ClassRecord[]> {
    return this.request<ClassRecord[]>('GET', '/classes');
  }

  async createClass(name: string): Promise<ClassRecord> {
    return this.request<ClassRecord>('POST', '/classes', { name });
  }

  async deleteClass(classId: string): Promise<ClassRecord> {
    return this.request<ClassRecord>('DELETE', `/classes/${encodeURIComponent(classId)}`);
  }

  async copyClass(
    classId: string,
    name: string,
    includeProgress = false,
  ): Promise<ClassRecord> {
    return this.request<ClassRecord>('POST', `/classes/${encodeURIComponent(classId)}/copy`, {
      name,
      includeProgress,
    });
  }

  async restoreClass(classId: string): Promise<ClassRecord> {
    return this.request<ClassRecord>('POST', `/classes/${encodeURIComponent(classId)}/restore`);
  }

  async listTrashClasses(): Promise<ClassRecord[]> {
    return this.request<ClassRecord[]>('GET', '/trash/classes');
  }

  async listDevices(): Promise<
    Array<{
      sessionId: string;
      deviceId: string;
      label: string;
      lastSeenAt: string;
      createdAt: string;
      current: boolean;
    }>
  > {
    return this.request('GET', '/devices');
  }

  async revokeDevice(sessionId: string): Promise<{ revoked: boolean; current?: boolean }> {
    return this.request('DELETE', `/devices/${encodeURIComponent(sessionId)}`);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
    return this.request('POST', '/account/password/change', {
      currentPassword,
      newPassword,
    });
  }

  async patchProfile(patch: {
    displayName?: string;
    avatarUrl?: string | null;
  }): Promise<{ displayName: string; avatarUrl: string | null }> {
    return this.request('PATCH', '/account', patch);
  }

  async getAiCredential(): Promise<{
    configured: boolean;
    provider?: string;
    model?: string;
    last4?: string;
    updatedAt?: string;
  }> {
    return this.request('GET', '/ai/credential');
  }

  async setAiCredential(input: {
    provider: 'openai' | 'deepseek';
    model: string;
    apiKey: string;
  }): Promise<{
    configured: boolean;
    provider: string;
    model: string;
    last4: string;
    updatedAt: string;
  }> {
    return this.request('PUT', '/ai/credential', input);
  }

  async removeAiCredential(): Promise<{ removed: boolean }> {
    return this.request('DELETE', '/ai/credential');
  }

  async getAiUsage(): Promise<{
    daily: { used: number; limit: number };
    monthly: { used: number; limit: number };
  }> {
    return this.request('GET', '/ai/usage');
  }

  async chatAi(input: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ text: string; model: string }> {
    return this.request('POST', '/ai/chat', input);
  }

  async syncPush(
    workspaceId: string,
    operations: SyncOperation[],
    signal?: AbortSignal,
  ): Promise<SyncPushResponse> {
    return this.request<SyncPushResponse>('POST', '/sync/push', { workspaceId, operations }, signal);
  }

  async syncPull(
    workspaceId: string,
    cursor: string | null,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<SyncPullResponse> {
    const params = new URLSearchParams();
    params.set('workspaceId', workspaceId);
    if (cursor != null) params.set('cursor', cursor);
    if (limit != null) params.set('limit', String(limit));
    return this.request<SyncPullResponse>('GET', `/sync/pull?${params.toString()}`, undefined, signal);
  }

  private async hydrateLoginResult(json: {
    session: {
      accountId: string;
      sessionId: string;
      deviceId: string;
      accessTokenExpiresAt: string;
    };
    accessToken: string;
  }): Promise<CloudLoginResult> {
    const expiresAt = Date.parse(json.session.accessTokenExpiresAt);
    let displayName = json.session.accountId;
    let avatarUrl: string | null = null;
    try {
      const profile = await this.requestRaw<{ displayName: string; avatarUrl: string | null }>(
        'GET',
        '/account',
        undefined,
        { auth: true, skipRefresh: true, tokenOverride: json.accessToken },
      );
      displayName = profile.displayName || displayName;
      avatarUrl = profile.avatarUrl ?? null;
    } catch {
      /* profile optional at first login */
    }

    return {
      accountId: json.session.accountId,
      displayName,
      accessToken: json.accessToken,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 15 * 60_000,
      sessionId: json.session.sessionId,
      deviceId: json.session.deviceId,
      avatarUrl,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    tokenOverride?: string,
  ): Promise<T> {
    const opts: RequestOpts = {
      auth: true,
    };
    if (signal) opts.signal = signal;
    if (tokenOverride) opts.tokenOverride = tokenOverride;
    return this.requestRaw<T>(method, path, body, opts);
  }

  private currentAccessToken(): string | null {
    return this.memoryAccessToken ?? this.config.getAccessToken();
  }

  private singleFlightRefresh(): Promise<CloudLoginResult | null> {
    if (!this.refreshInflight) {
      this.refreshInflight = this.refreshSession()
        .catch(() => null)
        .finally(() => {
          this.refreshInflight = null;
        });
    }
    return this.refreshInflight;
  }

  private async requestRaw<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: RequestOpts = {},
  ): Promise<T> {
    const auth = opts.auth !== false;
    const token = opts.tokenOverride ?? (auth ? this.currentAccessToken() : null);
    const requestId = newRequestId();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const localAbort = new AbortController();
    this.pendingAborts.add(localAbort);
    const onOuterAbort = () => localAbort.abort();
    if (opts.signal) {
      if (opts.signal.aborted) {
        this.pendingAborts.delete(localAbort);
        throw new AppError('NETWORK_TIMEOUT', '请求已取消');
      }
      opts.signal.addEventListener('abort', onOuterAbort, { once: true });
    }

    let res: Response;
    try {
      res = await fetch(joinUrl(this.config.baseUrl, path), {
        method,
        headers,
        credentials: 'include',
        ...(body != null ? { body: JSON.stringify(body) } : {}),
        signal: localAbort.signal,
      });
    } finally {
      this.pendingAborts.delete(localAbort);
      opts.signal?.removeEventListener('abort', onOuterAbort);
    }

    const json = (await res.json().catch(() => null)) as {
      success: boolean;
      data?: T;
      error?: { code: string; message: string };
      requestId: string;
    } | null;

    if (res.status === 401) {
      if (!opts.skipRefresh && this.config.getDeviceId?.()) {
        const refreshed = await this.singleFlightRefresh();
        if (refreshed) {
          return this.requestRaw<T>(method, path, body, {
            ...opts,
            skipRefresh: true,
            tokenOverride: refreshed.accessToken,
          });
        }
      }
      this.memoryAccessToken = null;
      if (!opts.skipRefresh) {
        this.config.onUnauthorized?.();
      }
      const code = (json?.error?.code ?? 'AUTH_SESSION_EXPIRED') as never;
      const message = json?.error?.message ?? '登录已失效，请重新登录';
      throw new AppError(code, message);
    }

    if (!json || !json.success || json.data === undefined) {
      const code = (json?.error?.code ?? 'INTERNAL_UNKNOWN') as never;
      const message = json?.error?.message ?? `HTTP ${res.status}`;
      throw new AppError(code, message);
    }

    return json.data;
  }
}
