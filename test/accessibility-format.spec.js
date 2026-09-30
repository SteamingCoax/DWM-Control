'use strict';
// Pure helpers in renderer/modules/accessibility.js (no DOM, no `this`).
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer } = require('./helpers/renderer-harness');

let P;
before(() => { loadRenderer(); P = globalThis.DWMControl.prototype; });

describe('_a11yFormatSpokenPower', () => {
  it('handles non-finite, zero, one, milli, watts, kilo', () => {
    assert.equal(P._a11yFormatSpokenPower(NaN), 'no reading');
    assert.equal(P._a11yFormatSpokenPower(Infinity), 'no reading');
    assert.equal(P._a11yFormatSpokenPower(0), '0 watts');
    assert.equal(P._a11yFormatSpokenPower(1), '1 watt');
    assert.equal(P._a11yFormatSpokenPower(0.85), '850 milliwatts');
    assert.equal(P._a11yFormatSpokenPower(12.5), '12.5 watts');
    assert.equal(P._a11yFormatSpokenPower(100), '100 watts');
    assert.equal(P._a11yFormatSpokenPower(12.3456), '12.3 watts');
    assert.equal(P._a11yFormatSpokenPower(1230), '1.23 kilowatts');
  });
});

describe('_a11yFormatSpokenSwr', () => {
  it('formats', () => {
    assert.equal(P._a11yFormatSpokenSwr(NaN), 'SWR unknown');
    assert.equal(P._a11yFormatSpokenSwr(0), 'SWR unknown');
    assert.equal(P._a11yFormatSpokenSwr(99), 'SWR infinite');
    assert.equal(P._a11yFormatSpokenSwr(999), 'SWR infinite');
    assert.equal(P._a11yFormatSpokenSwr(1.26), 'SWR 1.3 to 1');
    assert.equal(P._a11yFormatSpokenSwr(1), 'SWR 1.0 to 1');
  });
});

describe('_a11yFormatSpokenNumber / metric names', () => {
  it('formats numbers', () => {
    assert.equal(P._a11yFormatSpokenNumber(-20, 'dBm'), 'minus 20 dBm');
    assert.equal(P._a11yFormatSpokenNumber(12.345, 'dB'), '12.3 dB');
  });
  it('names metrics', () => {
    const n = (m) => P._a11yMetricSpokenName(m);
    assert.deepEqual(['avg', 'peak', 'inst', 'max', 'min', 'dev', 'zzz'].map(n),
      ['average', 'PEP', 'instantaneous', 'maximum', 'minimum', 'deviation', 'zzz']);
  });
});

describe('_a11yBuildReadout', () => {
  it('builds text variants', () => {
    const b = (o) => P._a11yBuildReadout(o);
    assert.equal(b({ meterName: 'Bench A', metric: 'avg', watts: 12.5, includeName: true }), 'Bench A, average 12.5 watts');
    assert.equal(b({ meterName: 'Bench A', metric: 'avg', watts: 12.5, includeName: false }), 'average 12.5 watts');
    assert.equal(b({ meterName: 'Bench A', metric: 'avg', watts: 12.5, swr: 1.3, includeName: true, includeSwr: true }), 'Bench A, average 12.5 watts, SWR 1.3 to 1');
    assert.equal(b({ meterName: 'Bench A', metric: 'avg', watts: 12.5, swr: NaN, includeSwr: true, includeName: true }), 'Bench A, average 12.5 watts');
    assert.equal(b({ meterName: 'Bench A', metric: 'avg', watts: 30, peakHold: true, includeName: true }), 'Bench A, peak hold average 30 watts');
  });
});

describe('_a11yToneFrequency', () => {
  it('maps power to frequency', () => {
    const f = (...a) => P._a11yToneFrequency(...a);
    assert.equal(f(0, 200, 100, 1000), 100);
    assert.equal(f(100, 200, 100, 1000), 550);
    assert.equal(f(200, 200, 100, 1000), 1000);
    assert.equal(f(400, 200, 100, 1000), 1000);
    assert.equal(f(50, 0, 100, 1000), 100);
    assert.equal(f(50, NaN, 100, 1000), 100);
  });
});

