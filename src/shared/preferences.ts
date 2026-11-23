import { intervals, providerIds, type Preferences } from './contracts.js';
import { asRecord } from './validation.js';

const blankSubscription = () => ({ plan: '', cycle: 'monthly' as const, anchor: '', reminder: false });
export const defaults = (): Preferences => ({
  interval: 10, closeToTray: true, startMinimized: false, startup: false, paused: false, notifications: false,
  disabled: { codex: false, claude: false },
  subscriptions: { codex: blankSubscription(), claude: blankSubscription() }
});

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false;
  const date = new Date(value);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

export function normalize(input: unknown): Preferences {
  const value = asRecord(input);
  const output = defaults();
  const interval = intervals.find(option => option === value.interval);
  if (interval === undefined) throw Error('Invalid monitoring preferences.');
  output.interval = interval;
  for (const key of ['closeToTray', 'startMinimized', 'startup', 'paused', 'notifications'] as const) {
    const enabled = value[key];
    if (typeof enabled !== 'boolean') throw Error('Invalid general preference.');
    output[key] = enabled;
  }
  const subscriptions = asRecord(value.subscriptions);
  const disabled = asRecord(value.disabled);
  for (const id of providerIds) {
    const { plan, cycle, anchor, reminder } = asRecord(subscriptions[id]);
    const off = disabled[id];
    if (typeof plan !== 'string' || plan.length > 80 || (cycle !== 'monthly' && cycle !== 'yearly') ||
      (anchor !== '' && !validDate(anchor)) || typeof off !== 'boolean') throw Error('Invalid subscription preference.');
    output.disabled[id] = off;
    output.subscriptions[id] = { plan: plan.trim(), cycle, anchor, reminder: reminder === true };
  }
  return output;
}
