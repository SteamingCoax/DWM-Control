'use strict';
// A meter card whose saved layout is "Left Only" (config.meterCards[key].cardLayout) must come
// up in that layout on startup: the markup, the layout select, and the board creation path.
const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadRenderer, makeControlStub, makeElement, ROOT } = require('./helpers/renderer-harness');
const { extractTags, findById } = require('./helpers/html-tags');

const KEY = 'usbmodem:LAYOUT1';
const SID = 'usbmodem_LAYOUT1';

let saved;
before(() => { loadRenderer(); });
beforeEach(() => {
  const d = globalThis.document;
  saved = {
    gid: d.getElementById, qs: d.querySelector, ce: d.createElement, active: d.activeElement,
    CSS: globalThis.CSS, Element: globalThis.Element,
  };
});
afterEach(() => {
  const d = globalThis.document;
  d.getElementById = saved.gid;
  d.querySelector = saved.qs;
  d.createElement = saved.ce;
  d.activeElement = saved.active;
  globalThis.CSS = saved.CSS;
  globalThis.Element = saved.Element;
});

function makeStub(prefs, record) {
  const ctl = makeControlStub({
    config: { meterCards: { [KEY]: prefs }, meterCardOrder: [KEY], boardCardOrder: [`meter:${KEY}`], swrCards: [] },
    _normalizeRange: (cfg) => ({ cfg: Number(cfg) || 1 }),
  });
  ctl.meterRegistry.set(KEY, record);
  return ctl;
}

function baseRecord(extra = {}) {
  return {
    key: KEY, friendlyName: 'Bench', connectionState: 'available', portPath: '/dev/tty.usbmodemLAYOUT1',
    elementId: 1, elementRating: 100, ...extra,
  };
}

function selectedLayout(html) {
  const sel = extractTags(html, 'select').find(s => s.attrs['data-meter-field'] === 'cardLayout');
  assert.ok(sel, 'layout select exists');
  const opts = extractTags(sel.inner, 'option').filter(o => 'selected' in o.attrs).map(o => o.attrs.value);
  return opts;
}

describe('renderMeterCard layout from saved prefs', () => {
  it('uses the saved layout when the record has no state yet', () => {
    const ctl = makeStub({ cardLayout: 'single-L' }, baseRecord({ state: null }));
    const html = ctl.renderMeterCard(ctl.meterRegistry.get(KEY));
    assert.equal(findById(html, `meter-${SID}-gauges-view`).attrs['data-layout'], 'single-L');
    assert.deepEqual(selectedLayout(html), ['single-L']);
  });

  it('uses the saved layout when a fresh state has no explicit layout', () => {
    const ctl = makeStub({ cardLayout: 'single-L' }, baseRecord());
    const record = ctl.meterRegistry.get(KEY);
    record.state = ctl.createMeterState();
    const html = ctl.renderMeterCard(record);
    assert.equal(findById(html, `meter-${SID}-gauges-view`).attrs['data-layout'], 'single-L');
    assert.deepEqual(selectedLayout(html), ['single-L']);
  });

  it('a layout chosen in this session (state) wins over the saved one', () => {
    const ctl = makeStub({ cardLayout: 'single-L' }, baseRecord());
    const record = ctl.meterRegistry.get(KEY);
    record.state = { ...ctl.createMeterState(), cardLayout: 'stacked' };
    assert.equal(ctl._resolveMeterCardLayout(record), 'stacked');
  });

  it('falls back to dual and ignores unknown values', () => {
    const ctl = makeStub({}, baseRecord({ state: null }));
    assert.equal(ctl._resolveMeterCardLayout(ctl.meterRegistry.get(KEY)), 'dual');
    ctl.config.meterCards[KEY] = { cardLayout: 'bogus' };
    assert.equal(ctl._resolveMeterCardLayout(ctl.meterRegistry.get(KEY)), 'dual');
  });

  for (const layout of ['single-R', 'wide-left', 'wide-right', 'stacked']) {
    it(`renders saved ${layout} into the markup`, () => {
      const ctl = makeStub({ cardLayout: layout }, baseRecord({ state: null }));
      const html = ctl.renderMeterCard(ctl.meterRegistry.get(KEY));
      assert.equal(findById(html, `meter-${SID}-gauges-view`).attrs['data-layout'], layout);
      assert.deepEqual(selectedLayout(html), [layout]);
    });
  }
});

