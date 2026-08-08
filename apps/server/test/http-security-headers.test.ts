/**
 * HTTP 安全响应头合同（D-test 批次：node:test → vitest 迁移，行为逐字保持）。
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';

const require = createRequire(import.meta.url);
const { app } = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../src'));

test('HTTP responses do not expose Express and include baseline browser protections', async () => {
  const server = app.listen(0, '127.0.0.1') as Server;
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as import('node:net').AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);

    assert.equal(response.headers.get('x-powered-by'), null);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(response.headers.get('referrer-policy'), 'same-origin');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
