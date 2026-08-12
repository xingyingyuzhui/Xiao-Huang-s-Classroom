import { createHash } from 'node:crypto';

function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  const input = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    const next = input[key];
    if (next === undefined) continue;
    sorted[key] = canonicalizeValue(next);
  }
  return sorted;
}

/** Canonical JSON + SHA-256; must match the web client (`indexeddb/hash.ts`). */
export function computeContentHash(payload: unknown): string {
  const canonical = JSON.stringify(canonicalizeValue(payload));
  const hex = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hex}`;
}
