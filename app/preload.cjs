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
  openDownloads: () => ipcRenderer.invoke('downloads:open'),
  closeDownloads: () => ipcRenderer.invoke('downloads:close'),
  cancelDownload: (id) => ipcRenderer.invoke('downloads:cancel', id),
  openDownloadedFile: (id) => ipcRenderer.invoke('downloads:open-file', id),
  showDownloadedFile: (id) => ipcRenderer.invoke('downloads:show-file', id),
  onTabsState: (callback) => ipcRenderer.on('tabs:state', (_event, state) => callback(state)),
  onDownloadsState: (callback) => ipcRenderer.on('downloads:state', (_event, downloads) => callback(downloads)),
  onError: (callback) => ipcRenderer.on('browser:error', (_event, message) => callback(message))
});
