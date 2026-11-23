import { Activity, RefreshCw } from 'lucide-react';
import { providerIds, providerNames, type MonitorState, type ProviderId, type ProviderStatus, type StatusLine } from '../../shared/contracts.js';
import { nextRenewal } from '../../shared/renewal.js';
import { Card, IconButton } from '../components/controls.js';
import { QuotaMeter } from '../components/quota-meter.js';

const labels: Record<ProviderStatus['state'], string> = {
  starting: 'Checking CLI', missing: 'CLI missing', auth: 'Sign-in required', ready: 'Connected',
  unsupported: 'Usage unavailable', unavailable: 'Usage unavailable', disabled: 'Monitoring off',
  error: 'Refresh failed', refreshing: 'Refreshing'
};
const hints: Partial<Record<StatusLine, string>> = {
  set: 'Status line configured. Restart Claude Code, then run a normal prompt.',
  updated: 'Status line updated. Restart Claude Code to use it.',
  foreign: 'Your existing Claude status line was preserved. See the provider guide to connect it.',
  'no-node': 'Node.js is required for the Claude status line script.',
  error: 'Claude status line setup could not be saved.'
};

function ProviderCard({ id, data, now }: { id: ProviderId; data: MonitorState; now: number }) {
  const status = data.status[id];
  const snapshot = status.state === 'ready' ? status : ['error', 'refreshing'].includes(status.state) ? data.cached[id] : null;
  const old = snapshot && (status.state !== 'ready' || now - Date.parse(snapshot.collectedAt) > Math.max(data.settings.interval * 2, 20) * 60000);
  const subscription = data.settings.subscriptions[id];
  const today = new Date(now - new Date(now).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const renewal = nextRenewal(subscription.anchor, subscription.cycle, today);
  const days = renewal ? Math.round((Date.parse(renewal) - Date.parse(today)) / 86400000) : null;
  const date = renewal && new Date(renewal + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return <Card>
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-lg border border-edge bg-field text-[11px] font-bold text-accent">{id === 'codex' ? 'CX' : 'CC'}</span>
      <div><h2 className="text-sm font-semibold">{providerNames[id]}</h2>
        <p className={'text-[11px] ' + (status.connected ? 'text-accent' : 'text-warning')}>{labels[status.state]}{status.version ? ' · v' + status.version : ''}</p>
      </div>
    </div>
    {'message' in status && status.message && <p className="mt-3 text-xs leading-relaxed text-muted">{status.message}</p>}
    {id === 'claude' && status.state === 'unsupported' && hints[data.statusLine] && <p className="mt-2 text-xs leading-relaxed text-muted">{hints[data.statusLine]}</p>}
    {snapshot && <div className="mt-4 space-y-3">
      {old && <p className="text-xs text-warning">Cached usage · may be out of date</p>}
      {snapshot.windows.map((quota, index) => <QuotaMeter key={quota.bucket + ':' + quota.durationMinutes + ':' + index} quota={quota} now={now}/>)}
      <p className="text-[11px] text-muted">Last successful refresh · {new Date(snapshot.collectedAt).toLocaleString()}</p>
    </div>}
    <footer className="mt-3.5 flex justify-between gap-2 border-t border-edge pt-2.5 text-[11px] text-muted">
      <span>{subscription.plan || snapshot?.plan || 'Subscription'}{renewal ? ' · ' + subscription.cycle : ''}</span>
      <span className="text-right">{date ? date + (days ? ' · ' + days + 'd' : ' · today') : 'Renewal date unset'}</span>
    </footer>
  </Card>;
}

export function Dashboard({ data, now, onRefresh }: { data: MonitorState; now: number; onRefresh(): void }) {
  const refreshing = Object.values(data.status).some(item => item.state === 'refreshing');
  return <>
    <div className="mb-5 flex items-center justify-between gap-3">
      <div>
        <p className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-accent">
          <Activity size={12}/>{data.settings.paused ? 'PAUSED' : data.settings.interval ? 'AUTO REFRESH' : 'MANUAL REFRESH'}
        </p>
        <h1 className="mt-1 text-[25px] font-semibold tracking-tight">Subscription usage</h1>
      </div>
      <IconButton title="Refresh now" aria-label="Refresh now" disabled={refreshing || !data.worker} onClick={onRefresh}>
        <RefreshCw size={17} className={refreshing ? 'motion-safe:animate-spin' : ''}/>
      </IconButton>
    </div>
    {providerIds.map(id => <ProviderCard key={id} id={id} data={data} now={now}/>)}
  </>;
}
