import { useEffect, useState, type ReactNode } from 'react';
import { FolderOpen, RefreshCw } from 'lucide-react';
import { providerIds, providerNames, type Inventory, type InventoryProject, type ProviderId } from '../../shared/contracts.js';
import { formatBytes } from '../../shared/format.js';
import { Button, Card, IconButton } from '../components/controls.js';

const day = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const heading = 'text-[11px] font-semibold uppercase tracking-wider text-muted';

type Sort = 'recent' | 'size' | 'sessions';
const sorters: Record<Sort, (a: InventoryProject, b: InventoryProject) => number> = {
  recent: (a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''),
  size: (a, b) => b.bytes - a.bytes,
  sessions: (a, b) => b.sessions - a.sessions
};

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return <Card className="space-y-2">
    <h2 className={heading}>{title} · {count}</h2>
    {count ? children : <p className="text-xs text-muted">Nothing found.</p>}
  </Card>;
}

function Row({ title, detail, meta, action }: { title: ReactNode; detail?: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return <div className="flex items-start justify-between gap-3 border-t border-edge pt-2 first:border-t-0 first:pt-0">
    <div className="min-w-0">
      <p className="truncate text-xs font-medium">{title}</p>
      {detail && <p className="line-clamp-2 break-words text-[11px] text-muted">{detail}</p>}
      {meta && <p className="text-[11px] text-muted">{meta}</p>}
    </div>
    {action}
  </div>;
}

export function Explore({ onOpen, onError }: { onOpen(path: string): void; onError(failure: unknown): void }) {
  const [provider, setProvider] = useState<ProviderId>('claude');
  const [data, setData] = useState<Inventory>();
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>('recent');
  const [all, setAll] = useState(false);
  const [scan, setScan] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    window.monitor.inventory(provider).then(value => { if (active) setData(value); }, onError)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [provider, scan]);

  const current = data?.provider === provider ? data : undefined;
  const projects = current ? [...current.projects].sort(sorters[sort]) : [];
  const shown = all ? projects : projects.slice(0, 8);
  const folder = (path: string, label: string) => <IconButton aria-label={label} title={label} onClick={() => onOpen(path)}><FolderOpen size={16}/></IconButton>;

  return <>
    <h1 className="mb-4 text-[25px] font-semibold tracking-tight">Explore</h1>
    <div className="flex items-center gap-2" role="tablist" aria-label="Provider">
      {providerIds.map(id => <Button key={id} role="tab" aria-selected={provider === id} className={provider === id ? 'border-accent text-accent' : ''}
        onClick={() => { setProvider(id); setAll(false); }}>{providerNames[id]}</Button>)}
      <IconButton aria-label="Rescan" title="Rescan" disabled={loading} className="ml-auto" onClick={() => setScan(value => value + 1)}>
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>
      </IconButton>
    </div>
    {!current ? <p className="mt-4 text-xs text-muted">{loading ? 'Scanning…' : 'Nothing to show.'}</p> : <>
      <Card className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{current.sessionCount} sessions · {formatBytes(current.sessionBytes)}</p>
          <p className="truncate text-[11px] text-muted" title={current.home}>{current.home}</p>
        </div>
        {folder(current.home, 'Open ' + providerNames[provider] + ' folder')}
      </Card>
      {current.warnings.map(warning => <p key={warning} className="text-xs text-warning">{warning}</p>)}

      <Section title="Projects" count={projects.length}>
        <label className="flex items-center gap-2 text-[11px] text-muted">Sort by
          <select value={sort} onChange={event => setSort(event.target.value as Sort)} className="rounded-md border border-edge bg-field px-2 py-1 text-xs text-foreground">
            <option value="recent">Last active</option><option value="size">Size</option><option value="sessions">Sessions</option>
          </select>
        </label>
        {shown.map(project => <Row key={project.folder + project.path} title={project.name}
          detail={project.path ?? project.folder}
          meta={project.sessions + ' sessions' + (project.archived ? ' (' + project.archived + ' archived)' : '') + ' · ' + formatBytes(project.bytes) + ' · created ' + day(project.created) + ' · active ' + day(project.updated)}
          action={folder(project.folder, 'Open sessions folder for ' + project.name)}/>)}
        {projects.length > 8 && <Button onClick={() => setAll(value => !value)}>{all ? 'Show fewer' : 'Show all ' + projects.length}</Button>}
      </Section>

      <Section title="MCP servers" count={current.mcpServers.length}>
        {current.mcpServers.map((server, index) => <Row key={server.name + server.source + index} title={server.name}
          detail={server.transport + (server.target ? ' · ' + server.target : '')}
          meta={server.source + (server.enabled === false ? ' · disabled' : '')}/>)}
      </Section>

      <Section title="Skills" count={current.skills.length}>
        {current.skills.map(skill => <Row key={skill.path} title={skill.name} detail={skill.description} meta={skill.source}
          action={folder(skill.path, 'Open skill folder ' + skill.name)}/>)}
      </Section>

      <Section title="Plugins" count={current.plugins.length}>
        {current.plugins.map(plugin => <Row key={plugin.name + plugin.source} title={plugin.name + (plugin.version ? ' ' + plugin.version : '')}
          meta={plugin.source + (plugin.enabled === null ? '' : plugin.enabled ? ' · enabled' : ' · disabled')}/>)}
      </Section>

      <Section title="Configuration" count={current.files.length}>
        {current.files.map(file => <Row key={file.path} title={file.label} meta={formatBytes(file.bytes) + ' · edited ' + day(file.modified)}
          action={<Button onClick={() => onOpen(file.path)}>Open</Button>}/>)}
      </Section>
    </>}
  </>;
}
