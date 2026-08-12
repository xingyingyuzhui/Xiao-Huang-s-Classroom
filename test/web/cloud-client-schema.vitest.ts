import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { CloudClient } from '../../apps/web/src/shared/api/cloud-client.js';
import { AppError } from '@xiaohuang/domain-core';

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    json: () => Promise.resolve(body),
  };
}

describe('CloudClient response schema validation', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('rejects sync push payloads that omit cloud snapshot fields', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          applied: [],
          rejected: [],
          conflicts: [
            {
              operationId: 'op-1',
              conflict: {
                resourceType: 'class.roster',
                resourceId: 'r1',
                localSummary: 'revision:1',
                cloudSummary: 'revision:2',
                baseSummary: null,
              },
            },
          ],
          requestId: 'req',
        },
        requestId: 'req',
      }),
    );

    const client = new CloudClient({
      baseUrl: 'http://localhost:3000/api/cloud/v1',
      getAccessToken: () => 'tok',
    });

    await expect(client.syncPush('ws-1', [])).rejects.toMatchObject({
      code: 'NETWORK_RESPONSE_INVALID',
    } satisfies Partial<AppError>);
  });

  test('accepts sync push conflicts with cloud snapshot fields', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: {
          applied: [],
          rejected: [],
          conflicts: [
            {
              operationId: 'op-1',
              conflict: {
                resourceType: 'class.roster',
                resourceId: 'r1',
                localSummary: 'revision:1',
                cloudSummary: 'revision:2',
                baseSummary: null,
                cloudRevision: 2,
                cloudSchemaVersion: 1,
                cloudPayload: { students: [] },
                cloudDeletedAt: null,
              },
            },
          ],
          requestId: 'req',
        },
        requestId: 'req',
      }),
    );

    const client = new CloudClient({
      baseUrl: 'http://localhost:3000/api/cloud/v1',
      getAccessToken: () => 'tok',
    });

    const result = await client.syncPush('ws-1', []);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.conflict.cloudRevision).toBe(2);
  });
});
