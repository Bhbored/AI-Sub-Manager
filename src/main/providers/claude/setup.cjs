// Registers the usage collector as Claude Code's statusLine command, without clobbering a user's own.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const marker = 'statusline.cjs';
const quote = value => '"' + value.replace(/\\/g, '/') + '"';

function settingsFile(env = process.env, home = os.homedir()) {
  return path.join(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'settings.json');
}

function buildCommand(script, usageFile) {
  return 'node ' + quote(script.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)) + ' ' + quote(usageFile);
}

/** Returns 'ok' | 'set' | 'updated' | 'foreign' | 'no-node' | 'error'. Only writes when the status line is absent or already ours. */
function ensureStatusLine({ file, command, hasNode = true, fsApi = fs }) {
  try {
    let settings = {};
    let exists = true;
    try { settings = JSON.parse(fsApi.readFileSync(file, 'utf8').replace(/^﻿/, '')); }
    catch (error) {
      if (error.code !== 'ENOENT') return 'error';
      exists = false;
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return 'error';
    const current = settings.statusLine;
    if (current !== undefined) {
      const ours = current && typeof current === 'object' && current.type === 'command'
        && typeof current.command === 'string' && current.command.includes(marker);
      if (!ours) return 'foreign';
      if (current.command === command) return 'ok';
    }
    if (!hasNode) return 'no-node';
    settings.statusLine = { ...(current && typeof current === 'object' ? current : {}), type: 'command', command };
    fsApi.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.' + process.pid + '.tmp';
    fsApi.writeFileSync(temporary, JSON.stringify(settings, null, 2) + '\n');
    fsApi.renameSync(temporary, file);
    return current === undefined ? 'set' : 'updated';
  } catch { return 'error'; }
}

module.exports = { ensureStatusLine, buildCommand, settingsFile };
