'use strict';
// main.js lifecycle rules checked textually (main.js cannot load without Electron).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.resolve(__dirname, '..', 'main.js'), 'utf8');

describe('window-all-closed', () => {
  it('quits the app on every platform, including macOS', () => {
    const m = main.match(/app\.on\('window-all-closed',\s*\(\)\s*=>\s*\{([\s\S]*?)\n\}\);/);
    assert.ok(m, 'window-all-closed handler present');
    const body = m[1];
    assert.match(body, /app\.quit\(\)/);
    assert.doesNotMatch(body, /darwin/, 'must not keep the app alive on macOS');
  });
});

describe('upload-firmware', () => {
  it('forwards the selected DFU device serial so dfu-util flashes only that meter', () => {
    const m = main.match(/ipcMain\.handle\('upload-firmware'[\s\S]*?updater\.upload\(resolvedHex,\s*\{([\s\S]*?)\n\s*\}\);/);
    assert.ok(m, 'upload-firmware handler calls updater.upload');
    assert.match(m[1], /serial:\s*deviceInfo/);
  });
});
