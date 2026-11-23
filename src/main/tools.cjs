const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { stat } = require('node:fs/promises');
const path = require('node:path').win32;
const os = require('node:os');
const run = promisify(execFile);
const names = { codex: '@openai/codex', claude: '@anthropic-ai/claude-code' };

function parseWhere(output, name, extension) {
  return [...new Set(output.split(/\r?\n/).map(line => line.trim()).filter(line =>
    /^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+\\)/.test(line) &&
    path.basename(line).toLowerCase() === name + extension))];
}

function createTool(root, id, execute = run, fileStat = stat) {
  if (!Object.hasOwn(names, id)) throw Error('Unknown CLI');
  const where = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe');
  const options = { windowsHide: true, cwd: root, timeout: 15000, maxBuffer: 1024 * 1024 };
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(OPENAI_API_KEY|CODEX_API_KEY|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|NODE_OPTIONS|ELECTRON_RUN_AS_NODE)$/i.test(key)));
  env.DISABLE_AUTOUPDATER = '1';
  async function locate(name, extension) {
    try {
      const { stdout } = await execute(where, ['$PATH:' + name + extension], options);
      return parseWhere(stdout, name, extension);
    } catch (error) {
      if (error.code === 1) return [];
      throw error;
    }
  }
  async function exists(file) {
    try { return (await fileStat(file)).isFile(); }
    catch { return false; }
  }
  function invoke(info, args) {
    return execute(info.executable, [...info.prefix, ...args], { ...options, env });
  }
  async function installed() {
    const candidates = (await locate(id, '.exe')).map(executable => ({ executable, prefix: [], location: executable }));
    if (!candidates.length) {
      for (const shim of await locate(id, '.cmd')) {
        const directory = path.dirname(shim);
        const packageFolder = path.join(directory, 'node_modules', names[id]);
        const entry = path.join(packageFolder, 'bin', id === 'codex' ? 'codex.js' : 'claude.exe');
        if (!await exists(entry)) continue;
        if (id === 'claude') candidates.push({ executable: entry, prefix: [], location: shim });
        else {
          const adjacent = path.join(directory, 'node.exe');
          const executable = await exists(adjacent) ? adjacent : (await locate('node', '.exe'))[0];
          if (executable) candidates.push({ executable, prefix: [entry], location: shim });
        }
      }
    }
    if (!candidates.length) return null;
    for (const candidate of candidates) {
      try {
        const { stdout } = await invoke(candidate, ['--version']);
        const version = stdout.match(/\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?\b/)?.[0];
        if (version) return { ...candidate, version };
      } catch {}
    }
    throw Error('The CLI was found on PATH but did not report its version.');
  }
  return {
    installed, invoke, start: (info, args) => spawn(info.executable, [...info.prefix, ...args],
      { cwd: root, env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  };
}
module.exports = { createTool, parseWhere };
