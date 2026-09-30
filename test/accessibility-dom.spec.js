'use strict';
const { describe, it, before, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub, makeElement } = require('./helpers/renderer-harness');

const KEY = 'usbmodem:A';
let ctl; let rec; let els; let origGet; let said;

before(() => { loadRenderer(); origGet = document.getElementById; });

function spanEl() {
  const writes = []; let text = '';
  return { get textContent() { return text; }, set textContent(v) { text = v; writes.push(v); }, writes };
}

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  rec = { key: KEY, friendlyName: 'Bench A', elementRating: 100, rangeMultiplier: 2, state: { history: [1, 2, 3] } };
  ctl = makeControlStub({ config: { meterCards: {}, accessibility: {} } });
  ctl.meterRegistry.set(KEY, rec);
  els = {};
  const sid = ctl.meterSafeId(KEY);
  for (const id of [`meter-${sid}-gauge-sr-L`, `meter-${sid}-gauge-sr-R`, `meter-${sid}-history-sr`]) els[id] = spanEl();
  document.getElementById = (id) => els[id] || null;
  said = [];
  ctl.announce = (t, o) => said.push([t, o]);
});
afterEach(() => { mock.timers.reset(); document.getElementById = origGet; });

const sr = (s) => els[`meter-${ctl.meterSafeId(KEY)}-${s}`];
const snap = (o) => ({ avg: '12.5', peak: '100', ...o });

describe('_a11yUpdateGaugeText', () => {
  it('writes L (avg) and R (peak) strings and the history summary', () => {
    ctl._a11yUpdateGaugeText(KEY, snap());
    assert.equal(sr('gauge-sr-L').textContent, 'AVG 12.5 watts of 200 watts full scale');
    assert.equal(sr('gauge-sr-R').textContent, 'PEAK 100 watts of 200 watts full scale');
    assert.equal(sr('history-sr').textContent, 'History graph, 3 samples over 30 seconds');
  });
  it('honours per-gauge metrics and the history window', () => {
    rec.gaugeMetricL = 'inst';
    ctl.config.meterCards[KEY] = { historyWindowMs: 120000 };
    ctl._a11yUpdateGaugeText(KEY, snap({ inst: '0.5' }));
    assert.equal(sr('gauge-sr-L').textContent, 'INST 500 milliwatts of 200 watts full scale');
    assert.match(sr('history-sr').textContent, /over 2 minutes$/);
  });
  it('throttles to 500 ms per meter', () => {
    ctl._a11yUpdateGaugeText(KEY, snap({ avg: '1' }));
    mock.timers.tick(100);
    ctl._a11yUpdateGaugeText(KEY, snap({ avg: '2' }));
    assert.equal(sr('gauge-sr-L').writes.length, 1);
    mock.timers.tick(500);
    ctl._a11yUpdateGaugeText(KEY, snap({ avg: '3' }));
    assert.equal(sr('gauge-sr-L').writes.length, 2);
    assert.equal(sr('gauge-sr-L').textContent, 'AVG 3 watts of 200 watts full scale');
  });
  it('skips unchanged text', () => {
    ctl._a11yUpdateGaugeText(KEY, snap());
    mock.timers.tick(600);
    ctl._a11yUpdateGaugeText(KEY, snap());
    assert.equal(sr('gauge-sr-L').writes.length, 1);
    assert.equal(sr('gauge-sr-R').writes.length, 1);
    assert.equal(sr('history-sr').writes.length, 1);
  });
  it('tolerates missing elements and unknown meters', () => {
    els = {};
    ctl._a11yUpdateGaugeText(KEY, snap());
    ctl._a11yUpdateGaugeText('nope', snap());
  });
});

describe('console appenders', () => {
  for (const [fn, id] of [['appendOutput', 'output-console'], ['appendSerialMonitor', 'serial-monitor-output']]) {
    it(`${fn} appends one div per message and leaves earlier ones untouched`, () => {
      const box = makeElement('div');
      els[id] = box;
      const real = globalThis.DWMControl.prototype[fn];
      real.call(ctl, 'first');
      const firstChild = box.children[0];
      real.call(ctl, 'second');
      assert.equal(box.children.length, 2);
      assert.equal(box.children[0], firstChild);
      assert.match(firstChild.textContent, /^\[.+\] first$/);
      assert.match(box.children[1].textContent, /second$/);
      assert.equal(firstChild.tagName, 'DIV');
      assert.equal(firstChild.className, 'console-line');
      assert.equal(box.textContent, '');
    });
  }
  it('clearSerialMonitor empties via replaceChildren', () => {
    const box = makeElement('div');
    els['serial-monitor-output'] = box;
    globalThis.DWMControl.prototype.appendSerialMonitor.call(ctl, 'x');
    globalThis.DWMControl.prototype.clearSerialMonitor.call(ctl);
    assert.equal(box.children.length, 0);
  });
});

describe('DFU / fit announcements', () => {
  it('announces 25/50/75/100 once each across a ramp', () => {
    for (let p = 0; p <= 100; p += 5) ctl._a11yOnDfuProgress(p, 'x');
    ctl._a11yOnDfuProgress(100, 'x');
    assert.deepEqual(said.map((s) => s[0]), [25, 50, 75, 100].map((m) => `Firmware upload ${m} percent`));
  });
  it('pct 0 resets the tracker', () => {
    ctl._a11yOnDfuProgress(60, '');
    ctl._a11yOnDfuProgress(0, '');
    assert.equal(ctl.a11y.dfuLastPct, 0);
    ctl._a11yOnDfuProgress(30, '');
    assert.equal(said.at(-1)[0], 'Firmware upload 25 percent');
  });
  it('results', () => {
    ctl._a11yOnDfuResult(true, 'Upload complete!');
    assert.deepEqual(said.at(-1), ['Firmware upload complete', undefined]);
    ctl._a11yOnDfuResult(false, 'Upload failed');
    assert.deepEqual(said.at(-1), ['Firmware upload failed: Upload failed', { assertive: true }]);
    assert.equal(ctl.a11y.dfuLastPct, 0);
  });
  it('fit result wording', () => {
    ctl._a11yOnFitResult(0.9991);
    assert.deepEqual(said.at(-1), ['De-embed fit complete, quality 99.9 percent', undefined]);
    ctl._a11yOnFitResult(0.97);
    assert.deepEqual(said.at(-1), ['De-embed fit complete, quality 97 percent low quality', { assertive: true }]);
  });
  it('updateProgressBar sets aria-valuenow and reports progress', () => {
    const bar = makeElement('div');
    els['upload-progress'] = bar;
    const calls = [];
    ctl._a11yOnDfuProgress = (p, m) => calls.push([p, m]);
    globalThis.DWMControl.prototype.updateProgressBar.call(ctl, 140, 'msg');
    assert.equal(bar.getAttribute('aria-valuenow'), '100');
    assert.deepEqual(calls, [[100, 'msg']]);
  });
});
