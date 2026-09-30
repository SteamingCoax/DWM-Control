'use strict';
const { describe, it, before, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub, makeElement } = require('./helpers/renderer-harness');

const A = 'usbmodem:A'; const B = 'usbmodem:B'; const C = 'usbmodem:C';
let ctl; let cards; let said; let origGet; let origAddListener; let origApi;

before(() => {
  loadRenderer();
  origGet = document.getElementById;
  origAddListener = document.addEventListener;
  origApi = globalThis.electronAPI;
});

const rec = (key, name, extra = {}) => ({ key, friendlyName: name, connectionState: 'connected', elementRating: 100, rangeCfg: 1, rangeMultiplier: 2, elementId: 3, state: { history: [] }, ...extra });

beforeEach(() => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  cards = {};
  ctl = makeControlStub({ config: { meterCardOrder: [A, B, C], meterCards: {}, swrCards: [], accessibility: {} } });
  for (const [k, n] of [[A, 'Alpha'], [B, 'Bravo'], [C, 'Charlie']]) {
    ctl.meterRegistry.set(k, rec(k, n));
    cards[`meter-card-${ctl.meterSafeId(k)}`] = makeElement('div');
  }
  document.getElementById = (id) => cards[id] || null;
  said = [];
  ctl.announce = (t, o) => said.push([t, o]);
  ctl._a11ySpeak = mock.fn(() => true);
  ctl.config.accessibility = ctl.normalizeAccessibility({});
});
afterEach(() => {
  mock.timers.reset();
  document.getElementById = origGet;
  document.addEventListener = origAddListener;
  globalThis.electronAPI = origApi;
});

describe('dispatcher', () => {
  it('dedupes the same action within 150 ms and fires again after 200 ms', () => {
    let n = 0;
    ctl._a11yToggleSpeech = () => { n++; };
    assert.equal(ctl._a11yDispatchAction('speech-toggle'), true);
    mock.timers.tick(100);
    ctl._a11yDispatchAction('speech-toggle');
    assert.equal(n, 1);
    mock.timers.tick(200);
    ctl._a11yDispatchAction('speech-toggle');
    assert.equal(n, 2);
  });
  it('routes each action and returns false for unknown', () => {
    const hits = [];
    const names = { 'tone-toggle': '_a11yToggleTone', 'speak-now': '_a11ySpeakNow', 'describe-meter': '_a11yDescribeMeter', 'peak-hold': '_a11yTogglePeakHold', 'range-cycle': '_a11yCycleRange', 'metric-cycle': '_a11yCycleMetric' };
    for (const [a, m] of Object.entries(names)) ctl[m] = () => hits.push(a);
    ctl._a11yFocusNext = (d) => hits.push(`next${d}`);
    ctl._a11yFocusMeter = (i) => hits.push(`sel${i}`);
    for (const a of Object.keys(names)) { ctl._a11yDispatchAction(a); mock.timers.tick(200); }
    ctl._a11yDispatchAction('meter-next'); mock.timers.tick(200);
    ctl._a11yDispatchAction('meter-prev'); mock.timers.tick(200);
    ctl._a11yDispatchAction('meter-select', 4); mock.timers.tick(200);
    assert.deepEqual(hits, [...Object.keys(names), 'next1', 'next-1', 'sel4']);
    assert.equal(ctl._a11yDispatchAction('bogus'), false);
  });
});

describe('_a11yOnKeydown', () => {
  const evt = () => ({ code: 'KeyS', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, target: { tagName: 'DIV' }, preventDefault() { this.prevented = true; } });
  it('dispatches and prevents default when enabled', () => {
    const calls = [];
    ctl._a11yDispatchAction = (a, arg) => calls.push([a, arg]);
    const e = evt();
    ctl._a11yOnKeydown(e);
    assert.deepEqual(calls, [['speech-toggle', undefined]]);
    assert.equal(e.prevented, true);
  });
  it('ignores everything when shortcuts are disabled', () => {
    ctl.config.accessibility.shortcutsEnabled = false;
    const calls = [];
    ctl._a11yDispatchAction = (a) => calls.push(a);
    const e = evt();
    ctl._a11yOnKeydown(e);
    assert.equal(calls.length, 0);
    assert.equal(e.prevented, undefined);
  });
  it('leaves unrelated keys alone', () => {
    const e = { ...evt(), code: 'KeyL' };
    ctl._a11yOnKeydown(e);
    assert.equal(e.prevented, undefined);
  });
});

