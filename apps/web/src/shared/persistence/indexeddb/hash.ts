import { createHash } from 'node:crypto';

/** Stable content hash for sync envelopes and migration markers. */
export async function computeContentHash(payload: unknown): Promise<string> {
  const text = JSON.stringify(payload);
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `sha256:${hex}`;
  }
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

export function computeContentHashSync(payload: unknown): string {
  const text = JSON.stringify(payload);
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}
