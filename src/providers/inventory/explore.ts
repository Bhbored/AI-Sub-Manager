import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { rm } from 'node:fs/promises';
import type { ExploreRemoval, Inventory, InventoryPlugin, InventoryProject, ProviderId } from '../../shared/contracts.js';
import { providerIds } from '../../shared/contracts.js';
import { createPlatformTool } from '../cli.js';
import { scanInventory } from './index.js';
import { claudeLocations } from './claude.js';
import { codexLocations } from './codex.js';
import { skillsIn, treeStats } from './common.js';
import { readDocument, saveDocument, verifyLocalPath, type DocumentTarget } from './documents.js';
import { verifiedHistory, verifyDeleteTree, withHistoryClient } from './history.js';
import { asRecord } from '../../shared/validation.js';
import { formatBytes } from '../../shared/format.js';

type Target = { document?: DocumentTarget; skillRoot?: string; project?: InventoryProject; plugin?: InventoryPlugin };
type Confirm = (title: string, detail: string) => Promise<boolean>;

const format = (path: string) => extname(path) === '.json' ? 'json' : extname(path) === '.toml' ? 'toml' : 'markdown';
const idFor = (key: string) => createHash('sha256').update(key).digest('hex');
const isSelector = (value: unknown): value is string => typeof value === 'string' && /^[\w][\w.-]*@[\w][\w.-]*$/.test(value);

export class ExploreService {
  private readonly items = new Map<ProviderId, Map<string, Target>>();
  private readonly busy = new Set<ProviderId>();

  constructor(
    private readonly workDir: string,
    private readonly version: string,
    private readonly trash: (path: string) => Promise<void>,
    private readonly createTool = createPlatformTool
  ) {}

