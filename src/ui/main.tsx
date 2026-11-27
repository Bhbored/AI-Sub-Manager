import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, FolderSearch, Settings as SettingsIcon } from 'lucide-react';
import type { MonitorApi, MonitorState, Page, WindowMode } from '../shared/contracts.js';
import { WindowBar } from './components/window-bar.js';
import { ExploreConfirmationHost } from './components/explore-confirmation-dialog.js';
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
  const [exploreDirty, setExploreDirty] = useState(false);
  const navigate = useCallback((destination: Page) => {
    if (destination === page) return;
    if (exploreDirty && !window.confirm('Discard unsaved Explore changes?')) return;
    setPage(destination);
  }, [exploreDirty, page]);

  useEffect(() => window.monitor.onNavigate(navigate), [navigate]);
  useEffect(() => {
    if (!exploreDirty) return;
    const block = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', block);
    return () => window.removeEventListener('beforeunload', block);
  }, [exploreDirty]);
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
    void window.monitor.state().then(state => {
      if (active && !updated) setData(state);
    }, failure => {
      if (active) setError(formatError(failure));
    });
    const clock = setInterval(() => setNow(Date.now()), 15000);
    return () => { active = false; unsubscribe(); clearInterval(clock); };
  }, []);

  const home = page === 'dashboard';
  const mode = data?.view.mode ?? 'compact';
  const widget = mode === 'widget';
  const dashboardWidth = mode === 'expanded' ? 'max-w-[100rem]' : 'max-w-6xl';
  const changeMode = (next: WindowMode) => {
    void run(() => window.monitor.setWindowMode(next));
  };
  const refresh = () => void run(window.monitor.refresh);
  return <>
    <WindowBar mode={mode} cornerPinAvailable={data?.view.cornerPinAvailable ?? true}
      onMode={changeMode} onMinimize={() => void run(window.monitor.minimize)}
      onClose={() => void run(window.monitor.closeWindow)}/>
    {!widget && <nav aria-label="Main navigation" className="border-b border-edge bg-panel/40">
      <div className={`mx-auto flex gap-1 px-4 md:px-8 ${dashboardWidth}`}>
        {navigation.map(({ page: destination, label, icon: Icon }) => <button key={destination} type="button"
          aria-label={label} aria-current={page === destination ? 'page' : undefined}
          onClick={() => navigate(destination)}
          className={'inline-flex min-h-11 cursor-pointer items-center gap-2 border-b-2 px-3 text-xs font-medium ' +
            (page === destination ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-foreground')}>
          <Icon size={15} className="block shrink-0"/>{label}
        </button>)}
      </div>
    </nav>}
    <main data-window-mode={mode} className={widget ? 'p-3' : `mx-auto px-4 py-5 md:px-8 md:py-8 ${dashboardWidth}`}>
      {(error || data?.storageError) && <p className="mb-3 rounded-md border border-edge bg-panel p-3 text-xs text-warning" role="alert">{error || data?.storageError}</p>}
      {!data ? <p className="text-xs text-muted">Starting monitor…</p> : widget
        ? <Widget data={data} now={now} onRefresh={refresh}/>
        : home ? <Dashboard data={data} now={now} onRefresh={refresh}/>
        : page === 'settings' ? <Settings data={data} onSave={settings => void run(() => window.monitor.settings(settings))}
          onLogs={() => void run(window.monitor.logs)} onReset={() => void run(window.monitor.reset)} onQuit={() => void run(window.monitor.quit)}/> : null}
      {data && page === 'explore' && <div hidden={widget}>
        <Explore onDirty={setExploreDirty} onOpen={path => void run(() => window.monitor.open(path))}
          onError={failure => setError(formatError(failure))}/>
      </div>}
    </main>
    <ExploreConfirmationHost onError={failure => setError(formatError(failure))}/>
  </>;
}
const root = document.getElementById('root');
if (!root) throw Error('Missing application root.');
createRoot(root).render(<App/>);
