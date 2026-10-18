const { app, BrowserWindow, WebContentsView, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { HistoryStore } = require('./history-store.cjs');
const { DownloadManager } = require('./download-manager.cjs');

let win;
let tabs = new Map();
let activeTabId = null;
let nextTabId = 1;
let activePanel = null;
const historyStore = new HistoryStore(path.join(app.getPath('userData'), 'history.json'));
const TOOLBAR_HEIGHT = 112;
const downloadManager = new DownloadManager({
  directory: app.getPath('downloads'),
  onChange: (downloads) => {
    if (win && !win.isDestroyed()) win.webContents.send('downloads:state', downloads);
  },
  onError: reportBrowserError,
  openPath: (filePath) => shell.openPath(filePath),
  revealPath: (filePath) => shell.showItemInFolder(filePath)
});

function reportBrowserError(message) {
  if (win && !win.isDestroyed()) win.webContents.send('browser:error', message);
}

function safeUrl(input) {
  let value = String(input || '').trim();
  if (!value) return 'https://www.google.com/';
  if (/^(javascript|file|data|vbscript):/i.test(value)) {
    throw new Error('Ce type d’adresse n’est pas autorisé.');
  }
  const looksLikeUrl = /^(https?:\/\/|localhost(:\d+)?([/]|$))/i.test(value) || /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(value);
  if (!looksLikeUrl) {
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  }
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Seules les adresses HTTP et HTTPS sont prises en charge.');
  }
  return parsed.href;
}

function isWebUrl(input) {
  try {
    return ['http:', 'https:'].includes(new URL(input).protocol);
  } catch {
    return false;
  }
}

function sendState() {
  if (!win || win.isDestroyed()) return;
  const list = [...tabs.values()].map(({ id, view, title, url, loading, privateMode }) => ({
    id,
    title: title || 'Nouvel onglet',
    url: url || '',
    loading: Boolean(loading),
    privateMode: Boolean(privateMode),
    canGoBack: view.webContents.navigationHistory.canGoBack(),
    canGoForward: view.webContents.navigationHistory.canGoForward()
  }));
  win.webContents.send('tabs:state', { tabs: list, activeTabId });
}

function setViewBounds() {
  if (!win || win.isDestroyed()) return;
  const { width, height } = win.getContentBounds();
  for (const { view } of tabs.values()) {
    view.setBounds({
      x: 0,
      y: TOOLBAR_HEIGHT,
      width: Math.max(0, width),
      height: activePanel ? 0 : Math.max(0, height - TOOLBAR_HEIGHT)
    });
  }
}

function reportHistoryError(error) {
  console.error('Impossible d’enregistrer l’historique de Night Browser:', error);
  reportBrowserError('Impossible d’enregistrer l’historique. Vérifiez l’espace disque et les permissions.');
}

function recordVisit(tab, url) {
  if (tab.privateMode || !isWebUrl(url)) return;
  const entry = {
    id: randomUUID(),
    title: tab.title || url,
    url,
    visitedAt: new Date().toISOString()
  };
  tab.historyEntryId = entry.id;
  historyStore.addVisit(entry).catch(reportHistoryError);
}

function attachTabEvents(tab) {
  const wc = tab.view.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    createTab(url, tab.privateMode);
    return { action: 'deny' };
  });
  const blockUnsupportedNavigation = (event, url) => {
    if (isWebUrl(url)) return;
    event.preventDefault();
    reportBrowserError('Seules les adresses HTTP et HTTPS sont autorisées.');
  };
  wc.on('will-navigate', blockUnsupportedNavigation);
  wc.on('will-redirect', blockUnsupportedNavigation);
  wc.on('page-title-updated', (_event, title) => {
    tab.title = title;
    if (!tab.privateMode && tab.historyEntryId) {
      historyStore.updateTitle(tab.historyEntryId, title).catch(reportHistoryError);
    }
    sendState();
  });
  wc.on('did-start-loading', () => {
    tab.loading = true;
    tab.historyEntryId = null;
    sendState();
  });
  wc.on('did-stop-loading', () => {
    tab.loading = false;
    tab.url = wc.getURL();
    sendState();
  });
  wc.on('did-navigate', (_event, url) => {
    tab.url = url;
    recordVisit(tab, url);
    sendState();
  });
  wc.on('did-navigate-in-page', (_event, url) => {
    tab.url = url;
    recordVisit(tab, url);
    sendState();
  });
  wc.on('render-process-gone', () => {
    tab.loading = false;
    sendState();
  });
}

function createTab(initialUrl = 'https://www.google.com/', privateMode = false) {
  const id = nextTabId++;
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: privateMode ? `nova-private-${id}` : 'persist:nova'
    }
  });
  downloadManager.attachSession(view.webContents.session, privateMode);
  const tab = { id, view, title: 'Nouvel onglet', url: '', loading: false, privateMode };
  tabs.set(id, tab);
  win.contentView.addChildView(view);
  attachTabEvents(tab);
  activateTab(id);
  try {
    view.webContents.loadURL(safeUrl(initialUrl));
  } catch (err) {
    tab.title = 'Adresse invalide';
    tab.url = '';
    reportBrowserError(err.message);
  }
  setViewBounds();
  sendState();
  return id;
}

