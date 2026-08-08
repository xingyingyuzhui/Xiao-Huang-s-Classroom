/**
 * AI chat client 合同（D-test 批次：node:test → vitest 迁移，行为逐字保持）。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  requestChatCompletion,
} = require(path.join(dirname, '../src/services/ai/chat-client'));

test('AI client aborts an unresponsive provider request with a timeout error', async () => {
  await assert.rejects(
    requestChatCompletion({
      apiKey: 'test-key',
      apiBase: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      system: 'system',
      user: 'user',
      timeoutMs: 5,
      fetchImpl(_url: string, options: { signal: { addEventListener: (event: string, listener: () => void) => void } }) {
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      },
    }),
    (error: { status?: number; message?: string }) => error.status === 504 && /超时/.test(error.message ?? ''),
  );
});

test('AI client returns content and turns provider errors into a safe gateway error', async () => {
  const success = await requestChatCompletion({
    apiKey: 'test-key',
    apiBase: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    system: 'system',
    user: 'user',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '  化学答案  ' } }] }),
    }),
  });
  assert.deepEqual(success, { content: '化学答案', model: 'deepseek-v4-flash' });

  await assert.rejects(
    requestChatCompletion({
      apiKey: 'test-key',
      apiBase: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      system: 'system',
      user: 'user',
      fetchImpl: async () => ({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ error: { message: 'provider limit' } }),
      }),
    }),
    (error: { status?: number; message?: string }) => error.status === 502 && /429/.test(error.message ?? ''),
  );
});
