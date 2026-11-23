import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Freedesktop Exec values are shell-like: quote the program and escape characters that stay special inside quotes. */
const quote = (value: string) => '"' + value.replace(/[\\"`$]/g, match => '\\' + match) + '"';

export function autostartFile(env: NodeJS.ProcessEnv = process.env, home = os.homedir()) {
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'autostart', 'ai-usage-monitor.desktop');
}

/** Adds or removes the XDG autostart entry used by Debian, Ubuntu and most other Linux desktops. */
export function setAutostart(enabled: boolean, executable: string, file = autostartFile()) {
  if (!enabled) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    '[Desktop Entry]', 'Type=Application', 'Name=AI Usage Monitor',
    'Comment=Local AI subscription usage monitor',
    'Exec=' + quote(executable) + ' --startup',
    'Icon=ai-usage-monitor', 'Terminal=false', 'X-GNOME-Autostart-enabled=true', ''
  ].join('\n'));
}

export function isAutostartEnabled(file = autostartFile()) {
  return fs.existsSync(file);
}
