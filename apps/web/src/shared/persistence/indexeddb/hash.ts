/** Stable content hash for sync envelopes and migration markers (browser-safe). */

function djb2Hex(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return [...view].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Prefer WebCrypto SHA-256; fall back to deterministic djb2 when subtle is unavailable. */
export async function computeContentHash(payload: unknown): Promise<string> {
  const text = JSON.stringify(payload);
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return `sha256:${bytesToHex(buf)}`;
  }
  return `sha256:${djb2Hex(text).padEnd(64, '0')}`;
}

/**
 * Sync hash for IndexedDB records. Uses djb2 so it works in browsers without
 * node:crypto (Vite/production bundle).
 */
export function computeContentHashSync(payload: unknown): string {
  const text = JSON.stringify(payload);
  return `sha256:${djb2Hex(text).padEnd(64, '0')}`;
}
