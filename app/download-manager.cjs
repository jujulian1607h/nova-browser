const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_DOWNLOADS = 100;

function getSafeFileName(fileName) {
  const safeName = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return safeName && safeName !== '.' && safeName !== '..' ? safeName : 'download';
}

function getUniqueDownloadPath(directory, fileName, exists = fs.existsSync) {
  const safeName = getSafeFileName(fileName);
  const extension = path.extname(safeName);
  const baseName = path.basename(safeName, extension);
  let candidate = path.join(directory, safeName);
  let suffix = 1;
  while (exists(candidate)) {
    candidate = path.join(directory, `${baseName} (${suffix})${extension}`);
    suffix += 1;
  }
  return candidate;
}

class DownloadManager {
  constructor({ directory, onChange, onError, openPath, revealPath }) {
    this.directory = directory;
    this.onChange = onChange;
    this.onError = onError;
    this.openPath = openPath;
    this.revealPath = revealPath;
    this.downloads = new Map();
    this.items = new Map();
    this.sessions = new WeakSet();
    this.reservedPaths = new Set();
  }

  attachSession(downloadSession, privateMode = false) {
    if (this.sessions.has(downloadSession)) return;
    this.sessions.add(downloadSession);
    downloadSession.on('will-download', (_event, item) => this.track(item, privateMode));
  }

  list() {
    return [...this.downloads.values()].map((download) => ({ ...download }));
  }

  cancel(id) {
    const item = this.items.get(id);
    if (!item || item.getState() !== 'progressing') return false;
    item.cancel();
    return true;
  }

  async open(id) {
    const download = this.downloads.get(id);
    if (!download || download.state !== 'completed') throw new Error('Ce téléchargement n’est pas terminé.');
    const error = await this.openPath(download.savePath);
    if (error) throw new Error(error);
  }

  async reveal(id) {
    const download = this.downloads.get(id);
    if (!download || download.state !== 'completed') throw new Error('Ce téléchargement n’est pas terminé.');
    await this.revealPath(download.savePath);
  }

  track(item, privateMode) {
    const id = randomUUID();
    const savePath = getUniqueDownloadPath(
      this.directory,
      item.getFilename(),
      (candidate) => fs.existsSync(candidate) || this.reservedPaths.has(candidate)
    );
    try {
      item.setSavePath(savePath);
    } catch (error) {
      item.cancel();
      this.onError(`Impossible d’enregistrer le téléchargement : ${error.message}`);
      return;
    }
    this.reservedPaths.add(savePath);
    const download = {
      id,
      fileName: path.basename(savePath),
      savePath,
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      progress: 0,
      state: 'progressing',
      privateMode
    };
    this.downloads.set(id, download);
    this.items.set(id, item);
    this.emitChange();

    item.on('updated', (_event, state) => {
      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      download.progress = download.totalBytes > 0
        ? Math.min(100, Math.floor(download.receivedBytes / download.totalBytes * 100))
        : 0;
      if (state === 'interrupted') download.state = 'interrupted';
      this.emitChange();
    });

    item.once('done', (_event, state) => {
      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      download.progress = state === 'completed' ? 100 : download.progress;
      download.state = state;
      this.items.delete(id);
      this.reservedPaths.delete(savePath);
      this.trim();
      this.emitChange();
      if (state === 'interrupted') {
        this.onError(`Le téléchargement de ${download.fileName} a échoué.`);
      }
    });
  }

  trim() {
    const completed = [...this.downloads.entries()].filter(([, download]) => download.state !== 'progressing');
    while (this.downloads.size > MAX_DOWNLOADS && completed.length > 0) {
      const [id] = completed.shift();
      this.downloads.delete(id);
      this.items.delete(id);
    }
  }

  emitChange() {
    this.onChange(this.list());
  }
}

module.exports = { DownloadManager, MAX_DOWNLOADS, getSafeFileName, getUniqueDownloadPath };
