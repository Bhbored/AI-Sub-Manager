import type { MonitorState, ProviderId, ProviderStatus } from '../../shared/contracts.js';
import { nextRenewal } from '../../shared/renewal.js';

export const statusLabels: Record<ProviderStatus['state'], string> = {
  starting: 'Checking CLI', missing: 'CLI missing', auth: 'Sign-in required', ready: 'Connected',
  unsupported: 'Usage unavailable', unavailable: 'Usage unavailable', disabled: 'Monitoring off',
  error: 'Refresh failed', refreshing: 'Refreshing'
};

export function providerUsage(data: MonitorState, id: ProviderId, now: number) {
  const status = data.status[id];
  const snapshot = status.state === 'ready' ? status : ['error', 'refreshing'].includes(status.state) ? data.cached[id] : null;
  const stale = Boolean(snapshot && (status.state !== 'ready' ||
    now - Date.parse(snapshot.collectedAt) > Math.max(data.settings.interval * 2, 20) * 60000));
  const subscription = data.settings.subscriptions[id];
  const today = new Date(now - new Date(now).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const renewal = nextRenewal(subscription.anchor, subscription.cycle, today);
  const days = renewal ? Math.round((Date.parse(renewal) - Date.parse(today)) / 86400000) : null;
  const renewalDate = renewal && new Date(renewal + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return { status, snapshot, stale, subscription, renewalDate, days };
}