function activateTab(id) {
  const selected = tabs.get(Number(id));
  if (!selected) return;
  activeTabId = selected.id;
  for (const tab of tabs.values()) {
    tab.view.setVisible(!activePanel && tab.id === activeTabId);
  }
  setViewBounds();
  sendState();
}

function closeTab(id) {
  const tab = tabs.get(Number(id));
  if (!tab) return;
  const wasActive = activeTabId === tab.id;
  tabs.delete(tab.id);
  win.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  if (wasActive) {
    const remaining = [...tabs.keys()];
    if (remaining.length) activateTab(remaining[remaining.length - 1]);
    else createTab();
  } else {
    sendState();
  }
}

function activeTab() {
  return tabs.get(activeTabId);
}

function navigate(input) {
  const tab = activeTab();
  if (!tab) return;
  try {
    tab.view.webContents.loadURL(safeUrl(input));
  } catch (err) {
    reportBrowserError(err.message);
  }
}

function configureAutoUpdates() {
  if (!app.isPackaged) return;
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    reportBrowserError('Les mises à jour automatiques sont disponibles avec la version AppImage.');
    return;
  }

  autoUpdater.on('update-available', () => {
    reportBrowserError('Mise à jour disponible : téléchargement en cours.');
  });
  autoUpdater.on('update-not-available', () => {
    reportBrowserError('Night Browser est à jour.');
  });
  autoUpdater.on('update-downloaded', () => {
    reportBrowserError('Mise à jour téléchargée. Elle sera installée à la fermeture de Night Browser.');
  });
  autoUpdater.on('error', (error) => {
    console.error('Échec de la mise à jour de Night Browser:', error);
    reportBrowserError('La recherche de mise à jour a échoué. Réessayez plus tard.');
  });

  autoUpdater.checkForUpdates().catch((error) => {
    console.error('Impossible de vérifier les mises à jour de Night Browser:', error);
    reportBrowserError('La recherche de mise à jour a échoué. Réessayez plus tard.');
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#080b14',
    title: 'Night Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadFile('index.html');
  win.on('resize', setViewBounds);
  win.on('closed', () => {
    tabs.clear();
    win = null;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Links opened by the app shell are sent to the system browser only for HTTP(S).
    try {
      const parsed = new URL(url);
      if (['http:', 'https:'].includes(parsed.protocol)) shell.openExternal(parsed.href);
    } catch {}
    return { action: 'deny' };
  });
  win.webContents.once('did-finish-load', () => createTab());
  win.webContents.once('did-finish-load', configureAutoUpdates);
}

app.whenReady().then(() => {
  ipcMain.handle('tabs:new', (_e, url, privateMode = false) => createTab(url, Boolean(privateMode)));
  ipcMain.handle('tabs:activate', (_e, id) => activateTab(id));
  ipcMain.handle('tabs:close', (_e, id) => closeTab(id));
  ipcMain.handle('browser:navigate', (_e, url) => navigate(url));
  ipcMain.handle('browser:back', () => activeTab()?.view.webContents.navigationHistory.goBack());
  ipcMain.handle('browser:forward', () => activeTab()?.view.webContents.navigationHistory.goForward());
  ipcMain.handle('browser:reload', () => activeTab()?.view.webContents.reload());
  ipcMain.handle('browser:home', () => navigate('https://www.google.com/'));
  ipcMain.handle('browser:external', (_e, url) => {
    try {
      const parsed = new URL(url);
      if (['http:', 'https:'].includes(parsed.protocol)) return shell.openExternal(parsed.href);
    } catch {}
  });
  ipcMain.handle('browser:bookmark', () => {
    const tab = activeTab();
    return tab ? { title: tab.title, url: tab.view.webContents.getURL() } : null;
  });
  ipcMain.handle('history:open', async () => {
    const entries = await historyStore.load();
    activePanel = 'history';
    for (const tab of tabs.values()) tab.view.setVisible(false);
    setViewBounds();
    return entries;
  });
  ipcMain.handle('history:close', () => {
    if (activePanel !== 'history') return;
    activePanel = null;
    if (activeTabId !== null) activateTab(activeTabId);
  });
  ipcMain.handle('history:clear', async () => {
    await historyStore.clear();
    return [];
  });
  ipcMain.handle('downloads:open', () => {
    activePanel = 'downloads';
    for (const tab of tabs.values()) tab.view.setVisible(false);
    setViewBounds();
    return downloadManager.list();
  });
  ipcMain.handle('downloads:close', () => {
    if (activePanel !== 'downloads') return;
    activePanel = null;
    if (activeTabId !== null) activateTab(activeTabId);
  });
  ipcMain.handle('downloads:cancel', (_event, id) => downloadManager.cancel(id));
  ipcMain.handle('downloads:open-file', (_event, id) => downloadManager.open(id));
  ipcMain.handle('downloads:show-file', (_event, id) => downloadManager.reveal(id));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
