import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { FolderOpen, RefreshCw, Trash2 } from 'lucide-react';
import { providerIds, providerNames, type ExploreDocument, type Inventory, type InventoryProject, type ProviderId } from '../../shared/contracts.js';
import { formatBytes } from '../../shared/format.js';
import { Button, Card, IconButton } from '../components/controls.js';
import { ProviderMark } from '../components/provider-mark.js';
import { syntaxError } from './explore/syntax.js';

const DocumentEditor = lazy(() => import('./explore/document-editor.js'));

const pages = ['Projects', 'MCP', 'Skills', 'Plugins', 'Configuration'] as const;
type Page = typeof pages[number];
type Sort = 'recent' | 'size' | 'sessions';
const sorters: Record<Sort, (a: InventoryProject, b: InventoryProject) => number> = {
  recent: (a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''),
  size: (a, b) => b.bytes - a.bytes,
  sessions: (a, b) => b.sessions - a.sessions
};
const day = (value: string | null) => value ? new Date(value).toLocaleDateString() : 'Unknown';
const errorText = (failure: unknown) => String((failure as Error)?.message ?? failure).replace(/^Error invoking remote method.*?: Error: /, '');

function Row({ title, detail, meta, actions }: { title: string; detail?: string; meta?: string; actions?: ReactNode }) {
  return <li className="flex flex-wrap items-center justify-between gap-2 border-b border-edge py-3 last:border-b-0">
    <div className="min-w-0 flex-1 basis-36">
      <p className="break-words text-sm font-medium">{title}</p>
      {detail && <p className="break-words text-xs text-muted">{detail}</p>}
      {meta && <p className="text-xs text-muted">{meta}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </li>;
}

export function Explore({ onOpen, onError, onDirty }: {
  onOpen(path: string): void; onError(failure: unknown): void; onDirty(value: boolean): void;
}) {
  const [provider, setProvider] = useState<ProviderId>(providerIds[0]);
  const [tabs, setTabs] = useState<Record<ProviderId, Page>>({ codex: 'Projects', claude: 'Projects' });
  const [data, setData] = useState<Inventory>();
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>('recent');
  const [all, setAll] = useState(false);
  const [scan, setScan] = useState(0);
  const [file, setFile] = useState<{ id: string; document: ExploreDocument }>();
  const [draft, setDraft] = useState('');
  const [editorError, setEditorError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const prefix = useId();
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const tab = tabs[provider];
  const dirty = Boolean(file && file.document.text !== draft);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const checkDiscard = () => !dirty || window.confirm('Discard unsaved changes to this document?');

  useEffect(() => {
    onDirty(dirty || busy);
    return () => onDirty(false);
  }, [dirty, busy, onDirty]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    window.monitor.inventory(provider, tab === 'Plugins' || tab === 'Skills').then(value => {
      if (active) setData(value);
    }, failure => { if (active) onError(failure); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [provider, scan, tab]);

  function selectProvider(id: ProviderId) {
    if (provider === id || busy || !checkDiscard()) return;
    setFile(undefined);
    setNotice('');
    setData(undefined);
    setAll(false);
    setProvider(id);
  }

  function selectTab(page: Page) {
    if (page === tab || busy || !checkDiscard()) return;
    setFile(undefined);
    setNotice('');
    setTabs(current => ({ ...current, [provider]: page }));
  }

  async function openFile(id: string) {
    if (busy || !checkDiscard()) return;
    setBusy(true);
    try {
      const document = await window.monitor.readExploreDocument(provider, id);
      setFile({ id, document });
      setDraft(document.text);
      setEditorError('');
    } catch (error) { onError(error); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!file || busy || !dirty || !file.document.writable || syntaxError(file.document.language, draft)) return;
    const submitted = draft;
    setBusy(true);
    setEditorError('');
    try {
      const document = await window.monitor.saveExploreDocument(provider, file.id, file.document.revision, submitted);
      setFile({ id: file.id, document });
      if (draftRef.current === submitted) setDraft(document.text);
      setScan(value => value + 1);
    } catch (error) { setEditorError(errorText(error)); }
    finally { setBusy(false); }
  }

  async function remove(id: string, trigger: HTMLButtonElement) {
    if (busy || loading || !checkDiscard()) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await window.monitor.removeExploreItem(provider, id);
      if (result) {
        setFile(undefined);
        setData(result.inventory);
        setNotice(result.message);
        setScan(value => value + 1);
      }
    } catch (error) {
      onError(error);
      setScan(value => value + 1);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => { if (trigger.isConnected) trigger.focus(); });
    }
  }

  const current = data?.provider === provider ? data : undefined;
  const projects = current ? [...current.projects].sort(sorters[sort]) : [];
  const edit = (id: string | undefined, label = 'Edit') => id && <Button disabled={busy || loading} onClick={() => void openFile(id)}>{label}</Button>;
  const deletion = (id: string | undefined, label: string) => id && <IconButton aria-label={label} disabled={busy || loading}
    className="text-warning hover:border-warning hover:text-warning" onClick={event => void remove(id, event.currentTarget)}>
    <Trash2 size={16} aria-hidden="true"/>
  </IconButton>;
  const folder = (path: string, label: string) => <IconButton aria-label={label} onClick={() => onOpen(path)}><FolderOpen size={16}/></IconButton>;

  return <>
    <h1 className="mb-4 text-[26px] font-semibold tracking-tight md:text-3xl">Explore</h1>
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Provider">
      {providerIds.map(id => <Button key={id} aria-pressed={provider === id} disabled={busy}
        className={provider === id ? 'border-accent bg-accent/10 text-accent' : ''}
        onClick={() => selectProvider(id)}><ProviderMark id={id}/>{providerNames[id]}</Button>)}
      <IconButton aria-label="Rescan" disabled={loading || busy} className="ml-auto" onClick={() => setScan(value => value + 1)}>
        <RefreshCw size={16} className={loading ? 'motion-safe:animate-spin' : ''}/>
      </IconButton>
    </div>
    <div role="tablist" aria-label={providerNames[provider] + ' sections'} className="mt-4 flex overflow-x-auto border-b border-edge"
      onKeyDown={event => {
        const focused = tabButtons.current.findIndex(button => button === event.target);
        const index = focused < 0 ? pages.indexOf(tab) : focused;
        const next = event.key === 'ArrowRight' ? (index + 1) % pages.length : event.key === 'ArrowLeft' ? (index - 1 + pages.length) % pages.length :
          event.key === 'Home' ? 0 : event.key === 'End' ? pages.length - 1 : -1;
        if (next === -1) return;
        event.preventDefault();
        tabButtons.current[next]?.focus();
      }}>
      {pages.map((page, index) => <button key={page} type="button" ref={button => { tabButtons.current[index] = button; }}
        role="tab" id={prefix + '-tab-' + index} aria-selected={tab === page} aria-controls={prefix + '-panel'}
        tabIndex={tab === page ? 0 : -1} disabled={busy}
        className={'min-h-11 shrink-0 border-b-2 px-3 text-xs font-semibold ' + (tab === page ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-foreground')}
        onClick={() => selectTab(page)}>{page}</button>)}
    </div>

    {notice && <p role="status" className="mt-3 text-xs text-accent">{notice}</p>}
    {loading && <p role="status" className="mt-3 text-xs text-muted">Refreshing inventory…</p>}
    {current?.warnings.map(warning => <p key={warning} className="mt-2 text-xs text-warning">{warning}</p>)}
    <div id={prefix + '-panel'} role="tabpanel" aria-labelledby={prefix + '-tab-' + pages.indexOf(tab)}
      className={file ? 'mt-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-start md:gap-4' : 'mt-3'}>
      <div className={file ? 'hidden md:block' : ''}>
        {!current && !loading && <p className="text-sm text-muted">Inventory is unavailable. Rescan to try again.</p>}
        {current && <Card className="my-0!">
          {tab === 'Projects' && <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-3">
              <div><h2 className="text-sm font-semibold">Projects</h2>
                <p className="text-xs text-muted">{current.sessionCount} sessions · {formatBytes(current.sessionBytes)} tracked</p></div>
              {folder(current.home, 'Open ' + providerNames[provider] + ' folder')}
            </div>
            <label className="my-3 flex items-center gap-2 text-xs text-muted">Sort by
              <select value={sort} onChange={event => setSort(event.target.value as Sort)} className="rounded-md border border-edge bg-field px-2 py-1">
                <option value="recent">Last active</option><option value="size">Size</option><option value="sessions">Sessions</option>
              </select>
            </label>
            <ul>{(all ? projects : projects.slice(0, 8)).map(project => <Row key={project.id ?? project.folder + project.path} title={project.name}
              detail={project.path ?? project.folder} meta={`${project.sessions} sessions · ${formatBytes(project.bytes)} · ${day(project.updated)}`}
              actions={<>{folder(project.folder, 'Open history folder for ' + project.name)}{deletion(project.id, 'Delete history for ' + project.name)}</>}/>)}</ul>
            {projects.length === 0 && <p className="text-xs text-muted">No local history found.</p>}
            {projects.length > 8 && <Button className="mt-3" onClick={() => setAll(value => !value)}>{all ? 'Show fewer' : 'Show all projects'}</Button>}
          </>}
          {tab === 'MCP' && <>
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">MCP servers</h2>
              {edit('global-mcp', 'Edit user configuration')}</div>
            <ul>{current.mcpServers.map((server, index) => <Row key={server.name + server.source + index} title={server.name}
              detail={[server.transport, server.target].filter(Boolean).join(' · ')} meta={server.source}/>)}</ul>
            {!current.mcpServers.length && <p className="mt-3 text-xs text-muted">No servers found.</p>}
          </>}
          {tab === 'Skills' && <>
            <h2 className="text-sm font-semibold">Installed skills</h2>
            <ul>{current.skills.map(skill => <Row key={skill.path} title={skill.name} detail={skill.description} meta={skill.source}
              actions={<>{edit(skill.id, skill.source === 'user' ? 'Edit SKILL.md' : 'View SKILL.md')}
                {skill.source === 'user' && deletion(skill.id, 'Remove skill ' + skill.name)}
                {skill.source.startsWith('plugin: ') && <Button disabled={busy} onClick={() => selectTab('Plugins')}>Manage plugin</Button>}</>}/>)}</ul>
            {!current.skills.length && <p className="mt-3 text-xs text-muted">No installed skills found.</p>}
          </>}
          {tab === 'Plugins' && <>
            <h2 className="text-sm font-semibold">Installed plugins</h2>
            <ul>{current.plugins.map((plugin, index) => <Row key={plugin.name + ':' + plugin.source + ':' + index} title={plugin.name}
              detail={[plugin.version, plugin.source, plugin.scope].filter(Boolean).join(' · ')}
              meta={plugin.enabled === null ? undefined : plugin.enabled ? 'Enabled' : 'Disabled'}
              actions={deletion(plugin.id, 'Uninstall ' + plugin.name)}/>)}</ul>
            {!current.plugins.length && <p className="mt-3 text-xs text-muted">No installed plugins found.</p>}
          </>}
          {tab === 'Configuration' && <>
            <h2 className="text-sm font-semibold">User configuration</h2>
            <ul>{current.files.map(item => <Row key={item.path} title={item.label} meta={`${formatBytes(item.bytes)} · Updated ${day(item.modified)}`}
              actions={edit(item.id)}/>)}</ul>
            {!current.files.length && <p className="mt-3 text-xs text-muted">No configuration files found.</p>}
          </>}
        </Card>}
      </div>
      {file && <Suspense fallback={<p role="status" className="text-sm text-muted">Loading editor…</p>}>
        <DocumentEditor key={file.id} document={file.document} draft={draft} change={value => { setDraft(value); setEditorError(''); }}
        save={() => void save()} reload={() => void openFile(file.id)}
        close={() => { if (checkDiscard()) setFile(undefined); }} saving={busy} error={editorError}/>
      </Suspense>}
    </div>
  </>;
}
