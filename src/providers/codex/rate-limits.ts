import { asRecord, isFiniteNumber, isoDate } from '../../shared/validation.js';
import type { QuotaWindow } from '../../shared/contracts.js';

export function parseRateLimits(input: unknown): QuotaWindow[] {
  const result = asRecord(input);
  const byId = Object.values(asRecord(result.rateLimitsByLimitId));
  const windows: QuotaWindow[] = [];
  for (const entry of byId.length ? byId : [result.rateLimits]) {
    const bucket = asRecord(entry);
    const name = bucket.limitName ?? bucket.limitId;
    for (const key of ['primary', 'secondary']) {
      const { usedPercent, windowDurationMins, resetsAt } = asRecord(bucket[key]);
      if (!isFiniteNumber(usedPercent) || usedPercent < 0 || usedPercent > 100 ||
          !isFiniteNumber(windowDurationMins) || windowDurationMins <= 0) continue;
      windows.push({
        bucket: typeof name === 'string' ? name : 'Codex',
        durationMinutes: windowDurationMins,
        usedPercentage: usedPercent,
        resetAt: isFiniteNumber(resetsAt) ? isoDate(resetsAt * 1000) : null
      });
    }
  }
  return windows;
}
