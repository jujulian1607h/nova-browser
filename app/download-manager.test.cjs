const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const test = require('node:test');
const { DownloadManager, getSafeFileName, getUniqueDownloadPath } = require('./download-manager.cjs');

test('sanitizes download names and avoids overwriting existing files', () => {
  assert.equal(getSafeFileName('..\\unsafe:name?.exe'), 'unsafe_name_.exe');
  const directory = path.join('downloads');
  const existing = new Set([path.join(directory, 'file.zip'), path.join(directory, 'file (1).zip')]);
  assert.equal(
    getUniqueDownloadPath(directory, 'file.zip', (candidate) => existing.has(candidate)),
    path.join(directory, 'file (2).zip')
  );
});

test('tracks download progress and completion for the manager panel', async () => {
  const snapshots = [];
  const downloadSession = new EventEmitter();
  const manager = new DownloadManager({
    directory: path.join('downloads'),
    onChange: (downloads) => snapshots.push(downloads),
    onError: assert.fail,
    openPath: async () => '',
    revealPath: () => {}
  });
  manager.attachSession(downloadSession);

  const item = new EventEmitter();
  item.getFilename = () => 'file.zip';
  item.getTotalBytes = () => 100;
  item.getReceivedBytes = () => 0;
  item.setSavePath = (savePath) => { item.savePath = savePath; };
  item.getState = () => item.done ? 'completed' : 'progressing';
  item.cancel = () => { item.done = true; };
  item.done = false;
  downloadSession.emit('will-download', {}, item);

  item.getReceivedBytes = () => 50;
  item.emit('updated', {}, 'progressing');
  assert.equal(snapshots.at(-1)[0].progress, 50);

  item.done = true;
  item.getReceivedBytes = () => 100;
  item.emit('done', {}, 'completed');
  assert.equal(snapshots.at(-1)[0].state, 'completed');
  assert.equal(snapshots.at(-1)[0].progress, 100);
  await manager.open(snapshots.at(-1)[0].id);
});

test('isolates download sessions and labels private downloads', () => {
  const snapshots = [];
  const manager = new DownloadManager({
    directory: path.join('downloads'),
    onChange: (downloads) => snapshots.push(downloads),
    onError: assert.fail,
    openPath: async () => '',
    revealPath: () => {}
  });
  const downloadSession = new EventEmitter();
  manager.attachSession(downloadSession, true);
  manager.attachSession(downloadSession, false);

  const item = new EventEmitter();
  item.getFilename = () => 'private.zip';
  item.getTotalBytes = () => 10;
  item.getReceivedBytes = () => 0;
  item.setSavePath = () => {};
  item.getState = () => 'progressing';
  item.cancel = () => {};
  downloadSession.emit('will-download', {}, item);

  assert.equal(snapshots.at(-1)[0].privateMode, true);
  assert.equal(downloadSession.listenerCount('will-download'), 1);
});

test('reserves unique destinations for simultaneous downloads with the same name', () => {
  const manager = new DownloadManager({
    directory: path.join('downloads'),
    onChange: () => {},
    onError: assert.fail,
    openPath: async () => '',
    revealPath: () => {}
  });
  const downloadSession = new EventEmitter();
  manager.attachSession(downloadSession);
  const createItem = () => {
    const item = new EventEmitter();
    item.getFilename = () => 'same.zip';
    item.getTotalBytes = () => 10;
    item.getReceivedBytes = () => 0;
    item.setSavePath = (savePath) => { item.savePath = savePath; };
    item.getState = () => 'progressing';
    item.cancel = () => {};
    return item;
  };
  const first = createItem();
  const second = createItem();

  downloadSession.emit('will-download', {}, first);
  downloadSession.emit('will-download', {}, second);

  assert.equal(first.savePath, path.join('downloads', 'same.zip'));
  assert.equal(second.savePath, path.join('downloads', 'same (1).zip'));
});
