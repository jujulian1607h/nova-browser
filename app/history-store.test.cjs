const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { HistoryStore, MAX_HISTORY_ENTRIES } = require('./history-store.cjs');

async function createStore(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'night-browser-history-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return new HistoryStore(path.join(directory, 'history.json'));
}

test('stores visits newest first and persists them', async (t) => {
  const store = await createStore(t);
  const first = { id: 'first', title: 'First page', url: 'https://example.com/one', visitedAt: '2026-10-17T12:00:00.000Z' };
  const second = { id: 'second', title: 'Second page', url: 'https://example.com/two', visitedAt: '2026-10-17T12:01:00.000Z' };

  await store.addVisit(first);
  await store.addVisit(second);

  const reloaded = new HistoryStore(store.filePath);
  assert.deepEqual(await reloaded.load(), [second, first]);
});

test('updates a page title and clears saved visits', async (t) => {
  const store = await createStore(t);
  await store.addVisit({ id: 'entry', title: '', url: 'https://example.com', visitedAt: '2026-10-17T12:00:00.000Z' });

  await store.updateTitle('entry', 'Example');
  assert.equal((await store.load())[0].title, 'Example');

  await store.clear();
  assert.deepEqual(await store.load(), []);
});

test('keeps only the configured number of recent visits', async (t) => {
  const store = await createStore(t);
  for (let index = 0; index <= MAX_HISTORY_ENTRIES; index += 1) {
    await store.addVisit({
      id: String(index),
      title: `Page ${index}`,
      url: `https://example.com/${index}`,
      visitedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
    });
  }

  const entries = await store.load();
  assert.equal(entries.length, MAX_HISTORY_ENTRIES);
  assert.equal(entries[0].id, String(MAX_HISTORY_ENTRIES));
  assert.equal(entries.at(-1).id, '1');
});

test('reports malformed history data instead of silently discarding it', async (t) => {
  const store = await createStore(t);
  await fs.writeFile(store.filePath, '{invalid', 'utf8');

  await assert.rejects(store.load(), SyntaxError);
  await store.clear();
  assert.deepEqual(await store.load(), []);
});
