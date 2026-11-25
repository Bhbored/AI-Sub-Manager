import { RefreshCw } from 'lucide-react';
import { providerIds, providerNames, type MonitorState } from '../../shared/contracts.js';
import { IconButton } from '../components/controls.js';
import { ProviderMark } from '../components/provider-mark.js';
import { resetLabel } from '../components/quota-meter.js';
import { providerUsage, statusLabels } from './usage-view.js';

const quotaWindows = [{ duration: 300, label: '5 hours' }, { duration: 10080, label: '7 days' }];

export function Widget({ data, now, onRefresh }: { data: MonitorState; now: number; onRefresh(): void }) {
  const refreshing = Object.values(data.status).some(item => item.state === 'refreshing');
  return <>
    <div className="mb-2 flex items-center justify-between gap-2">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Usage at a glance</h1>
        <p className="text-[11px] text-muted">
          {!data.worker ? 'Monitor offline' : data.settings.paused ? 'Monitoring paused' : data.settings.interval ? 'Refreshes every ' + data.settings.interval + ' min' : 'Manual refresh'}
        </p>
      </div>
      <IconButton aria-label="Refresh now" disabled={refreshing || !data.worker} onClick={onRefresh}>
        <RefreshCw size={15} className={refreshing ? 'motion-safe:animate-spin' : ''}/>
      </IconButton>
    </div>
    <div className="divide-y divide-edge rounded-lg border border-edge bg-panel">
      {providerIds.map(id => {
        const { status, snapshot, stale, renewalDate } = providerUsage(data, id, now);
        return <section key={id} className="px-3 py-2.5">
          <header className="mb-2 flex items-center gap-2">
            <ProviderMark id={id}/>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xs font-semibold">{providerNames[id]}</h2>
              <p className={'text-[10px] ' + (stale || !status.connected ? 'text-warning' : 'text-muted')}>
                {stale ? 'Cached usage' : statusLabels[status.state]}
              </p>
            </div>
            {renewalDate && <span className="text-right text-[10px] text-muted">Renews {renewalDate}</span>}
          </header>
          <div className="grid grid-cols-2 gap-3">
            {quotaWindows.map(({ duration, label }) => {
              const quota = snapshot?.windows.find(window => window.durationMinutes === duration && window.bucket.toLowerCase() === id)
                ?? snapshot?.windows.find(window => window.durationMinutes === duration);
              return <div key={duration} className="min-w-0">
                <div className="flex justify-between gap-2 text-[11px] tabular-nums">
                  <span className="text-muted">{label}</span><strong>{quota ? quota.usedPercentage + '%' : '—'}</strong>
                </div>
                {quota && <progress className="quota-meter my-1 block h-1 w-full" aria-label={providerNames[id] + ' ' + label} value={quota.usedPercentage} max={100}/>}
                <p className="text-[10px] text-muted">{quota ? resetLabel(quota.resetAt, now, true) : 'Usage unavailable'}</p>
              </div>;
            })}
          </div>
        </section>;
      })}
    </div>
    {!data.view.cornerPinAvailable && <p className="mt-2 text-[11px] leading-snug text-muted">Your Wayland desktop controls widget position and pinning.</p>}
  </>;
}
