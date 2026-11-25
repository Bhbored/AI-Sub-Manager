import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, FolderSearch, Settings as SettingsIcon } from 'lucide-react';
import type { MonitorApi, MonitorState, Page } from '../shared/contracts.js';
import mark from '../../assets/icon.svg';
import { IconButton } from './components/controls.js';
import { Dashboard } from './features/dashboard.js';
import { Settings } from './features/settings.js';
import { Explore } from './features/explore.js';
import '../../generated/theme.css';

declare global {
  interface Window { monitor: MonitorApi }
}

function formatError(failure: unknown) {
  return (failure instanceof Error ? failure.message : String(failure)).replace(/^Error invoking remote method.*?: Error: /, '');
}

function App() {
  const [data, setData] = useState<MonitorState>();
  const [page, setPage] = useState<Page>('dashboard');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  const run = async (action: () => Promise<void>) => {
    setError('');
    try { await action(); }
    catch (failure) { setError(formatError(failure)); }
  };

  useEffect(() => {
    let active = true;
    let updated = false;
    const unsubscribe = window.monitor.onUpdate(state => {
      updated = true;
      setData(state);
    });
    const unnav = window.monitor.onNavigate(setPage);
    void window.monitor.state().then(state => {
      if (active && !updated) setData(state);
    }, failure => {
      if (active) setError(formatError(failure));
    });
    const clock = setInterval(() => setNow(Date.now()), 15000);
    return () => { active = false; unsubscribe(); unnav(); clearInterval(clock); };
  }, []);

  const home = page === 'dashboard';
  return <>
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-edge bg-background px-5">
      <div className="flex items-center gap-3 text-[13px]"><img src={mark} alt="" width="36" height="36"/><strong>AI Usage Monitor</strong></div>
      {home ? <div className="flex gap-2">
        <IconButton aria-label="Explore" title="Explore sessions, skills and MCP servers" onClick={() => setPage('explore')}><FolderSearch size={18}/></IconButton>
        <IconButton aria-label="Settings" onClick={() => setPage('settings')}><SettingsIcon size={18}/></IconButton>
      </div> : <IconButton aria-label="Back to dashboard" onClick={() => setPage('dashboard')}><ArrowLeft size={18}/></IconButton>}
    </header>
    <main className="px-5 py-6">
      {(error || data?.storageError) && <p className="mb-3 rounded-md border border-edge bg-panel p-3 text-xs text-warning" role="alert">{error || data?.storageError}</p>}
      {!data ? <p className="text-xs text-muted">Starting monitor…</p> : home
        ? <Dashboard data={data} now={now} onRefresh={() => void run(window.monitor.refresh)}/>
        : page === 'explore'
        ? <Explore onOpen={path => void run(() => window.monitor.open(path))} onError={failure => setError(formatError(failure))}/>
        : <Settings data={data} onSave={settings => void run(() => window.monitor.settings(settings))}
          onLogs={() => void run(window.monitor.logs)} onReset={() => void run(window.monitor.reset)} onQuit={() => void run(window.monitor.quit)}/>}
    </main>
  </>;
}
const root = document.getElementById('root');
if (!root) throw Error('Missing application root.');
createRoot(root).render(<App/>);
