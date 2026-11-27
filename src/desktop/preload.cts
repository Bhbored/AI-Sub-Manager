import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { MonitorApi } from '../shared/contracts.js';

function subscribe<Value>(channel: string, callback: (value: Value) => void) {
  const handler = (_: IpcRendererEvent, value: Value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
const monitor: MonitorApi = {
  state: () => ipcRenderer.invoke('state'),
  refresh: () => ipcRenderer.invoke('refresh'),
  settings: value => ipcRenderer.invoke('settings', value),
  onUpdate: callback => subscribe('update', callback),
  onNavigate: callback => subscribe('navigate', callback),
  setWindowMode: mode => ipcRenderer.invoke('window:mode', mode),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  inventory: (id, includePlugins) => ipcRenderer.invoke('inventory', id, includePlugins),
  readExploreDocument: (provider, id) => ipcRenderer.invoke('explore:read', provider, id),
  saveExploreDocument: (provider, id, revision, text) => ipcRenderer.invoke('explore:save', provider, id, revision, text),
  removeExploreItem: (provider, id) => ipcRenderer.invoke('explore:remove', provider, id),
  onExploreConfirmation: callback => subscribe('explore:confirmation', callback),
  answerExploreConfirmation: (id, confirmed) => ipcRenderer.invoke('explore:answer', id, confirmed),
  open: path => ipcRenderer.invoke('open', path),
  logs: () => ipcRenderer.invoke('logs'),
  reset: () => ipcRenderer.invoke('reset'),
  quit: () => ipcRenderer.invoke('quit')
};
contextBridge.exposeInMainWorld('monitor', monitor);