describe('focus', () => {
  it('_a11yFocusNext(+1) from B goes to C, announces, persists and marks the card', () => {
    ctl._a11yState().focusedMeterKey = B;
    ctl._a11yFocusNext(1);
    assert.equal(ctl.a11y.focusedMeterKey, C);
    assert.equal(said.at(-1)[0], 'Meter 3 of 3: Charlie');
    assert.equal(ctl.config.accessibility.focusedMeterKey, C);
    const cardC = cards[`meter-card-${ctl.meterSafeId(C)}`];
    const cardB = cards[`meter-card-${ctl.meterSafeId(B)}`];
    assert.equal(cardC.classList.contains('a11y-focused'), true);
    assert.equal(cardC.getAttribute('aria-current'), 'true');
    assert.equal(cardB.classList.contains('a11y-focused'), false);
    assert.equal(cardB.getAttribute('aria-current'), null);
  });
  it('_a11yFocusMeter by 1-based index; out of range announces', () => {
    ctl._a11yFocusMeter(2);
    assert.equal(ctl.a11y.focusedMeterKey, B);
    ctl._a11yFocusMeter(7);
    assert.equal(said.at(-1)[0], 'No meter 7');
    assert.equal(ctl.a11y.focusedMeterKey, B);
  });
  it('focus wraps backwards', () => {
    ctl._a11yState().focusedMeterKey = A;
    ctl._a11yFocusNext(-1);
    assert.equal(ctl.a11y.focusedMeterKey, C);
  });
  it('a focused key missing from the registry falls back to the first connected meter', () => {
    ctl.meterRegistry.get(A).connectionState = 'disconnected';
    ctl._a11yState().focusedMeterKey = 'gone';
    assert.equal(ctl._a11yFocusedKey(), B);
  });
});

describe('toggles and actions', () => {
  it('toggleSpeech persists, announces and speaks the confirmation when turning on', () => {
    ctl._a11yToggleSpeech();
    assert.equal(ctl.config.accessibility.speechEnabled, true);
    assert.equal(said.at(-1)[0], 'Spoken readouts on');
    assert.equal(ctl._a11ySpeak.mock.calls.at(-1).arguments[0], 'Spoken readouts on');
    ctl._a11yToggleSpeech();
    assert.equal(ctl.config.accessibility.speechEnabled, false);
    assert.equal(said.at(-1)[0], 'Spoken readouts off');
    assert.equal(ctl._a11ySpeak.mock.callCount(), 1);
  });
  it('toggleTone persists and starts/stops', () => {
    ctl._a11yToggleTone();
    assert.equal(ctl.config.accessibility.toneEnabled, true);
    assert.equal(ctl.a11y.tone.running, true);
    assert.equal(said.at(-1)[0], 'Tuning tone on');
    ctl._a11yToggleTone();
    assert.equal(ctl.a11y.tone.running, false);
    assert.equal(said.at(-1)[0], 'Tuning tone off');
  });
  it('cycleMetric goes avg, peak, inst, max, avg', () => {
    const seen = [];
    for (let i = 0; i < 4; i++) { ctl._a11yCycleMetric(); seen.push(ctl.config.accessibility.speechMetric); }
    assert.deepEqual(seen, ['peak', 'inst', 'max', 'avg']);
    ctl._a11yCycleMetric();
    assert.equal(said.at(-1)[0], 'Readout metric: PEP');
  });
  it('speakNow speaks the focused readout regardless of mode', () => {
    ctl.config.accessibility.speechMode = 'manual';
    ctl.meterRegistry.get(A).state.lastSnapshotRaw = { avg: '12.5', peak: '20' };
    ctl._a11ySpeakNow();
    assert.equal(ctl._a11ySpeak.mock.calls.at(-1).arguments[0], 'Alpha, average 12.5 watts');
  });
  it('speakNow with no meters says so', () => {
    ctl.meterRegistry.clear();
    ctl._a11ySpeakNow();
    assert.equal(said.at(-1)[0], 'No meter selected');
  });
  it('describeMeter announces and speaks the summary', () => {
    ctl._a11yState().focusedMeterKey = B;
    ctl._a11yDescribeMeter();
    const text = said.at(-1)[0];
    assert.match(text, /^Meter 2 of 3, Bravo, connected, element 100 watts, range 2x, full scale 200 watts, reading average$/);
    assert.equal(ctl._a11ySpeak.mock.calls.at(-1).arguments[0], text);
  });
});

