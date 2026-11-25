import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanClaude } from '../src/providers/inventory/claude.js';
import { scanCodex, scanToml, startedFrom } from '../src/providers/inventory/codex.js';
import { resolveOpenable } from '../src/providers/inventory/index.js';
import { cwdFrom, describeServer, frontmatter } from '../src/providers/inventory/common.js';
import { formatBytes } from '../src/shared/format.js';

const SECRET = 'sk-test-super-secret';

async function workspace(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'inventory-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const put = async (file: string, text: string) => { await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, text); };
const transcript = (cwd: string) => JSON.stringify({ type: 'session_meta', payload: { cwd, note: 'x' } }) + '\n' + 'y'.repeat(500) + '\n';

test('helpers read cwd, front matter and safe MCP targets', () => {
  assert.equal(cwdFrom('{"a":1,"cwd":"C:\\\\Users\\\\me\\\\app"}'), 'C:\\Users\\me\\app');
  assert.equal(cwdFrom('{"nothing":true}'), null);
  assert.deepEqual(frontmatter('---\nname: "demo"\ndescription: Does things\n---\nbody'), { name: 'demo', description: 'Does things' });
  const remote = describeServer('r', { url: 'https://user:' + SECRET + '@host.example/mcp?token=' + SECRET + '#x' }, 'user');
  assert.equal(remote.target, 'https://host.example/mcp');
  assert.ok(!JSON.stringify(remote).includes(SECRET));
  const local = describeServer('l', { command: 'C:\\tools\\runner.exe', args: ['--key', SECRET], env: { KEY: SECRET } }, 'user');
  assert.deepEqual([local.transport, local.target], ['stdio', 'runner.exe']);
  assert.ok(!JSON.stringify(local).includes(SECRET));
  assert.equal(formatBytes(1536), '1.5 KB');
});

test('Claude inventory lists projects, skills, plugins and MCP servers without secrets or credentials', async () => {
  await workspace(async root => {
    const home = join(root, '.claude');
    const state = join(root, '.claude.json');
    const project = join(root, 'work', 'my-app');
    await put(join(home, 'projects', 'enc-my-app', 'a.jsonl'), transcript(project));
    await put(join(home, 'projects', 'enc-my-app', 'b.jsonl'), transcript(project));
    await put(join(home, 'projects', 'enc-my-app', 'b', 'tool-results', 'big.txt'), 'z'.repeat(4000));
    await put(join(home, 'skills', 'mine', 'SKILL.md'), '---\nname: mine\ndescription: My skill\n---\n');
    await put(join(home, 'settings.json'), JSON.stringify({ enabledPlugins: { 'demo@market': false } }));
    const install = join(home, 'plugins', 'cache', 'market', 'demo', '1.2.3');
    await put(join(install, 'skills', 'inside', 'SKILL.md'), '---\ndescription: Plugin skill\n---\n');
    await put(join(install, '.mcp.json'), JSON.stringify({ mcpServers: { plug: { command: 'node', args: [SECRET] } } }));
    await put(join(home, 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'demo@market': [{ installPath: install, version: '1.2.3' }] } }));
    await put(join(home, '.credentials.json'), JSON.stringify({ token: SECRET }));
    await put(state, JSON.stringify({ oauthAccount: { emailAddress: 'someone@example.test' }, mcpServers: { remote: { type: 'http', url: 'http://localhost:3001/mcp', headers: { Authorization: SECRET } } } }));

    const result = await scanClaude({ home, state });
    assert.equal(result.projects.length, 1);
    assert.equal(result.projects[0].name, 'my-app');
    assert.equal(result.projects[0].sessions, 2);
    assert.ok(result.projects[0].bytes > 4000);
    assert.ok(result.projects[0].created && result.projects[0].updated);
    assert.equal(result.sessionCount, 2);
    assert.deepEqual(result.skills.map(skill => [skill.name, skill.source]), [['inside', 'plugin: demo'], ['mine', 'user']]);
    assert.deepEqual(result.plugins.map(plugin => [plugin.name, plugin.version, plugin.enabled]), [['demo', '1.2.3', false]]);
    assert.deepEqual(result.mcpServers.map(server => [server.name, server.target, server.source]).sort(), [['plug', 'node', 'plugin: demo'], ['remote', 'http://localhost:3001/mcp', 'user']]);
    const text = JSON.stringify(result);
    assert.ok(!text.includes(SECRET) && !text.includes('someone@example.test'));
    assert.ok(!result.files.some(file => file.path.endsWith('.credentials.json')));
    assert.ok(result.files.some(file => file.label.startsWith('settings.json')));
  });
});

