import type { QuotaWindow } from '../../shared/contracts.js';

function resetLabel(value: string | null, now: number) {
  if (!value) return 'Reset time unavailable';
  const mins = Math.ceil((Date.parse(value) - now) / 60000);
  if (mins <= 0) return 'Reset time passed · refresh for new usage';
  const days = Math.floor(mins / 1440);
  const hours = Math.floor(mins / 60) % 24;
  return 'Resets in ' + [days && days + 'd', hours && hours + 'h', mins % 60 + 'm'].filter(Boolean).join(' ');
}

export function QuotaMeter({ quota, now }: { quota: QuotaWindow; now: number }) {
  const name = quota.durationMinutes === 300 ? '5-hour usage' : quota.durationMinutes === 10080 ? 'Weekly usage' : quota.durationMinutes + '-minute usage';
  const bucket = quota.bucket.toLowerCase();
  const detail = bucket && bucket !== 'codex' && bucket !== 'claude' ? ' · ' + quota.bucket : '';
  return <div className="space-y-1.5">
    <div className="flex justify-between gap-2 text-xs tabular-nums"><span>{name}{detail}</span><strong>{quota.usedPercentage}%</strong></div>
    <progress aria-label={name + detail} value={quota.usedPercentage} max={100} className="quota-meter block h-1.5 w-full"/>
    <p className="text-[11px] text-muted">{resetLabel(quota.resetAt, now)}</p>
  </div>;
}
