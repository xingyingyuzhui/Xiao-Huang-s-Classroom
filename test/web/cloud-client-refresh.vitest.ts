import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { CloudClient } from '../../apps/web/src/shared/api/cloud-client.js';

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    json: () => Promise.resolve(body),
  };
}

describe('CloudClient refresh single-flight', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('login sends stable deviceId', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/auth/login')) {
        return jsonResponse(200, {
          success: true,
          data: {
            session: {
              accountId: 'acct_1',
              sessionId: 'sess_1',
              deviceId: 'dev_stable',
              accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
            accessToken: 'tok',
          },
          requestId: 'r',
        });
      }
      return jsonResponse(200, {
        success: true,
        data: { displayName: 'Teacher', avatarUrl: null },
        requestId: 'p',
      });
    });

    const client = new CloudClient({
      baseUrl: 'http://localhost:3000/api/cloud/v1',
      getAccessToken: () => null,
      getDeviceId: () => 'dev_stable',
    });
    const result = await client.login('teacher', 'password123');
    expect(result.deviceId).toBe('dev_stable');
    const loginCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/auth/login'));
    expect(loginCall).toBeTruthy();
    const body = JSON.parse(String((loginCall?.[1] as { body?: string })?.body ?? '{}')) as {
      deviceId?: string;
      deviceLabel?: string;
    };
    expect(body.deviceId).toBe('dev_stable');
    expect(body.deviceLabel).toBe('Web');
  });

  test('concurrent 401s refresh once and replay both requests', async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation(
      async (url: string, init?: { headers?: Record<string, string> }) => {
        const path = String(url);
        const auth = init?.headers?.Authorization;
        if (path.includes('/auth/refresh')) {
          refreshCalls += 1;
          return jsonResponse(200, {
            success: true,
            data: {
              session: {
                accountId: 'acct_1',
                sessionId: 'sess_1',
                deviceId: 'dev_1',
                accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
              },
              accessToken: 'new-token',
            },
            requestId: 'r1',
          });
        }
        if (path.includes('/account') && auth === 'Bearer new-token') {
          return jsonResponse(200, {
            success: true,
            data: { displayName: 'Teacher', avatarUrl: null },
            requestId: 'r2',
          });
        }
        if (auth === 'Bearer new-token') {
          return jsonResponse(200, {
            success: true,
            data: { ok: true },
            requestId: 'ok',
          });
        }
        return jsonResponse(401, {
          success: false,
          error: { code: 'AUTH_SESSION_EXPIRED', message: 'expired' },
          requestId: 'e',
        });
      },
    );

    const onUnauth = vi.fn();
    const onRefreshed = vi.fn();
    const client = new CloudClient({
      baseUrl: 'http://localhost:3000/api/cloud/v1',
      getAccessToken: () => 'old-token',
      getDeviceId: () => 'dev_1',
      onUnauthorized: onUnauth,
      onRefreshed,
    });

    const [a, b] = await Promise.all([client.listClasses(), client.getAiUsage()]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
    expect(onRefreshed).toHaveBeenCalledTimes(1);
    expect(onUnauth).not.toHaveBeenCalled();
  });

  test('failed refresh clears via onUnauthorized once', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        success: false,
        error: { code: 'AUTH_SESSION_EXPIRED', message: 'expired' },
        requestId: 'e',
      }),
    );

    const onUnauth = vi.fn();
    const client = new CloudClient({
      baseUrl: 'http://localhost:3000/api/cloud/v1',
      getAccessToken: () => 'old-token',
      getDeviceId: () => 'dev_1',
      onUnauthorized: onUnauth,
    });

    await Promise.allSettled([client.listClasses(), client.listClasses()]);
    expect(onUnauth).toHaveBeenCalled();
    const refreshCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('/auth/refresh'),
    );
    expect(refreshCalls.length).toBe(1);
  });
});
