'use strict';
const { describe, it, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub } = require('./helpers/renderer-harness');

let ctl; let origAC;
before(() => { loadRenderer(); origAC = globalThis.AudioContext; });

beforeEach(() => {
  globalThis.AudioContext = origAC;
  origAC.instances.length = 0;
  ctl = makeControlStub({ config: { meterCardOrder: [], accessibility: { toneEnabled: true, toneMinHz: 100, toneMaxHz: 1000, toneVolume: 0.25, toneWave: 'triangle', toneMuteBelowPct: 0, speechEnabled: false } } });
});

describe('tone engine', () => {
  it('creates one context and oscillator across repeated starts', () => {
    assert.equal(ctl._a11yToneStart(), true);
    ctl._a11yToneStart();
    ctl._a11yToneStart();
    assert.equal(origAC.instances.length, 1);
    const { osc, gain, ctx } = ctl.a11y.tone;
    assert.equal(osc.type, 'triangle');
    assert.equal(gain.gain.value, 0.25);
    assert.equal(osc.started, 1);
    assert.equal(osc.connectedTo, gain);
    assert.equal(gain.connectedTo, ctx.destination);
    assert.equal(ctx.state, 'running');
    assert.equal(ctl.a11y.tone.running, true);
  });
  it('returns false without AudioContext', () => {
    delete globalThis.AudioContext;
    assert.equal(ctl._a11yToneStart(), false);
  });
  it('resume is called exactly once per start', () => {
    const resume = mock.method(origAC.prototype, 'resume');
    ctl._a11yToneStart();
    ctl._a11yToneStart();
    assert.equal(resume.mock.callCount(), 1);
    resume.mock.restore();
  });
  it('sets frequency from power', () => {
    ctl._a11yToneStart();
    ctl._a11yToneSet(100, 200);
    assert.equal(ctl.a11y.tone.osc.frequency.value, 550);
    assert.equal(ctl.a11y.tone.gain.gain.value, 0.25);
  });
  it('mutes below the threshold', () => {
    ctl.config.accessibility.toneMuteBelowPct = 1;
    ctl._a11yToneStart();
    ctl._a11yToneSet(1, 200);
    assert.equal(ctl.a11y.tone.gain.gain.value, 0);
    ctl._a11yToneSet(100, 200);
    assert.equal(ctl.a11y.tone.gain.gain.value, 0.25);
  });
  it('set is a no-op when not running', () => {
    ctl._a11yToneSet(100, 200);
    assert.equal(ctl.a11y?.tone?.osc ?? null, null);
  });
  it('stop tears down, twice is safe, and start can reuse the context', () => {
    ctl._a11yToneStart();
    const { osc, gain } = ctl.a11y.tone;
    ctl._a11yToneStop();
    ctl._a11yToneStop();
    assert.equal(osc.stopped, 1);
    assert.equal(osc.disconnected, 1);
    assert.equal(gain.disconnected, 1);
    assert.equal(ctl.a11y.tone.running, false);
    assert.equal(ctl.a11y.tone.osc, null);
    ctl._a11yToneStart();
    assert.equal(origAC.instances.length, 1);
    assert.equal(ctl.a11y.tone.running, true);
  });
  it('snapshot for a non-focused meter does not touch the oscillator', () => {
    const A = 'a'; const B = 'b';
    for (const k of [A, B]) ctl.meterRegistry.set(k, { key: k, friendlyName: k, connectionState: 'connected', elementRating: 100, rangeMultiplier: 1, state: {} });
    ctl.config.meterCardOrder = [A, B];
    ctl._a11yUpdateGaugeText = () => {};
    ctl._a11yToneStart();
    ctl.a11y.focusedMeterKey = A;
    const osc = ctl.a11y.tone.osc;
    ctl._a11yOnSnapshot(B, { avg: '50' });
    assert.equal(osc.frequency.calls.length, 0);
    ctl._a11yOnSnapshot(A, { avg: '50' });
    assert.equal(osc.frequency.calls.length, 1);
    assert.equal(osc.frequency.value, 550);
  });
});
