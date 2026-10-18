const assert = require('node:assert/strict');
const test = require('node:test');
const { detectPlatform, getDownload } = require('./download-platform.js');

test('detects Windows and selects its installer', () => {
  assert.equal(detectPlatform('Win32'), 'windows');
  assert.equal(detectPlatform('Windows'), 'windows');
  assert.match(getDownload(detectPlatform('Win32')).url, /\.exe$/);
});

test('detects Linux and selects the AppImage by default', () => {
  assert.equal(detectPlatform('Linux x86_64'), 'linux');
  assert.match(getDownload(detectPlatform('Linux x86_64')).url, /Night-Browser-1\.0\.5-x86_64\.AppImage$/);
  assert.match(getDownload('deb').url, /Night-Browser-1\.0\.5-amd64\.deb$/);
});

test('does not guess unsupported platforms', () => {
  assert.equal(detectPlatform('MacIntel'), 'unknown');
  assert.equal(getDownload('unknown'), null);
});
