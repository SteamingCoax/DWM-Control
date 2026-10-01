'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const mainSrc = read('main.js');
const preloadSrc = read('preload.js');

function listOf(name) {
  const m = preloadSrc.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];'));
  assert.ok(m, `${name} not found in preload.js`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const MAIN_SENT = [...new Set([...mainSrc.matchAll(/'(menu-[a-z0-9-]+)'/g)].map((m) => m[1]))];
const MENU_CHANNELS = listOf('MENU_CHANNELS');
const ALLOWED_CHANNELS = listOf('ALLOWED_CHANNELS');

const rendererFiles = [path.join(root, 'renderer.js'), ...walk(path.join(root, 'renderer'))];
const RENDERER_LISTENED = new Set();
for (const f of rendererFiles) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\b(?:onMenuAction|on)(?:\?\.)?\(\s*'(menu-[a-z0-9-]+)'/g)) RENDERER_LISTENED.add(m[1]);
}

const A11Y = [
  'menu-a11y-speech-toggle', 'menu-a11y-tone-toggle', 'menu-a11y-speak-now',
  'menu-a11y-describe-meter', 'menu-a11y-peak-hold', 'menu-a11y-range-cycle',
  'menu-a11y-metric-cycle', 'menu-a11y-meter-next', 'menu-a11y-meter-prev',
  'menu-a11y-meter-select',
];
const ACCELERATORS = [
  'S', 'T', 'R', 'D', 'P', 'M', 'A', 'Right', 'Left', '1', '2', '3', '4', '5', '6', '7', '8',
].map((k) => 'CmdOrCtrl+Shift+' + k);

test('every channel main.js sends is in MENU_CHANNELS and ALLOWED_CHANNELS', () => {
  assert.ok(MAIN_SENT.length > 0);
  for (const ch of MAIN_SENT) {
    assert.ok(MENU_CHANNELS.includes(ch), `${ch} missing from MENU_CHANNELS`);
    assert.ok(ALLOWED_CHANNELS.includes(ch), `${ch} missing from ALLOWED_CHANNELS`);
  }
});

test('every menu channel the renderer listens on is in MENU_CHANNELS', () => {
  for (const ch of RENDERER_LISTENED) {
    assert.ok(MENU_CHANNELS.includes(ch), `renderer listens on ${ch}, not in MENU_CHANNELS`);
  }
});

test('ALLOWED_CHANNELS includes accessibility-support-changed', () => {
  assert.ok(ALLOWED_CHANNELS.includes('accessibility-support-changed'));
});

test('MENU_CHANNELS includes all menu-a11y-* channels', () => {
  for (const ch of A11Y) assert.ok(MENU_CHANNELS.includes(ch), `${ch} missing`);
});

test('Accessibility submenu has every accelerator', () => {
  const start = mainSrc.indexOf("label: 'Accessibility'");
  assert.ok(start >= 0, 'Accessibility menu not found');
  const end = mainSrc.indexOf("label: 'Window'", start);
  const block = mainSrc.slice(start, end > start ? end : undefined);
  for (const acc of ACCELERATORS) {
    assert.ok(block.includes(acc), `accelerator ${acc} missing`);
  }
});

test('Edit menu has "Add SWR / Return Loss Card" on CmdOrCtrl+Shift+W', () => {
  const start = mainSrc.indexOf("label: 'Edit'");
  assert.ok(start >= 0, 'Edit menu not found');
  const end = mainSrc.indexOf("label: 'View'", start);
  const block = mainSrc.slice(start, end);
  assert.ok(block.includes("label: 'Add SWR / Return Loss Card'"));
  assert.ok(block.includes("accelerator: 'CmdOrCtrl+Shift+W'"));
  assert.ok(block.includes("'menu-add-swr-card'"));
  assert.ok(MENU_CHANNELS.includes('menu-add-swr-card'));
  assert.ok(ALLOWED_CHANNELS.includes('menu-add-swr-card'));
  assert.ok(RENDERER_LISTENED.has('menu-add-swr-card'), 'renderer registers the channel');
});

test('CmdOrCtrl+Shift+W is not used by any other menu item', () => {
  const n = (mainSrc.match(/accelerator: 'CmdOrCtrl\+Shift\+W'/g) || []).length;
  assert.equal(n, 1);
});