test('Codex inventory groups sessions by project and reads MCP servers without env values', async () => {
  await workspace(async root => {
    const home = join(root, '.codex');
    const project = join(root, 'repos', 'Shop');
    await put(join(home, 'sessions', '2026', '05', '01', 'rollout-2026-05-01T10-20-30-aaa.jsonl'), transcript(project));
    await put(join(home, 'sessions', '2026', '05', '02', 'rollout-2026-05-02T08-00-00-bbb.jsonl'), transcript(project));
    await put(join(home, 'archived_sessions', 'rollout-2026-04-01T09-00-00-ccc.jsonl'), transcript(project));
    await put(join(home, 'sessions', '2026', '05', '03', 'rollout-2026-05-03T08-00-00-ddd.jsonl'), 'no cwd here\n');
    await put(join(home, 'skills', 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: First\n---\n');
    await put(join(home, 'skills', '.system', 'sys', 'SKILL.md'), '---\nname: sys\ndescription: Built in\n---\n');
    await put(join(home, 'auth.json'), JSON.stringify({ token: SECRET }));
    await put(join(home, 'AGENTS.md'), '# hi');
    await put(join(home, 'config.toml'), [
      'model = "gpt"', '', '[mcp_servers.local]', 'command = "C:\\\\bin\\\\server.exe"', 'args = [', '  "--token", "' + SECRET + '"', ']',
      '[mcp_servers.local.env]', 'API_KEY = "' + SECRET + '"', '', '[mcp_servers.remote]', "url = 'https://api.example.test/mcp?key=" + SECRET + "'", 'enabled = false',
      '', '[plugins."demo@market"]', 'enabled = true', '', '[projects.\'c:\\x\']', 'trust_level = "trusted"'
    ].join('\n'));

    const result = await scanCodex({ home });
    assert.equal(result.sessionCount, 4);
    const shop = result.projects.find(item => item.name === 'Shop');
    assert.deepEqual([shop?.sessions, shop?.archived], [3, 1]);
    assert.equal(new Date(shop?.created ?? '').getTime(), new Date(2026, 3, 1, 9, 0, 0).getTime());
    assert.ok(result.projects.some(item => item.name === 'Unknown project'));
    assert.deepEqual(result.skills.map(skill => [skill.name, skill.source]), [['alpha', 'user'], ['sys', 'system']]);
    assert.deepEqual(result.plugins.map(plugin => [plugin.name, plugin.source, plugin.enabled]), [['demo', 'market', true]]);
    assert.deepEqual(result.mcpServers.map(server => [server.name, server.target, server.enabled]), [['local', 'server.exe', null], ['remote', 'https://api.example.test/mcp', false]]);
    assert.ok(!JSON.stringify(result).includes(SECRET));
    assert.deepEqual(result.files.map(file => file.label.split(' ')[0]).sort(), ['AGENTS.md', 'config.toml']);
  });
});

test('TOML scanner keeps tables with quoted names and ignores arrays', () => {
  const tables = scanToml('[a."b.c@d"]\nx = "1"\nlist = ["no"]\nflag = true # note\n[e]\n');
  assert.deepEqual(tables[1].path, ['a', 'b.c@d']);
  assert.deepEqual(tables[1].values, { x: '1', flag: true });
  assert.equal(startedFrom('rollout-2026-01-02T03-04-05-x.jsonl'), new Date(2026, 0, 2, 3, 4, 5).getTime());
  assert.equal(startedFrom('other.jsonl'), null);
});

test('open requests are limited to provider folders and plain config files', async () => {
  await workspace(async root => {
    const home = join(root, 'home');
    const outside = join(root, 'outside.json');
    await put(join(home, 'settings.json'), '{}');
    await put(join(home, 'auth.json'), '{}');
    await put(join(home, 'tool.exe'), 'x');
    await put(outside, '{}');
    const roots = [home];
    assert.equal(await resolveOpenable(home, roots), await realpath(home));
    await resolveOpenable(join(home, 'settings.json'), roots);
    await assert.rejects(resolveOpenable(outside, roots), /outside/);
    await assert.rejects(resolveOpenable(join(home, 'auth.json'), roots), /Credential/);
    await assert.rejects(resolveOpenable(join(home, 'tool.exe'), roots), /JSON, TOML/);
    await assert.rejects(resolveOpenable('settings.json', roots), /Invalid/);
    await assert.rejects(resolveOpenable(join(home, '..', 'outside.json'), roots), /outside/);
    await assert.rejects(resolveOpenable(join(home, 'missing.json'), roots), /no longer exists/);
  });
});
