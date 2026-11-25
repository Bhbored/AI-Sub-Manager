import { Activity, RefreshCw } from 'lucide-react';
import { providerIds, providerNames, type MonitorState, type ProviderId, type StatusLine } from '../../shared/contracts.js';
import { Button, Card } from '../components/controls.js';
import { ProviderMark } from '../components/provider-mark.js';
import { QuotaMeter } from '../components/quota-meter.js';
import { providerUsage, statusLabels } from './usage-view.js';

const hints: Partial<Record<StatusLine, string>> = {
  set: 'Status line configured. Restart Claude Code, then run a normal prompt.',
  updated: 'Status line updated. Restart Claude Code to use it.',
  foreign: 'Your existing Claude status line was preserved. See the provider guide to connect it.',
  'no-node': 'Node.js is required for the Claude status line script.',
  error: 'Claude status line setup could not be saved.'
};

function ProviderCard({ id, data, now }: { id: ProviderId; data: MonitorState; now: number }) {
  const { status, snapshot, stale, subscription, renewalDate, days } = providerUsage(data, id, now);
  return <Card className="my-0! flex min-w-0 flex-col gap-4">
    <div className="flex items-center gap-3">
      <ProviderMark id={id}/>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{providerNames[id]}</h2>
        <p className={'text-[11px] ' + (status.connected ? 'text-accent' : 'text-warning')}>{statusLabels[status.state]}</p>
      </div>
      {status.version && <span className="text-[11px] tabular-nums text-muted">v{status.version}</span>}
    </div>
    {snapshot ? <div className="space-y-3 border-t border-edge pt-4">
      {stale && <p className="text-xs text-warning">Cached usage</p>}
      {snapshot.windows.map((quota, index) => <QuotaMeter key={quota.bucket + ':' + quota.durationMinutes + ':' + index} quota={quota} now={now}/>)}
      <p className="text-[11px] text-muted">Last read {new Date(snapshot.collectedAt).toLocaleString()}</p>
    </div> : <div className="min-h-17 border-t border-edge pt-4 text-xs leading-relaxed text-muted">
      {'message' in status && status.message ? status.message : 'Waiting for a usage reading.'}
      {id === 'claude' && status.state === 'unsupported' && hints[data.statusLine] && <p className="mt-2">{hints[data.statusLine]}</p>}
    </div>}
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-edge pt-3 text-[11px] text-muted">
      <span className="break-words">{subscription.plan || snapshot?.plan || 'Subscription'}{renewalDate ? ' · ' + subscription.cycle : ''}</span>
      <span className="tabular-nums">{renewalDate ? 'Renews ' + renewalDate + (days ? ' · ' + days + 'd' : ' · today') : 'Renewal unset'}</span>
    </footer>
  </Card>;
}

export function Dashboard({ data, now, onRefresh }: { data: MonitorState; now: number; onRefresh(): void }) {
  const refreshing = Object.values(data.status).some(item => item.state === 'refreshing');
  return <>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight md:text-3xl">Subscription usage</h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <Activity size={13} className="block text-accent"/>
          {!data.worker ? 'Monitor offline' : data.settings.paused ? 'Monitoring paused' : data.settings.interval ? 'Refreshes every ' + data.settings.interval + ' min' : 'Manual refresh'}
        </p>
      </div>
      <Button aria-label="Refresh now" disabled={refreshing || !data.worker} onClick={onRefresh}>
        <RefreshCw size={14} className={refreshing ? 'motion-safe:animate-spin' : ''}/>
        {refreshing ? 'Refreshing' : 'Refresh'}
      </Button>
    </div>
    <div className="grid gap-3 md:grid-cols-2 md:gap-5">
      {providerIds.map(id => <ProviderCard key={id} id={id} data={data} now={now}/>)}
    </div>
  </>;
}
