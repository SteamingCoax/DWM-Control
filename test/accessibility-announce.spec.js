'use strict';
const { describe, it, before, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub } = require('./helpers/renderer-harness');

let ctl; let els; let origGet;
before(() => { loadRenderer(); origGet = document.getElementById; });

function liveEl() {
  let text = '';
  const writes = [];
  return { get textContent() { return text; }, set textContent(v) { text = v; writes.push(v); }, writes };
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  els = { 'a11y-status': liveEl(), 'a11y-alert': liveEl() };
  document.getElementById = (id) => els[id] || null;
  ctl = makeControlStub({ config: { accessibility: { announcements: 'live-region', speechEnabled: false } } });
  ctl._a11ySpeak = mock.fn(() => true);
});
afterEach(() => { mock.timers.reset(); document.getElementById = origGet; });

const cfg = (o) => { ctl.config.accessibility = { ...ctl.config.accessibility, ...o }; };

describe('_a11yState', () => {
  it('lazily creates a stable state object', () => {
    const s = ctl._a11yState();
    assert.equal(ctl._a11yState(), s);
    assert.equal(s.focusedMeterKey, null);
    assert.equal(s.peakHold, false);
    assert.deepEqual(s.speech, { lastSpokenAt: 0, lastSpokenW: null });
    assert.equal(s.tone.running, false);
    assert.equal(s.screenReader, null);
    assert.equal(s.dfuLastPct, 0);
  });
});

describe('announce', () => {
  it('polite goes to the status region after the window, clearing first', () => {
    ctl.announce('hello');
    assert.deepEqual(els['a11y-status'].writes, ['']);
    mock.timers.tick(400);
    assert.deepEqual(els['a11y-status'].writes, ['', 'hello']);
    assert.deepEqual(els['a11y-alert'].writes, []);
  });
  it('assertive goes to the alert region', () => {
    ctl.announce('uh oh', { assertive: true });
    mock.timers.tick(400);
    assert.equal(els['a11y-alert'].textContent, 'uh oh');
    assert.equal(els['a11y-status'].textContent, '');
  });
  it('coalesces calls within the window, latest wins', () => {
    ctl.announce('one');
    mock.timers.tick(100);
    ctl.announce('two');
    mock.timers.tick(400);
    assert.equal(els['a11y-status'].writes.filter((w) => w !== '').length, 1);
    assert.equal(els['a11y-status'].textContent, 'two');
  });
  it('identical strings 500 ms apart both land', () => {
    ctl.announce('same');
    mock.timers.tick(500);
    ctl.announce('same');
    assert.equal(els['a11y-status'].textContent, '');
    mock.timers.tick(400);
    assert.equal(els['a11y-status'].writes.filter((w) => w === 'same').length, 2);
  });
  it('does not throw when regions are missing', () => {
    els = {};
    ctl.announce('x');
    mock.timers.tick(500);
  });
});

describe('announce routing', () => {
  const run = () => { ctl.announce('msg'); mock.timers.tick(500); };
  it("'speech' + speechEnabled speaks only", () => {
    cfg({ announcements: 'speech', speechEnabled: true });
    run();
    assert.equal(ctl._a11ySpeak.mock.callCount(), 1);
    assert.equal(ctl._a11ySpeak.mock.calls[0].arguments[0], 'msg');
    assert.deepEqual(els['a11y-status'].writes, []);
  });
  it("'auto' + screenReader true uses live region only", () => {
    cfg({ announcements: 'auto', speechEnabled: true });
    ctl._a11yState().screenReader = true;
    run();
    assert.equal(ctl._a11ySpeak.mock.callCount(), 0);
    assert.equal(els['a11y-status'].textContent, 'msg');
  });
  it("'auto' + screenReader false + speechEnabled speaks only", () => {
    cfg({ announcements: 'auto', speechEnabled: true });
    ctl._a11yState().screenReader = false;
    run();
    assert.equal(ctl._a11ySpeak.mock.callCount(), 1);
    assert.deepEqual(els['a11y-status'].writes, []);
  });
  it("'auto' + screenReader null uses live region", () => {
    cfg({ announcements: 'auto', speechEnabled: true });
    run();
    assert.equal(els['a11y-status'].textContent, 'msg');
    assert.equal(ctl._a11ySpeak.mock.callCount(), 0);
  });
  it("'both' does both", () => {
    cfg({ announcements: 'both' });
    run();
    assert.equal(ctl._a11ySpeak.mock.callCount(), 1);
    assert.equal(els['a11y-status'].textContent, 'msg');
  });
});
