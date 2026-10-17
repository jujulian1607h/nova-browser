const $ = (id) => document.getElementById(id);
const tabsEl = $('tabs');
const address = $('address');
const statusEl = $('status');
const toast = $('toast');
const historyPanel = $('historyPanel');
const historyList = $('historyList');
const downloadsPanel = $('downloadsPanel');
const downloadList = $('downloadList');
let state = { tabs: [], activeTabId: null };
let downloads = [];
let toastTimeout;
const historyDateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

function notify(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 2800);
}

function shortTitle(title) {
  return (title || 'Nouvel onglet').replace(/\s+/g, ' ').trim().slice(0, 25) || 'Nouvel onglet';
}

function hidePanels() {
  historyPanel.classList.remove('visible');
  historyPanel.setAttribute('aria-hidden', 'true');
  downloadsPanel.classList.remove('visible');
  downloadsPanel.setAttribute('aria-hidden', 'true');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function renderDownloads() {
  downloadList.replaceChildren();
  const activeCount = downloads.filter((download) => download.state === 'progressing').length;
  const count = $('downloadCount');
  count.hidden = activeCount === 0;
  count.textContent = String(activeCount);
  $('downloads').setAttribute('aria-label', activeCount ? `Téléchargements, ${activeCount} en cours` : 'Afficher les téléchargements');

  if (downloads.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'Aucun téléchargement pour le moment.';
    downloadList.append(empty);
    return;
  }

  for (const download of downloads) {
    const item = document.createElement('article');
    item.className = 'download-entry';
    const details = document.createElement('div');
    details.className = 'download-details';
    const name = document.createElement('strong');
    name.textContent = download.fileName;
    const status = document.createElement('span');
    status.className = 'download-status';
    const progress = document.createElement('progress');
    progress.max = 100;
    progress.value = download.progress;
    if (download.state === 'progressing') {
      status.textContent = `${formatBytes(download.receivedBytes)} / ${download.totalBytes ? formatBytes(download.totalBytes) : 'taille inconnue'} · ${download.progress}%`;
    } else if (download.state === 'completed') {
      status.textContent = `Terminé · ${formatBytes(download.totalBytes)}`;
    } else {
      status.textContent = download.state === 'cancelled' ? 'Annulé' : 'Échec du téléchargement';
    }
    if (download.privateMode) status.textContent += ' · onglet privé';
    details.append(name, status);
    if (download.state === 'progressing') details.append(progress);
    const actions = document.createElement('div');
    actions.className = 'download-actions';
    if (download.state === 'progressing') {
      const cancel = document.createElement('button');
      cancel.className = 'history-action';
      cancel.type = 'button';
      cancel.textContent = 'Annuler';
      cancel.addEventListener('click', async () => {
        try {
          await window.nova.cancelDownload(download.id);
        } catch {
          notify('Impossible d’annuler ce téléchargement.');
        }
      });
      actions.append(cancel);
    } else if (download.state === 'completed') {
      const open = document.createElement('button');
      open.className = 'history-action';
      open.type = 'button';
      open.textContent = 'Ouvrir';
      open.addEventListener('click', async () => {
        try {
          await window.nova.openDownloadedFile(download.id);
        } catch {
          notify('Impossible d’ouvrir ce fichier.');
        }
      });
      const reveal = document.createElement('button');
      reveal.className = 'history-action';
      reveal.type = 'button';
      reveal.textContent = 'Afficher';
      reveal.addEventListener('click', async () => {
        try {
          await window.nova.showDownloadedFile(download.id);
        } catch {
          notify('Impossible d’afficher ce fichier.');
        }
      });
      actions.append(open, reveal);
    }
    item.append(details, actions);
    downloadList.append(item);
  }
}

function renderTabs() {
  tabsEl.replaceChildren();
  for (const tab of state.tabs) {
    const el = document.createElement('div');
    el.className = `tab ${tab.id === state.activeTabId ? 'active' : ''} ${tab.privateMode ? 'private' : ''}`;
    el.title = tab.title;
    const select = document.createElement('button');
    select.className = 'tab-title';
    select.textContent = `${tab.loading ? '◌ ' : tab.privateMode ? '◉ ' : '◈ '}${shortTitle(tab.title)}`;
    select.addEventListener('click', () => window.nova.activateTab(tab.id));
    const close = document.createElement('button');
    close.className = 'tab-close';
    close.textContent = '×';
    close.title = 'Fermer l’onglet';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      window.nova.closeTab(tab.id);
    });
    el.append(select, close);
    tabsEl.append(el);
  }
  const active = state.tabs.find(tab => tab.id === state.activeTabId);
  if (active) {
    if (document.activeElement !== address) address.value = active.url || '';
    statusEl.textContent = active.loading ? 'CHARGEMENT EN COURS…' : active.privateMode ? 'ONGLET PRIVÉ — HISTORIQUE LOCAL NON ENREGISTRÉ PAR NIGHT BROWSER' : 'PRÊT POUR EXPLORER';
    $('back').disabled = !active.canGoBack;
    $('forward').disabled = !active.canGoForward;
  }
}

