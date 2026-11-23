/** Normalize documented Codex app-server rate-limit windows without guessing their duration. */
export function parseRateLimits(result) {
  const windows = [];
  const buckets = result?.rateLimitsByLimitId && typeof result.rateLimitsByLimitId === 'object'
    ? Object.values(result.rateLimitsByLimitId) : [result?.rateLimits];
  for (const bucket of buckets) {
    if (!bucket || typeof bucket !== 'object') continue;
    for (const field of ['primary', 'secondary']) {
      const value = bucket[field];
      if (!value || !Number.isFinite(value.usedPercent) || value.usedPercent < 0 || value.usedPercent > 100 || !Number.isFinite(value.windowDurationMins) || value.windowDurationMins <= 0) continue;
      const reset = Number.isFinite(value.resetsAt) ? new Date(value.resetsAt * 1000) : null;
      windows.push({ bucket: typeof bucket.limitName === 'string' ? bucket.limitName : (bucket.limitId ?? 'Codex'), durationMinutes: value.windowDurationMins, usedPercentage: value.usedPercent, resetAt: reset && !Number.isNaN(reset.getTime()) ? reset.toISOString() : null });
    }
  }
  return windows;
}
