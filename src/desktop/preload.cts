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
  logs: () => ipcRenderer.invoke('logs'),
  reset: () => ipcRenderer.invoke('reset'),
  quit: () => ipcRenderer.invoke('quit')
};
contextBridge.exposeInMainWorld('monitor', monitor);
