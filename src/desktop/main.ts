import { app, BrowserWindow, Tray, Menu, ipcMain, utilityProcess, powerMonitor, shell, dialog, Notification } from 'electron';
import type { IpcMainInvokeEvent, UtilityProcess } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { nextRenewal } from '../shared/renewal.js';
import { openStore } from './storage.js';
import { normalize, defaults } from '../shared/preferences.js';
import { providerIds as ids, type MonitorState, type ProviderId, type StatusLine, type WorkerEvent, type WorkerRequest } from '../shared/contracts.js';
import { asRecord } from '../shared/validation.js';
import { ensureStatusLine, buildCommand, settingsFile } from '../providers/claude/setup.js';
import { smoke } from './smoke.js';

const page = path.join(import.meta.dirname, '../../dist/index.html');
const asset = (name: string) => path.join(import.meta.dirname, '../../assets', name);
const appId = 'local.aiusagemonitor.app';
app.setAppUserModelId(appId);
app.setName('AI Usage Monitor');
const smokeDirectory = process.argv.includes('--monitor-smoke')
  ? path.join(app.getPath('temp'), 'ai-usage-monitor-smoke-' + process.pid) : null;
if (smokeDirectory) app.setPath('userData', smokeDirectory);
let window: BrowserWindow | null = null;
let tray: Tray | undefined;
let worker: UtilityProcess | null = null;
let store: ReturnType<typeof openStore> | null = null;
let root: string;
let closing = false;
let attempts = 0;
let settings = defaults();
const status: MonitorState['status'] = { codex: { state: 'starting' }, claude: { state: 'starting' } };
const cached: MonitorState['cached'] = {};
let storageError = '';
let statusLine: StatusLine = 'pending';
const state = (): MonitorState => ({
  settings, status, cached, storageError, statusLine,
  worker: Boolean(worker), version: app.getVersion()
});
const emit = () => {
  if (window && !window.isDestroyed()) window.webContents.send('update', state());
};
function log(event: string, provider: ProviderId | null = null, result: string | null = null) {
  try {
    const dir = path.join(root, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'monitor.jsonl');
    if (fs.existsSync(file) && fs.statSync(file).size > 512000) {
      fs.rmSync(file + '.1', { force: true });
      fs.renameSync(file, file + '.1');
    }
    fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), event, provider, result }) + '\n');
  } catch {}
}
function setupStatusLine() {
  if (smokeDirectory || settings.disabled.claude) return;
  let hasNode = false;
  try {
    const where = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe');
    hasNode = Boolean(execFileSync(where, ['$PATH:node.exe'], { windowsHide: true, timeout: 5000, encoding: 'utf8' }).trim());
  } catch {}
  statusLine = ensureStatusLine({
    file: settingsFile(), hasNode,
    command: buildCommand(path.join(import.meta.dirname, '../providers/claude/statusline.cjs'), path.join(root, 'claude-usage.json'))
  });
  log('claude.statusline', 'claude', statusLine);
}
function show() {
  const current = !window || window.isDestroyed() ? createWindow() : window;
  if (current.isMinimized()) current.restore();
  current.show();
  current.focus();
}
function createWindow() {
  const current = window = new BrowserWindow({
    show: false, width: 390, height: 680, resizable: false, maximizable: false,
    fullscreenable: false, autoHideMenuBar: true, backgroundColor: '#080d13',
    icon: asset('icon.ico'), webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'), contextIsolation: true,
      nodeIntegration: false, sandbox: true
    }
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
  window.on('close', event => {
    if (closing) return;
    if (settings.closeToTray) { event.preventDefault(); current.hide(); }
    else app.quit();
  });
  window.on('closed', () => { window = null; });
  void current.loadFile(page).catch(() => log('window.load.failed'));
  return current;
}
function send(message: WorkerRequest) { worker?.postMessage(message); }
function refresh() { send({ type: 'refresh' }); }
function menu() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: 'AI Usage Monitor', enabled: false }, { type: 'separator' },
    { label: 'Open Dashboard', click: show }, { label: 'Refresh Now', click: refresh },
    { type: 'separator' },
    { label: settings.paused ? 'Resume Monitoring' : 'Pause Monitoring', click: () => updateSettings({ ...settings, paused: !settings.paused }) },
    { label: 'Settings', click: () => { show(); window?.webContents.send('navigate', 'settings'); } },
    { type: 'separator' }, { label: 'Quit', click: () => app.quit() }
  ]));
}
function checkRenewals() {
  if (!settings.notifications || !store || !Notification.isSupported()) return;
  const now = new Date();
  const today = new Date(+now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  for (const id of ids) {
    const sub = settings.subscriptions[id];
    if (!sub.reminder || nextRenewal(sub.anchor, sub.cycle, today) !== today) continue;
    try {
      if (store.read('reminder-' + id) === today) continue;
      new Notification({
        title: 'Expected subscription renewal',
        body: (sub.plan || (id === 'codex' ? 'OpenAI Codex' : 'Claude Code')) + ' is scheduled to renew today.',
        icon: asset('icon.png')
      }).show();
      store.write('reminder-' + id, today);
    } catch { log('notification.failed', id); }
  }
}
function updateSettings(value: unknown) {
  const next = normalize(value);
  if (next.startup !== settings.startup && process.platform === 'win32') {
    try {
      app.setLoginItemSettings({ openAtLogin: next.startup, args: ['--startup'] });
      if (app.getLoginItemSettings({ args: ['--startup'] }).openAtLogin !== next.startup) throw Error();
    } catch { throw Error('Windows did not save the startup setting.'); }
  }
  try { store?.write('settings', next); }
  catch { throw Error('Local settings could not be saved.'); }
  const changed = ids.filter(id => next.disabled[id] !== settings.disabled[id]);
  settings = next;
  if (changed.includes('claude') && !next.disabled.claude) setupStatusLine();
  checkRenewals();
  send({ type: 'settings', settings });
  for (const id of changed) send({ type: 'refresh', id });
  menu();
  emit();
}
function startWorker() {
  if (closing) return;
  const child = utilityProcess.fork(path.join(import.meta.dirname, '../worker/main.js'), [root, app.getVersion()], { stdio: 'ignore', serviceName: 'AI Usage Monitor' });
  worker = child;
  child.on('spawn', () => { log('worker.start'); emit(); });
  child.on('message', (message: WorkerEvent) => {
    const { id, value } = message;
    if (!ids.includes(id)) return;
    if (message.type === 'status') {
      attempts = 0;
      status[id] = value;
      log('provider.status', id, value.state);
      if (value.state === 'ready' && cached[id]?.collectedAt !== value.collectedAt) {
        cached[id] = value;
        try { store?.snapshot(id, value); }
        catch { storageError = 'Usage history could not be saved.'; }
      }
    }
    emit();
  });
  child.on('exit', () => {
    worker = null;
    log('worker.exit');
    if (closing) return;
    for (const id of ids) status[id] = { state: 'error', message: 'The monitor stopped. Restarting in the background.' };
    emit();
    setTimeout(startWorker, Math.min(60000, 2000 * 2 ** Math.min(attempts++, 5))).unref();
  });
  send({ type: 'settings', settings, initial: true });
}
function guard<Args extends unknown[], Result>(handler: (...args: Args) => Result) {
  return (event: IpcMainInvokeEvent, ...args: Args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || event.senderFrame?.url !== pathToFileURL(page).href) throw Error('Invalid application request.');
    return handler(...args);
  };
}
ipcMain.handle('state', guard(state));
ipcMain.handle('settings', guard(updateSettings));
ipcMain.handle('refresh', guard(refresh));
ipcMain.handle('logs', guard(async () => {
  const directory = path.join(root, 'logs');
  fs.mkdirSync(directory, { recursive: true });
  if (await shell.openPath(directory)) throw Error('Windows could not open the log folder.');
}));
ipcMain.handle('reset', guard(async () => {
  const { response } = await dialog.showMessageBox({
    message: 'Reset local preferences?', detail: 'This resets subscription dates and monitoring preferences. Accounts and usage history are kept.',
    buttons: ['Cancel', 'Reset preferences'], defaultId: 0, cancelId: 0, type: 'question'
  });
  if (response === 1) updateSettings(defaults());
}));
ipcMain.handle('quit', guard(() => app.quit()));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (app.isReady()) show(); });
  app.on('window-all-closed', () => { if (!settings.closeToTray) app.quit(); });
  app.on('before-quit', () => {
    closing = true;
    worker?.kill();
    store?.close();
    store = null;
  });
  app.whenReady().then(() => {
    root = app.getPath('userData');
    try {
      store = openStore(path.join(root, 'database'));
      settings = normalize({ ...defaults(), ...asRecord(store.read('settings')) });
      for (const id of ids) cached[id] = store.latest(id);
    } catch { storageError = 'The local database is unavailable. Changes may not survive a restart.'; }
    log('app.start');
    setupStatusLine();
    const current = createWindow();
    tray = new Tray(asset('tray-icon.png'));
    tray.setToolTip('AI Usage Monitor');
    tray.on('double-click', show);
    menu();
    if (!settings.startMinimized || !process.argv.includes('--startup')) current.once('ready-to-show', show);
    powerMonitor.on('resume', () => { send({ type: 'resume' }); checkRenewals(); });
    setInterval(checkRenewals, 60000).unref();
    checkRenewals();
    startWorker();
    if (smokeDirectory) void smoke({
      window: current, show, getState: state, directory: smokeDirectory
    }).then(() => app.quit(), () => app.exit(1));
  });
}
