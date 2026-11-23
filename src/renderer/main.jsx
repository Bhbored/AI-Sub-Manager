import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, RefreshCw, Settings, ArrowLeft } from 'lucide-react';
import mark from '../../assets/icon.svg';
import { nextRenewal } from '../main/renewal.mjs';
import './style.css';

const providers = { codex: 'OpenAI Codex', claude: 'Claude Code' };
const setupHints = {
  foreign: 'Claude Code already uses a custom status line, so usage capture was not enabled. See docs/provider-integrations.md to combine them.',
  'no-node': 'Usage capture needs Node.js on your PATH. Install it and restart the monitor.',
  error: 'Claude Code settings could not be updated. See docs/provider-integrations.md for manual setup.'
};
const labels = { starting: 'Checking CLI', missing: 'CLI missing', auth: 'Sign-in required', ready: 'Connected', unsupported: 'Usage unsupported', unavailable: 'Usage unavailable', disabled: 'Monitoring off', error: 'Refresh failed', refreshing: 'Refreshing' };
const intervalOptions = [0, 1, 5, 10, 15, 30, 60];
const dateLabel = value => new Date(value + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function ResetTime({ value, now }) {
  if (!value) return <small>Reset time unavailable</small>;
  const mins = Math.ceil((Date.parse(value) - now) / 60000);
  if (mins <= 0) return <small>Reset time passed · refresh for new usage</small>;
  const days = Math.floor(mins / 1440);
  const hours = Math.floor(mins / 60) % 24;
  return <small>Resets in {days ? days + 'd ' : ''}{hours ? hours + 'h ' : ''}{mins % 60}m</small>;
}

function Dashboard({ data, now, run }) {
  const again = Object.values(data.status).some(item => item.state === 'refreshing');
  const today = new Date(now - new Date(now).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return <>
    <div className="heading">
      <div><span className="eyebrow"><Activity size={12}/> {data.settings.paused ? 'PAUSED' : data.settings.interval ? 'AUTO REFRESH' : 'MANUAL REFRESH'}</span><h1>Subscription usage</h1></div>
      <button className="icon refresh" title="Refresh now" aria-label="Refresh now" disabled={again || !data.worker} onClick={() => run(window.monitor.refresh)}><RefreshCw size={17} className={again ? 'spinning' : ''}/></button>
    </div>
    {Object.entries(providers).map(([id, name]) => {
      const status = data.status[id];
      const snapshot = status.state === 'ready' ? status : ['error', 'refreshing'].includes(status.state) ? data.cached[id] : null;
      const stale = snapshot && (status.state !== 'ready' || now - Date.parse(snapshot.collectedAt) > Math.max(data.settings.interval * 2, 20) * 60000);
      const subscription = data.settings.subscriptions[id];
      const renewal = nextRenewal(subscription.anchor, subscription.cycle, today);
      const days = renewal ? Math.round((Date.parse(renewal) - Date.parse(today)) / 86400000) : null;
      return <section className="card" key={id}>
        <div className="cardhead">
          <span className="provider-icon">{id === 'codex' ? 'CX' : 'CC'}</span>
          <div><h2>{name}</h2><span className={'status ' + (status.connected ? 'connected' : '')}>{labels[status.state]}{status.version ? ' · v' + status.version : ''}</span></div>
        </div>
        {status.message && <p className="provider-message">{status.message}</p>}
        {id === 'claude' && status.state === 'unsupported' && setupHints[data.statusLine] && <p className="provider-message">{setupHints[data.statusLine]}</p>}
        {snapshot && <div className="quota">
          {stale && <p className="stale">Cached usage · may be out of date</p>}
          {snapshot.windows.map((window, i) => {
            const title = window.durationMinutes === 300 ? '5-hour usage' : window.durationMinutes === 10080 ? 'Weekly usage' : window.durationMinutes + '-minute usage';
            return <div className="limit" key={i}>
              <div className="limit-label"><span>{title}{window.bucket && window.bucket.toLowerCase() !== 'codex' ? ' · ' + window.bucket : ''}</span><strong>{window.usedPercentage}%</strong></div>
              <progress aria-label={title} value={window.usedPercentage} max="100"/>
              <ResetTime value={window.resetAt} now={now}/>
            </div>;
          })}
          <small>Last successful refresh · {new Date(snapshot.collectedAt).toLocaleString()}</small>
        </div>}
        <footer>{subscription.plan || snapshot?.plan || 'Subscription'}{renewal ? ' · ' + subscription.cycle : ''}<span>{renewal ? dateLabel(renewal) + (days ? ' · ' + days + 'd' : ' · today') : 'Renewal date unset'}</span></footer>
      </section>;
    })}
  </>;
}

function Subscription({ id, name, settings, update }) {
  const saved = settings.subscriptions[id];
  const [entry, setEntry] = useState(saved);
  useEffect(() => setEntry(saved), [saved.plan, saved.cycle, saved.anchor, saved.reminder]);
  const edit = patch => setEntry(current => ({ ...current, ...patch }));
  return <form className="card settings" onSubmit={event => {
    event.preventDefault();
    update({ subscriptions: { ...settings.subscriptions, [id]: entry } });
  }}>
    <h2>{name} renewal</h2>
    <label>Plan name<input value={entry.plan} maxLength={80} onChange={event => edit({ plan: event.target.value })}/></label>
    <label>Billing cycle<select value={entry.cycle} onChange={event => edit({ cycle: event.target.value })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
    <label>Next renewal date<input type="date" value={entry.anchor} min="1900-01-01" max="9999-12-31" onChange={event => edit({ anchor: event.target.value })}/></label>
    <label className="check">Remind me on the expected renewal date<input type="checkbox" checked={entry.reminder} onChange={event => edit({ reminder: event.target.checked })}/></label>
    <button type="submit" className="button" disabled={JSON.stringify(entry) === JSON.stringify(saved)}>Save renewal</button>
  </form>;
}

function Preferences({ data, run }) {
  const { settings } = data;
  const update = patch => run(() => window.monitor.settings({ ...settings, ...patch }));
  return <>
    <h1>Settings</h1>
    <section className="card settings">
      <h2>Monitoring</h2>
      <label>Refresh interval<select value={settings.interval} onChange={event => update({ interval: Number(event.target.value) })}>{intervalOptions.map(n => <option key={n} value={n}>{n ? n + ' minutes' : 'Manual only'}</option>)}</select></label>
      <label className="check">Pause automatic refresh<input type="checkbox" checked={settings.paused} onChange={event => update({ paused: event.target.checked })}/></label>
      {Object.entries(providers).map(([id, name]) => <label className="check" key={id}>Monitor {name}<input type="checkbox" checked={!settings.disabled[id]} onChange={event => update({ disabled: { ...settings.disabled, [id]: !event.target.checked } })}/></label>)}
    </section>
    <section className="card settings">
      <h2>Windows</h2>
      {[['startup', 'Launch at Windows startup'], ['startMinimized', 'Hide to tray on Windows startup'], ['closeToTray', 'Keep running when closed'], ['notifications', 'Desktop renewal notifications']].map(([key, text]) =>
        <label className="check" key={key}>{text}<input type="checkbox" checked={settings[key]} onChange={event => update({ [key]: event.target.checked })}/></label>)}
    </section>
    {Object.entries(providers).map(([id, name]) => <Subscription key={id} {...{ id, name, settings, update }}/>)}
    <section className="card settings"><h2>Diagnostics</h2><p>Background worker {data.worker ? 'active' : 'offline'}</p><button className="button" onClick={() => run(window.monitor.logs)}>Open logs</button> <button className="button" onClick={() => run(window.monitor.reset)}>Reset preferences</button></section>
    <section className="card"><h2>AI Usage Monitor {data.version}</h2><p>Independent subscription monitoring with the CLIs on your Windows PATH. Accounts are managed in the provider CLIs.</p></section>
    <button className="quit" onClick={() => run(window.monitor.quit)}>Quit application</button>
  </>;
}

function App() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  const run = async action => {
    setError('');
    try { await action(); }
    catch (failure) { setError(failure.message.replace(/^Error invoking remote method.*?: Error: /, '')); }
  };
  useEffect(() => {
    const unsubscribe = window.monitor.onUpdate(setData);
    const unnav = window.monitor.onNavigate(setPage);
    void run(async () => setData(await window.monitor.state()));
    const clock = setInterval(() => setNow(Date.now()), 15000);
    return () => { unsubscribe(); unnav(); clearInterval(clock); };
  }, []);
  return <>
    <header><div className="brand"><img src={mark} alt="" width="36" height="36"/><strong>AI Usage Monitor</strong></div>
      <button className="icon" aria-label={page === 'settings' ? 'Back to dashboard' : 'Settings'} onClick={() => setPage(page === 'settings' ? 'dashboard' : 'settings')}>{page === 'settings' ? <ArrowLeft size={18}/> : <Settings size={18}/>}</button>
    </header>
    <main>
      {(error || data?.storageError) && <p className="notice" role="alert">{error || data.storageError}</p>}
      {!data ? <p>Starting monitor…</p> : page === 'settings' ? <Preferences {...{ data, run }}/> : <Dashboard {...{ data, now, run }}/>}
    </main>
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);


