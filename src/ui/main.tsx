import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, FolderSearch, Settings as SettingsIcon } from 'lucide-react';
import type { MonitorApi, MonitorState, Page, WindowMode } from '../shared/contracts.js';
import { WindowBar } from './components/window-bar.js';
import { Dashboard } from './features/dashboard.js';
import { Settings } from './features/settings.js';
import { Explore } from './features/explore.js';
import { Widget } from './features/widget.js';
import './theme.css';

declare global {
  interface Window { monitor: MonitorApi }
}

function formatError(failure: unknown) {
  return (failure instanceof Error ? failure.message : String(failure)).replace(/^Error invoking remote method.*?: Error: /, '');
}

const navigation = [
  { page: 'dashboard', label: 'Dashboard', icon: Activity },
  { page: 'explore', label: 'Explore', icon: FolderSearch },
  { page: 'settings', label: 'Settings', icon: SettingsIcon }
] as const;

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
  const mode = data?.view.mode ?? 'compact';
  const widget = mode === 'widget';
  const changeMode = (next: WindowMode) => {
    if (next === 'widget' || widget) setPage('dashboard');
    void run(() => window.monitor.setWindowMode(next));
  };
  const refresh = () => void run(window.monitor.refresh);
  return <>
    <WindowBar mode={mode} onMode={changeMode} onMinimize={() => void run(window.monitor.minimize)}
      onClose={() => void run(window.monitor.closeWindow)}/>
    {!widget && <nav aria-label="Main navigation" className="border-b border-edge bg-panel/40">
      <div className="mx-auto flex max-w-6xl gap-1 px-4 md:px-8">
        {navigation.map(({ page: destination, label, icon: Icon }) => <button key={destination} type="button"
          aria-label={label} aria-current={page === destination ? 'page' : undefined}
          onClick={() => setPage(destination)}
          className={'inline-flex min-h-11 cursor-pointer items-center gap-2 border-b-2 px-3 text-xs font-medium ' +
            (page === destination ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-foreground')}>
          <Icon size={15} className="block shrink-0"/>{label}
        </button>)}
      </div>
    </nav>}
    <main className={widget ? 'p-3' : 'mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8'}>
      {(error || data?.storageError) && <p className="mb-3 rounded-md border border-edge bg-panel p-3 text-xs text-warning" role="alert">{error || data?.storageError}</p>}
      {!data ? <p className="text-xs text-muted">Starting monitor…</p> : widget
        ? <Widget data={data} now={now} onRefresh={refresh}/>
        : home ? <Dashboard data={data} now={now} onRefresh={refresh}/>
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
