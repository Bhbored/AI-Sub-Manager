const ids = ['codex', 'claude'];
const intervals = [0, 1, 5, 10, 15, 30, 60];
const defaults = () => ({
  interval: 10, closeToTray: true, startMinimized: false, startup: false, paused: false, notifications: false,
  disabled: { codex: false, claude: false },
  subscriptions: Object.fromEntries(ids.map(id => [id, { plan: '', cycle: 'monthly', anchor: '', reminder: false }]))
});
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false;
  const date = new Date(value);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
function normalize(value) {
  const output = defaults();
  if (!value || !intervals.includes(value.interval)) throw Error('Invalid monitoring preferences.');
  output.interval = value.interval;
  for (const key of ['closeToTray', 'startMinimized', 'startup', 'paused', 'notifications']) {
    if (typeof value[key] !== 'boolean') throw Error('Invalid general preference.');
    output[key] = value[key];
  }
  for (const id of ids) {
    const sub = value.subscriptions?.[id];
    if (!sub || typeof sub.plan !== 'string' || sub.plan.length > 80
      || !['monthly', 'yearly'].includes(sub.cycle) || (sub.anchor !== '' && !validDate(sub.anchor))
      || typeof value.disabled?.[id] !== 'boolean') throw Error('Invalid subscription preference.');
    output.disabled[id] = value.disabled[id];
    output.subscriptions[id] = { plan: sub.plan.trim(), cycle: sub.cycle, anchor: sub.anchor, reminder: sub.reminder === true };
  }
  return output;
}
module.exports = { ids, defaults, normalize };