describe('_a11yShouldSpeak', () => {
  const cfg = (o) => ({ speechMode: 'interval', speechIntervalS: 5, speechChangePct: 10, speechMinGapMs: 1000, ...o });
  it('manual never speaks', () => {
    assert.equal(P._a11yShouldSpeak({ lastSpokenAt: 0, lastSpokenW: null }, 1e6, cfg({ speechMode: 'manual' }), 5, 100), false);
  });
  it('interval', () => {
    const s = (t) => ({ lastSpokenAt: t, lastSpokenW: null });
    assert.equal(P._a11yShouldSpeak(s(0), 10, cfg(), 5, 100), true);
    assert.equal(P._a11yShouldSpeak(s(10_000), 12_000, cfg(), 5, 100), false);
    assert.equal(P._a11yShouldSpeak(s(10_000), 15_000, cfg(), 5, 100), true);
  });
  it('min gap blocks', () => {
    assert.equal(P._a11yShouldSpeak({ lastSpokenAt: 10_000, lastSpokenW: 0 }, 10_500, cfg({ speechMode: 'change' }), 100, 100), false);
  });
  it('change', () => {
    const c = cfg({ speechMode: 'change' });
    assert.equal(P._a11yShouldSpeak({ lastSpokenAt: 0, lastSpokenW: null }, 5, c, 1, 100), true);
    assert.equal(P._a11yShouldSpeak({ lastSpokenAt: 1, lastSpokenW: 50 }, 5000, c, 55, 100), false);
    assert.equal(P._a11yShouldSpeak({ lastSpokenAt: 1, lastSpokenW: 50 }, 5000, c, 60, 100), true);
    assert.equal(P._a11yShouldSpeak({ lastSpokenAt: 1, lastSpokenW: 50 }, 5000, c, 50.05, 0), false);
    assert.equal(P._a11yShouldSpeak({ lastSpokenAt: 1, lastSpokenW: 50 }, 5000, c, 50.2, 0), true);
  });
});

describe('_a11yActionForKey', () => {
  const k = (o) => ({ ctrlKey: true, shiftKey: true, metaKey: false, altKey: false, target: { tagName: 'DIV' }, ...o });
  const a = (e) => P._a11yActionForKey(e);
  it('maps chords', () => {
    assert.deepEqual(a(k({ code: 'KeyS' })), { action: 'speech-toggle', arg: undefined });
    assert.equal(a(k({ code: 'KeyS', ctrlKey: false, metaKey: true })).action, 'speech-toggle');
    assert.equal(a(k({ code: 'KeyT' })).action, 'tone-toggle');
    assert.equal(a(k({ code: 'KeyR' })).action, 'speak-now');
    assert.equal(a(k({ code: 'KeyD' })).action, 'describe-meter');
    assert.equal(a(k({ code: 'KeyP' })).action, 'peak-hold');
    assert.equal(a(k({ code: 'KeyM' })).action, 'range-cycle');
    assert.equal(a(k({ code: 'KeyA' })).action, 'metric-cycle');
    assert.equal(a(k({ code: 'ArrowRight' })).action, 'meter-next');
    assert.equal(a(k({ code: 'ArrowLeft' })).action, 'meter-prev');
    assert.deepEqual(a(k({ code: 'Digit3' })), { action: 'meter-select', arg: 3 });
  });
  it('falls back to key', () => {
    assert.equal(a(k({ key: 'S' })).action, 'speech-toggle');
    assert.deepEqual(a(k({ key: '8' })), { action: 'meter-select', arg: 8 });
  });
  it('rejects', () => {
    assert.equal(a(k({ code: 'KeyS', shiftKey: false })), null);
    assert.equal(a({ key: 's', target: null }), null);
    assert.equal(a(k({ code: 'KeyS', altKey: true })), null);
    assert.equal(a(k({ code: 'KeyS', target: { tagName: 'INPUT' } })), null);
    assert.equal(a(k({ code: 'KeyS', target: { tagName: 'DIV', isContentEditable: true } })), null);
    assert.equal(a(k({ code: 'KeyL' })), null);
    assert.equal(a(k({ code: 'Digit9' })), null);
  });
});

describe('_a11yDfuMilestone', () => {
  it('finds crossed milestones', () => {
    const m = (a, b) => P._a11yDfuMilestone(a, b);
    assert.equal(m(40, 55), 50);
    assert.equal(m(50, 55), null);
    assert.equal(m(99, 100), 100);
    assert.equal(m(0, 100), 100);
    assert.equal(m(0, 10), null);
  });
});

describe('_a11yNextMeterKey', () => {
  it('cycles with wrap and appends unordered keys', () => {
    const n = (...a) => P._a11yNextMeterKey(...a);
    const reg = new Map([['A', 1], ['B', 1], ['C', 1], ['D', 1]]);
    assert.equal(n(['A', 'B', 'C'], reg, 'B', 1), 'C');
    assert.equal(n(['A', 'B', 'C'], reg, 'C', 1), 'D');
    assert.equal(n(['A', 'B', 'C'], reg, 'D', 1), 'A');
    assert.equal(n(['A', 'B', 'C'], reg, 'A', -1), 'D');
    assert.equal(n(['A', 'Z', 'B'], new Set(['A', 'B']), 'A', 1), 'B');
    assert.equal(n(['A', 'B'], reg, 'nope', 1), 'A');
    assert.equal(n(['A', 'B'], reg, 'nope', -1), 'D');
    assert.equal(n([], new Map(), 'A', 1), null);
  });
});
