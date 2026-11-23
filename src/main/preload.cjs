const { contextBridge, ipcRenderer } = require('electron');
function subscribe(channel, callback) {
  const handler = (_, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
contextBridge.exposeInMainWorld('monitor', {
  state: () => ipcRenderer.invoke('state'),
  refresh: () => ipcRenderer.invoke('refresh'),
  settings: value => ipcRenderer.invoke('settings', value),
  onUpdate: callback => subscribe('update', callback),
  onNavigate: callback => subscribe('navigate', callback),
  logs: () => ipcRenderer.invoke('logs'),
  reset: () => ipcRenderer.invoke('reset'),
  quit: () => ipcRenderer.invoke('quit')
});