  async inventory(provider: ProviderId, refreshPlugins = false): Promise<Inventory> {
    const result = await scanInventory(provider);
    const home = result.home;
    const targets = new Map<string, Target>();
    const register = (key: string, target: Target) => {
      const id = idFor(provider + ':' + key);
      targets.set(id, target);
      return id;
    };
    const codexUserSkills = join(homedir(), '.agents', 'skills');
    if (provider === 'codex') {
      const personal = await skillsIn(codexUserSkills, 'user');
      const existing = new Set(result.skills.map(skill => skill.path));
      result.skills.push(...personal.filter(skill => !existing.has(skill.path)));
      result.skills.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (refreshPlugins) {
      try {
        const tool = this.createTool(this.workDir, provider);
        const info = await tool.installed();
        if (!info) throw Error('Missing CLI');
        const { stdout } = await tool.invoke(info, ['plugin', 'list', '--json']);
        const parsed: unknown = JSON.parse(stdout);
        const entries = Array.isArray(parsed) ? parsed : asRecord(parsed).installed ?? asRecord(parsed).plugins;
        if (!Array.isArray(entries)) throw Error('Unsupported plugin output');
        result.plugins = entries.flatMap(value => {
          const entry = asRecord(value);
          const selector = entry.id ?? entry.pluginId ?? entry.key;
          if (!isSelector(selector)) return [];
          const [name, source] = selector.split('@');
          const scope = typeof entry.scope === 'string' ? entry.scope : provider === 'codex' ? 'user' : 'unknown';
          return [{ name, source, selector, scope,
            version: typeof entry.version === 'string' ? entry.version : null,
            enabled: typeof entry.enabled === 'boolean' ? entry.enabled : null }];
        });
      } catch { result.warnings.push('Plugin inventory could not be verified through the provider CLI.'); }
    }
    if (provider === 'codex') {
      for (const plugin of result.plugins) {
        if (!/^[\w][\w.-]*$/.test(plugin.name) || !/^[\w][\w.-]*$/.test(plugin.source) ||
            !plugin.version || !/^[\w][\w.+-]*$/.test(plugin.version)) continue;
        result.skills.push(...await skillsIn(join(home, 'plugins', 'cache', plugin.source, plugin.name, plugin.version, 'skills'), 'plugin: ' + plugin.name));
      }
    }
    result.projects = result.projects.map(project => ({
      ...project, id: provider === 'claude' || project.path ? register('project:' + (provider === 'claude' ? project.folder : project.path), { project }) : undefined
    }));
    result.files = result.files.filter(file => basename(file.path).toLowerCase() !== '.claude.json').map(file => ({
      ...file,
      id: register('file:' + file.path, { document: { file: file.path, root: home, label: file.label, language: format(file.path), writable: true } })
    }));
    result.skills = result.skills.map(skill => {
      const parent = dirname(skill.path);
      const writable = skill.source === 'user' && (parent === join(home, 'skills') || (provider === 'codex' && parent === codexUserSkills));
      const root = parent === codexUserSkills ? homedir() : home;
      return { ...skill, id: register('skill:' + skill.path, {
        document: { file: join(skill.path, 'SKILL.md'), root, label: skill.name + ' / SKILL.md', language: 'markdown', writable },
        skillRoot: writable ? parent : undefined
      }) };
    });
    result.plugins = result.plugins.map(plugin => ({
      ...plugin, id: isSelector(plugin.selector) && plugin.scope === 'user'
        ? register('plugin:' + plugin.selector, { plugin }) : undefined
    }));
    const mcp = provider === 'claude' ? claudeLocations().state : join(codexLocations().home, 'config.toml');
    targets.set('global-mcp', { document: {
      file: mcp, root: dirname(mcp), label: provider === 'claude' ? 'User MCP servers' : 'config.toml · MCP servers',
      language: format(mcp), writable: true, mcp: provider
    } });
    this.items.set(provider, targets);
    return result;
  }

  private target(provider: unknown, id: unknown) {
    if (typeof id !== 'string' || !providerIds.some(value => value === provider)) throw Error('Invalid Explore item.');
    const target = this.items.get(provider as ProviderId)?.get(id);
    if (!target) throw Error('This item is no longer listed. Refresh Explore.');
    return target;
  }

  async read(provider: unknown, id: unknown) {
    const { document } = this.target(provider, id);
    if (!document) throw Error('This item is not an editable document.');
    return readDocument(document);
  }

  async save(provider: unknown, id: unknown, revision: unknown, text: unknown) {
    const { document } = this.target(provider, id);
    if (!document) throw Error('This item is not an editable document.');
    return this.runExclusive(provider as ProviderId, () => saveDocument(document, revision, text));
  }

  async remove(provider: unknown, id: unknown, confirm: Confirm): Promise<ExploreRemoval | null> {
    const target = this.target(provider, id);
    const kind = provider as ProviderId;
    return this.runExclusive(kind, async () => {
      let message: string;
      if (target.project && kind === 'claude') {
        const { home } = claudeLocations();
        const directory = target.project.folder;
        if (dirname(directory) !== join(home, 'projects')) throw Error('Invalid Claude history folder.');
        const safe = await verifyLocalPath(home, directory, 'directory');
        const preview = await treeStats(safe);
        if (preview.truncated) throw Error('The history folder is too large to verify.');
        if (!await confirm('Delete Claude history for ' + target.project.name + '?',
          formatBytes(preview.bytes) + ' of local history will be removed permanently. Project files and Claude settings are kept.')) return null;
        const current = await verifyLocalPath(home, directory, 'directory');
        const latest = await treeStats(current);
        if (safe !== current || latest.truncated || preview.bytes !== latest.bytes || preview.newest !== latest.newest || preview.files !== latest.files) {
          throw Error('The history changed. Close active sessions and refresh before deleting.');
        }
        await rm(current, { recursive: true });
        message = 'Claude history deleted.';
      } else if (target.project?.path && kind === 'codex') {
        const project = target.project;
        const cwd = project.path;
        if (!cwd) throw Error('This project has no verified working directory.');
        const tool = this.createTool(this.workDir, kind);
        const info = await tool.installed();
        if (!info) throw Error('Install the Codex CLI to delete project history.');
        const prepare = () => withHistoryClient(tool, info, this.version, client => verifiedHistory(client, cwd, project.sessions));
        const before = await prepare();
        const sessions = before.ids.length === 1 ? '1 local session' : `${before.ids.length} local sessions`;
        if (!await confirm('Delete Codex history for ' + project.name + '?',
          sessions + ' will be permanently deleted. Explore tracks ' + formatBytes(project.bytes) + ' of rollout files. Project files are kept.')) return null;
        message = await withHistoryClient(tool, info, this.version, async client => {
          const latest = await verifiedHistory(client, cwd, project.sessions);
          if (JSON.stringify(latest.ids) !== JSON.stringify(before.ids)) throw Error('The history changed. Refresh before deleting.');
          const approved = new Set(before.ids);
          let failed = 0;
          for (const threadId of latest.roots) {
            try {
              await verifyDeleteTree(client, cwd, threadId, approved);
              await client.request('thread/delete', { threadId });
            } catch { failed++; }
          }
          return failed ? 'Some Codex history could not be deleted. Review the refreshed project list.' : 'Codex history deleted.';
        });
      } else if (target.document && target.skillRoot) {
        const directory = dirname(target.document.file);
        if (dirname(directory) !== target.skillRoot) throw Error('Invalid personal skill location.');
        const safe = await verifyLocalPath(target.document.root, directory, 'directory');
        await verifyLocalPath(target.document.root, target.document.file, 'file');
        if (!await confirm('Remove ' + target.document.label.split(' / ')[0] + '?', 'The personal skill folder will move to the system trash.')) return null;
        if (safe !== await verifyLocalPath(target.document.root, directory, 'directory')) throw Error('The skill location changed.');
        await this.trash(safe);
        message = 'Skill moved to trash.';
      } else if (target.plugin?.scope === 'user' && isSelector(target.plugin.selector)) {
        const selector = target.plugin.selector;
        const tool = this.createTool(this.workDir, kind);
        const info = await tool.installed();
        if (!info) throw Error('Install the provider CLI to uninstall plugins.');
        const args = kind === 'claude' ? ['plugin', 'uninstall', '--scope', 'user'] : ['plugin', 'remove'];
        try { await tool.invoke(info, [...args, '--help']); }
        catch { throw Error('Update the provider CLI to uninstall plugins.'); }
        if (!await confirm('Uninstall ' + selector + '?', kind === 'claude'
          ? 'This removes the user installation. Claude also removes persistent data if this is the last installation.'
          : 'Codex will uninstall the plugin and remove its local cache.')) return null;
        try { await tool.invoke(info, [...args, selector]); }
        catch { throw Error('The provider could not uninstall this plugin. Refresh Explore and check the provider CLI.'); }
        message = 'Plugin uninstalled.';
      } else {
        throw Error('This item cannot be removed in Explore.');
      }
      return { message, inventory: await this.inventory(kind, Boolean(target.plugin)) };
    });
  }

  private async runExclusive<T>(provider: ProviderId, run: () => Promise<T>) {
    if (this.busy.has(provider)) throw Error('Another Explore change is still in progress.');
    this.busy.add(provider);
    try { return await run(); }
    finally { this.busy.delete(provider); }
  }
}
