const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { AdBlocker, parseFilter } = require('./ad-blocker.cjs');

function createBlocker(filters) {
  const blocker = new AdBlocker({
    settingsPath: 'unused-settings.json',
    cachePath: 'unused-cache.json'
  });
  blocker.setRules(filters);
  return blocker;
}

test('matches host-anchored ad rules and leaves similar domains alone', () => {
  const blocker = createBlocker(['||ads.example.com^']);

  assert.equal(blocker.shouldBlock({
    url: 'https://ads.example.com/banner.js',
    documentUrl: 'https://news.example.org/',
    type: 'script'
  }), true);
  assert.equal(blocker.shouldBlock({
    url: 'https://notads.example.com/banner.js',
    documentUrl: 'https://news.example.org/',
    type: 'script'
  }), false);
});

test('honors resource types and first- or third-party modifiers', () => {
  const blocker = createBlocker(['||cdn.example^$script,third-party']);
  const request = {
    url: 'https://cdn.example/asset',
    documentUrl: 'https://publisher.test/',
    type: 'image'
  };

  assert.equal(blocker.shouldBlock(request), false);
  assert.equal(blocker.shouldBlock({ ...request, type: 'script' }), true);
  assert.equal(blocker.shouldBlock({
    ...request,
    documentUrl: 'https://cdn.example/page'
  }), false);
});

test('allows matching exceptions unless an important blocking rule applies', () => {
  const blocker = createBlocker([
    '||ads.example^',
    '@@||ads.example^$domain=publisher.test',
    '||ads.example^$important'
  ]);
  const request = {
    url: 'https://ads.example/banner',
    documentUrl: 'https://publisher.test/',
    type: 'image'
  };

  assert.equal(blocker.shouldBlock(request), true);
  blocker.setRules(['||ads.example^', '@@||ads.example^$domain=publisher.test']);
  assert.equal(blocker.shouldBlock(request), false);
});

test('allows sites exempted by document exception filters', () => {
  const blocker = createBlocker([
    '||ads.example^',
    '@@||publisher.test^$document'
  ]);

  assert.equal(blocker.shouldBlock({
    url: 'https://ads.example/banner',
    documentUrl: 'https://publisher.test/article',
    type: 'image'
  }), false);
});

test('blocks popup rules without applying normal network rules to popups', () => {
  const blocker = createBlocker([
    '||ads.example^',
    '||popups.example^$popup'
  ]);

  assert.equal(blocker.shouldBlock({
    url: 'https://ads.example/',
    documentUrl: 'https://publisher.test/',
    type: 'other'
  }, true), false);
  assert.equal(blocker.shouldBlock({
    url: 'https://popups.example/',
    documentUrl: 'https://publisher.test/',
    type: 'other'
  }, true), true);
});

test('site exceptions and the global switch bypass filtering', async () => {
  const blocker = createBlocker(['||ads.example^']);
  const request = {
    url: 'https://ads.example/banner',
    documentUrl: 'https://publisher.test/',
    type: 'image'
  };

  assert.equal(blocker.shouldBlock(request), true);
  blocker.exceptions = ['publisher.test'];
  assert.equal(blocker.shouldBlock(request), false);
  blocker.exceptions = [];
  blocker.enabled = false;
  assert.equal(blocker.shouldBlock(request), false);
});

test('toggles a persisted exception using the current page URL', async () => {
  const blocker = createBlocker(['||ads.example^']);
  blocker.saveSettings = async () => {};

  await blocker.toggleException('https://publisher.test/article');
  assert.equal(blocker.getState('https://publisher.test/article').isAllowlisted, true);
  await blocker.toggleException('https://publisher.test/another-article');
  assert.equal(blocker.getState('https://publisher.test/').isAllowlisted, false);
});

test('reverts preference changes if saving settings fails', async () => {
  const blocker = createBlocker(['||ads.example^']);
  blocker.saveSettings = async () => {
    throw new Error('disk full');
  };

  await assert.rejects(blocker.setEnabled(false), /disk full/);
  assert.equal(blocker.enabled, true);
  await assert.rejects(blocker.toggleException('https://publisher.test/'), /disk full/);
  assert.deepEqual(blocker.exceptions, []);
});

test('ignores cosmetic rules and unsupported modifiers', () => {
  assert.equal(parseFilter('example.com##.advertisement'), null);
  assert.equal(parseFilter('||ads.example^$redirect=empty'), null);
  assert.notEqual(parseFilter('||ads.example^$image'), null);
});

test('counts blocked requests in the Electron session hook', () => {
  const blocker = createBlocker(['||ads.example^']);
  const callbacks = [];
  const session = {
    webRequest: {
      onBeforeRequest: (_filter, callback) => callbacks.push(callback)
    }
  };
  const counts = [];
  blocker.onBlocked = (count) => counts.push(count);
  blocker.enableInSession(session);
  callbacks[0]({
    url: 'https://ads.example/banner',
    referrer: 'https://publisher.test/',
    resourceType: 'image'
  }, (response) => assert.deepEqual(response, { cancel: true }));

  assert.deepEqual(counts, [1]);
  assert.equal(blocker.getState('https://publisher.test/').blockedCount, 1);
});

test('refreshes and indexes downloaded rules for subsequent requests', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'night-browser-adblocker-'));
  const blocker = new AdBlocker({
    settingsPath: path.join(directory, 'settings.json'),
    cachePath: path.join(directory, 'filters.json'),
    fetchImpl: async () => ({
      ok: true,
      text: async () => '||ads.example^'
    })
  });

  try {
    await blocker.refreshFilters();
    assert.equal(blocker.shouldBlock({
      url: 'https://ads.example/banner',
      documentUrl: 'https://publisher.test/',
      type: 'image'
    }), true);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
