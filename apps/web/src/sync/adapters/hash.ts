import { computeContentHash, computeContentHashSync } from '../../shared/persistence/indexeddb/hash.js';

/** Sync envelope hash: canonical JSON + SHA-256 (no node:crypto). */
export function computePayloadHashSync(payload: unknown): string {
  return computeContentHashSync(payload);
}

export async function computePayloadHash(payload: unknown): Promise<string> {
  return computeContentHash(payload);
}
