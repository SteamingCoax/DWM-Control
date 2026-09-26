'use strict';
// History buffer used by the history graph (control-history.js).
const { describe, it, before, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub } = require('./helpers/renderer-harness');

const KEY = 'usbmodem:TEST1';
let ctl;
let record;

before(() => loadRenderer());

beforeEach(() => {
  ctl = makeControlStub();
  record = { key: KEY, portPath: '/dev/tty.usbmodemTEST1', state: ctl.createMeterState() };
  ctl.meterRegistry.set(KEY, record);
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
});

afterEach(() => mock.timers.reset());

const sample = (w) => ({ inst: w, avg: w, peak: w, max: w, min: w, dev: w });

describe('_pushMeterHistory', () => {
  it('appends a timestamped sample with every metric parsed as a number', () => {
    ctl._pushMeterHistory(KEY, { inst: '1.5', avg: '2', peak: '3.25', max: '4', min: '0.5', dev: '0.1' });
    assert.deepEqual(record.state.history, [
      { t: 1_000_000, inst: 1.5, avg: 2, peak: 3.25, max: 4, min: 0.5, dev: 0.1 },
    ]);
  });

  it('treats missing or non-numeric values as 0 and clamps negatives to 0', () => {
    ctl._pushMeterHistory(KEY, { inst: 'abc', avg: -5 });
    const [p] = record.state.history;
    assert.equal(p.inst, 0);
    assert.equal(p.avg, 0);
    assert.equal(p.peak, 0);
  });

  it('clips every metric to maxPowerW when one is given', () => {
    ctl._pushMeterHistory(KEY, { inst: 150, avg: 50, peak: 200, max: 99, min: -1, dev: 1 }, 100);
    const [p] = record.state.history;
    assert.deepEqual([p.inst, p.avg, p.peak, p.max, p.min, p.dev], [100, 50, 100, 99, 0, 1]);
  });

  it('does not clip when maxPowerW is 0', () => {
    ctl._pushMeterHistory(KEY, sample(5000), 0);
    assert.equal(record.state.history[0].peak, 5000);
  });

  it('keeps samples up to 2x historyWindowMs old and drops anything older', () => {
    record.state.historyWindowMs = 1000;
    ctl._pushMeterHistory(KEY, sample(1));      // t = 1_000_000
    mock.timers.tick(1500);
    ctl._pushMeterHistory(KEY, sample(2));      // t = 1_001_500 (first sample 1.5 windows old: kept)
    assert.equal(record.state.history.length, 2);
    mock.timers.tick(600);
    ctl._pushMeterHistory(KEY, sample(3));      // t = 1_002_100 (first sample 2.1 windows old: dropped)
    assert.deepEqual(record.state.history.map((p) => p.inst), [2, 3]);
  });

  it('falls back to a 30 s window when historyWindowMs is unset', () => {
    record.state.historyWindowMs = 0;
    ctl._pushMeterHistory(KEY, sample(1));
    mock.timers.tick(59_999);
    ctl._pushMeterHistory(KEY, sample(2));
    assert.equal(record.state.history.length, 2);
    mock.timers.tick(2);
    ctl._pushMeterHistory(KEY, sample(3));
    assert.deepEqual(record.state.history.map((p) => p.inst), [2, 3]);
  });

  it('caps the buffer at 200000 points', () => {
    record.state.history = Array.from({ length: 200000 }, (_, i) => ({ t: 1_000_000, inst: i }));
    ctl._pushMeterHistory(KEY, sample(1));
    assert.equal(record.state.history.length, 200000);
    assert.equal(record.state.history[0].inst, 1);
  });

  it('ignores unknown meters and meters without state', () => {
    assert.doesNotThrow(() => ctl._pushMeterHistory('port:nope', sample(1)));
    ctl.meterRegistry.set('port:bare', { key: 'port:bare' });
    assert.doesNotThrow(() => ctl._pushMeterHistory('port:bare', sample(1)));
  });
});

describe('exportMeterHistory', () => {
  it('warns instead of exporting when fewer than 2 samples exist', () => {
    const statuses = [];
    ctl.setMeterStatus = (key, msg, level) => statuses.push({ key, msg, level });
    ctl._pushMeterHistory(KEY, sample(1));
    ctl.exportMeterHistory(KEY);
    assert.deepEqual(statuses, [{ key: KEY, msg: 'Not enough history samples to export yet.', level: 'warning' }]);
  });

  it('builds a CSV blob and triggers a download named after the meter', () => {
    const blobs = [];
    const anchors = [];
    const statuses = [];
    const origBlob = globalThis.Blob;
    const origURL = globalThis.URL;
    const origCreate = document.createElement;
    globalThis.Blob = class { constructor(parts, opts) { this.text = parts.join(''); this.type = opts.type; blobs.push(this); } };
    globalThis.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL() {} };
    document.createElement = (tag) => {
      const a = { tag, clicked: false, click() { this.clicked = true; }, remove() {} };
      anchors.push(a);
      return a;
    };
    try {
      ctl.setMeterStatus = (key, msg, level) => statuses.push({ msg, level });
      record.friendlyName = 'Shack Meter #1';
      record.state.elementRating = 100;
      record.state.rangeMultiplier = 2;
      ctl._pushMeterHistory(KEY, sample(1));
      mock.timers.tick(250);
      ctl._pushMeterHistory(KEY, sample(2));
      ctl.exportMeterHistory(KEY);
    } finally {
      globalThis.Blob = origBlob;
      globalThis.URL = origURL;
      document.createElement = origCreate;
    }

    assert.equal(blobs.length, 1);
    const lines = blobs[0].text.split('\n');
    assert.equal(lines[0], '# Element Rating: 100 W, Range: 2x');
    assert.equal(lines[1], 'timestamp_iso,epoch_ms,elapsed_ms,inst_w,avg_w,peak_w,max_w,min_w,dev_w,element_rating_w,range_mult');
    assert.equal(lines.length, 4);
    assert.equal(lines[3].split(',')[2], '250');
    assert.equal(lines[3].split(',')[3], '2.000000');
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0].clicked, true);
    assert.match(anchors[0].download, /^Shack_Meter_1-history-.+\.csv$/);
    assert.equal(statuses.at(-1).level, 'ready');
  });
});
