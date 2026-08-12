/** Simple per-account sliding window for sync push rate limits. */
const windows = new Map<string, number[]>();

export function consumeSyncPushQuota(
  accountId: string,
  maxPerMinute: number,
  now = Date.now(),
): boolean {
  const cutoff = now - 60_000;
  const prior = (windows.get(accountId) ?? []).filter((ts) => ts > cutoff);
  if (prior.length >= maxPerMinute) {
    windows.set(accountId, prior);
    return false;
  }
  prior.push(now);
  windows.set(accountId, prior);
  return true;
}

export function resetSyncPushQuotaForTests(): void {
  windows.clear();
}