window.nova.onTabsState((next) => {
  state = next;
  renderTabs();
});
window.nova.onError((message) => notify(message));
window.nova.onDownloadsState((next) => {
  downloads = next;
  renderDownloads();
});

function renderHistory(entries) {
  historyList.replaceChildren();
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = 'Aucune visite enregistrée.';
    historyList.append(empty);
    return;
  }

  for (const entry of entries) {
    const item = document.createElement('button');
    item.className = 'history-entry';
    item.type = 'button';
    const title = document.createElement('strong');
    title.textContent = entry.title || entry.url;
    const url = document.createElement('span');
    url.className = 'history-url';
    url.textContent = entry.url;
    const date = document.createElement('time');
    date.dateTime = entry.visitedAt;
    date.textContent = historyDateFormat.format(new Date(entry.visitedAt));
    item.append(title, url, date);
    item.addEventListener('click', async () => {
      try {
        await window.nova.closeHistory();
        hidePanels();
        window.nova.navigate(entry.url);
      } catch {
        notify('Impossible de fermer l’historique.');
      }
    });
    historyList.append(item);
  }
}

$('history').addEventListener('click', async () => {
  try {
    renderHistory(await window.nova.openHistory());
    downloadsPanel.classList.remove('visible');
    downloadsPanel.setAttribute('aria-hidden', 'true');
    historyPanel.classList.add('visible');
    historyPanel.setAttribute('aria-hidden', 'false');
  } catch {
    notify('Impossible de charger l’historique.');
  }
});
$('closeHistory').addEventListener('click', async () => {
  try {
    await window.nova.closeHistory();
    hidePanels();
  } catch {
    notify('Impossible de fermer l’historique.');
  }
});
$('clearHistory').addEventListener('click', async () => {
  try {
    renderHistory(await window.nova.clearHistory());
    notify('Historique effacé.');
  } catch {
    notify('Impossible d’effacer l’historique.');
  }
});
$('downloads').addEventListener('click', async () => {
  try {
    downloads = await window.nova.openDownloads();
    renderDownloads();
    historyPanel.classList.remove('visible');
    historyPanel.setAttribute('aria-hidden', 'true');
    downloadsPanel.classList.add('visible');
    downloadsPanel.setAttribute('aria-hidden', 'false');
  } catch {
    notify('Impossible de charger les téléchargements.');
  }
});
$('closeDownloads').addEventListener('click', async () => {
  try {
    await window.nova.closeDownloads();
    hidePanels();
  } catch {
    notify('Impossible de fermer les téléchargements.');
  }
});

$('addressForm').addEventListener('submit', (event) => {
  event.preventDefault();
  window.nova.navigate(address.value);
  address.blur();
});
$('newTab').addEventListener('click', () => window.nova.newTab());
$('privateTab').addEventListener('click', () => window.nova.newTab('https://www.google.com/', true));
$('back').addEventListener('click', () => window.nova.back());
$('forward').addEventListener('click', () => window.nova.forward());
$('reload').addEventListener('click', () => window.nova.reload());
$('home').addEventListener('click', () => window.nova.home());
$('bookmark').addEventListener('click', async () => {
  const item = await window.nova.bookmark();
  if (!item?.url) return notify('Aucune page à ajouter aux favoris.');
  try {
    const bookmarks = JSON.parse(localStorage.getItem('nova-bookmarks') || '[]');
    if (!bookmarks.some(b => b.url === item.url)) bookmarks.push(item);
    localStorage.setItem('nova-bookmarks', JSON.stringify(bookmarks));
    notify('Favori enregistré sur cet ordinateur.');
  } catch {
    notify('Impossible d’enregistrer le favori.');
  }
});
$('openExternal').addEventListener('click', () => {
  const active = state.tabs.find(tab => tab.id === state.activeTabId);
  if (active?.url) window.nova.external(active.url);
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
    event.preventDefault();
    address.focus();
    address.select();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') {
    event.preventDefault();
    window.nova.newTab();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') {
    event.preventDefault();
    if (state.activeTabId != null) window.nova.closeTab(state.activeTabId);
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
    event.preventDefault();
    $('history').click();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') {
    event.preventDefault();
    $('downloads').click();
  }
});
