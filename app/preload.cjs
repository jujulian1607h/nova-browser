const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nova', {
  newTab: (url, privateMode) => ipcRenderer.invoke('tabs:new', url, privateMode),
  activateTab: (id) => ipcRenderer.invoke('tabs:activate', id),
  closeTab: (id) => ipcRenderer.invoke('tabs:close', id),
  navigate: (url) => ipcRenderer.invoke('browser:navigate', url),
  back: () => ipcRenderer.invoke('browser:back'),
  forward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  home: () => ipcRenderer.invoke('browser:home'),
  external: (url) => ipcRenderer.invoke('browser:external', url),
  bookmark: () => ipcRenderer.invoke('browser:bookmark'),
  openHistory: () => ipcRenderer.invoke('history:open'),
  closeHistory: () => ipcRenderer.invoke('history:close'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  onTabsState: (callback) => ipcRenderer.on('tabs:state', (_event, state) => callback(state)),
  onError: (callback) => ipcRenderer.on('browser:error', (_event, message) => callback(message))
});
