import { AppError } from '@xiaohuang/domain-core';
import type { SyncPushResponse, SyncPullResponse, SyncOperation } from '@xiaohuang/contracts';

export type CloudClientConfig = {
  baseUrl: string;
  getAccessToken: () => string | null;
  onUnauthorized?: () => void;
};

export class CloudClient {
  constructor(private config: CloudClientConfig) {}

  async syncPush(
    workspaceId: string,
    operations: SyncOperation[],
    signal?: AbortSignal,
  ): Promise<SyncPushResponse> {
    return this.request<SyncPushResponse>(
      'POST',
      `/api/v2/sync/${encodeURIComponent(workspaceId)}/push`,
      { workspaceId, operations },
      signal,
    );
  }

  async syncPull(
    workspaceId: string,
    cursor: string | null,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<SyncPullResponse> {
    return this.request<SyncPullResponse>(
      'POST',
      `/api/v2/sync/${encodeURIComponent(workspaceId)}/pull`,
      { workspaceId, cursor, limit },
      signal,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const token = this.config.getAccessToken();
    const requestId = crypto.randomUUID();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal,
    });

    if (res.status === 401) {
      this.config.onUnauthorized?.();
      throw new AppError('AUTH_UNAUTHORIZED', 'Unauthorized');
    }

    const json = (await res.json()) as { success: boolean; data?: T; error?: { code: string; message: string }; requestId: string };

    if (!json.success || !json.data) {
      const code = json.error?.code ?? 'INTERNAL_UNKNOWN';
      const message = json.error?.message ?? `HTTP ${res.status}`;
      throw new AppError(code as never, message);
    }

    return json.data;
  }
}