describe('range cycling', () => {
  const setup = () => {
    const sent = [];
    ctl.sendApiCommand = async (key, cmd, f) => { sent.push([key, cmd, f]); return { key: f.key, val: f.val }; };
    ctl._updateGaugeScale = () => {};
    return sent;
  };
  it('rangeCfg 1 sends 2 and announces the new full scale', async () => {
    const sent = setup();
    ctl._a11yState().focusedMeterKey = A;
    await ctl._a11yCycleRange();
    assert.deepEqual(sent[0], [A, 'cfg.set', { key: 'range', val: '2' }]);
    assert.equal(said.at(-1)[0], 'Range 4x, full scale 400 watts');
  });
  it('rangeCfg 2 wraps to 0 and announces Range 1x', async () => {
    const sent = setup();
    ctl.meterRegistry.get(A).rangeCfg = 2;
    ctl.meterRegistry.get(A).rangeMultiplier = 4;
    ctl._a11yState().focusedMeterKey = A;
    await ctl._a11yCycleRange();
    assert.equal(sent[0][2].val, '0');
    assert.match(said.at(-1)[0], /Range 1x/);
    assert.match(said.at(-1)[0], /full scale 100 watts/);
  });
  it('announces when there is no meter', async () => {
    ctl.meterRegistry.clear();
    await ctl._a11yCycleRange();
    assert.equal(said.at(-1)[0], 'No meter selected');
  });
});

describe('setupAccessibility', () => {
  it('wires keydown, menu channels, screen reader detection, and starts the tone', async () => {
    const listeners = {};
    document.addEventListener = (t, fn) => { listeners[t] = fn; };
    const menu = {}; let srCb;
    globalThis.electronAPI = {
      onMenuAction: (ch, cb) => { menu[ch] = cb; },
      getAccessibilitySupport: async () => 1,
      onAccessibilitySupportChanged: (cb) => { srCb = cb; },
    };
    ctl.config.accessibility = ctl.normalizeAccessibility({ toneEnabled: true, focusedMeterKey: B });
    ctl.setupAccessibility();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(ctl.a11y.focusedMeterKey, B);
    assert.equal(typeof listeners.keydown, 'function');
    for (const ch of ['speech-toggle', 'tone-toggle', 'speak-now', 'describe-meter', 'peak-hold', 'range-cycle', 'metric-cycle', 'meter-next', 'meter-prev', 'meter-select']) {
      assert.equal(typeof menu[`menu-a11y-${ch}`], 'function', ch);
    }
    assert.equal(ctl.a11y.screenReader, true);
    srCb(false);
    assert.equal(ctl.a11y.screenReader, false);
    assert.equal(ctl.a11y.tone.running, true);
    let got;
    ctl._a11yDispatchAction = (a, arg) => { got = [a, arg]; };
    menu['menu-a11y-meter-select'](3);
    assert.deepEqual(got, ['meter-select', 3]);
  });
  it('tolerates a missing bridge', () => {
    globalThis.electronAPI = {};
    document.addEventListener = () => {};
    ctl.setupAccessibility();
  });
});