describe('stylesheet hides the unused gauge for single layouts', () => {
  // _setMeterCardLayout hides panels with inline styles, but it cannot run before the meter
  // has state; the CSS must do it from data-layout alone so the first render is right.
  const css = fs.readFileSync(path.join(ROOT, 'styles-control.css'), 'utf8').replace(/\s+/g, ' ');
  it('single-L hides the right panel and single-R hides the left panel', () => {
    assert.match(css, /\.meter-gauges-view\[data-layout="single-L"\] \.meter-gauge-radial-panel:last-child[^{]*\{[^}]*display:\s*none/);
    assert.match(css, /\.meter-gauges-view\[data-layout="single-R"\] \.meter-gauge-radial-panel:first-child[^{]*\{[^}]*display:\s*none/);
  });
});

function installBoard() {
  const inserted = [];
  const board = makeElement('div');
  board.children = [];
  board.contains = () => false;
  board.querySelector = () => null;
  board.querySelectorAll = () => [];
  board.insertBefore = (el) => { inserted.push(el); board.children.push(el); return el; };
  const d = globalThis.document;
  d.getElementById = (id) => (id === 'meter-board' ? board : null);
  d.activeElement = null;
  d.createElement = (tag) => {
    const el = makeElement(tag);
    const card = makeElement('div');
    Object.defineProperty(el, 'firstElementChild', { get: () => card });
    return el;
  };
  globalThis.CSS = { escape: (s) => String(s) };
  globalThis.Element = class {};
  return { board, inserted };
}

describe('refreshMeterBoard applies the saved layout to a newly created card', () => {
  it('calls _setMeterCardLayout with the saved layout when the record has no state', () => {
    const { inserted } = installBoard();
    const ctl = makeStub({ cardLayout: 'single-L' }, baseRecord({ state: null }));
    const calls = [];
    ctl._setMeterCardLayout = (key, layout) => calls.push([key, layout, inserted.length]);
    ctl.refreshMeterBoard();
    assert.equal(inserted.length, 1, 'card inserted');
    assert.deepEqual(calls, [[KEY, 'single-L', 1]], 'called once, after the card is in the board');
  });

  it('calls _setMeterCardLayout with the saved layout when state exists without one', () => {
    installBoard();
    const ctl = makeStub({ cardLayout: 'single-L' }, baseRecord());
    ctl.meterRegistry.get(KEY).state = ctl.createMeterState();
    const calls = [];
    ctl._setMeterCardLayout = (key, layout) => calls.push([key, layout]);
    ctl.refreshMeterBoard();
    assert.deepEqual(calls, [[KEY, 'single-L']]);
  });

  it('does not call it for the default dual layout', () => {
    installBoard();
    const ctl = makeStub({}, baseRecord({ state: null }));
    const calls = [];
    ctl._setMeterCardLayout = (key, layout) => calls.push([key, layout]);
    ctl.refreshMeterBoard();
    assert.deepEqual(calls, []);
  });
});

describe('_seedMeterStateFromPrefs', () => {
  it('copies saved view/layout/history prefs onto state', () => {
    const ctl = makeStub({ cardLayout: 'single-L', viewMode: 'history', historyWindowMs: 5000, historyLines: ['avg'] }, baseRecord());
    const state = ctl.createMeterState();
    ctl._seedMeterStateFromPrefs(KEY, state);
    assert.equal(state.cardLayout, 'single-L');
    assert.equal(state.viewMode, 'history');
    assert.equal(state.historyWindowMs, 5000);
    assert.deepEqual(state.historyLines, ['avg']);
  });
});
