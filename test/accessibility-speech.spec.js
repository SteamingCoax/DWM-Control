'use strict';
const { describe, it, before, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub } = require('./helpers/renderer-harness');

const A = 'usbmodem:A';
const B = 'usbmodem:B';
let ctl; let recA; let recB; let origSpeech;

before(() => { loadRenderer(); origSpeech = globalThis.speechSynthesis; });

const rec = (key, name, extra = {}) => ({
  key, friendlyName: name, connectionState: 'connected', elementRating: 100, rangeMultiplier: 2, rangeCfg: 1, state: { history: [] }, ...extra,
});
const snap = (w) => ({ inst: String(w), avg: String(w), peak: String(w), max: String(w), min: '0', dev: '0' });

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  globalThis.speechSynthesis = origSpeech;
  origSpeech.spoken.length = 0;
  origSpeech.cancelCount = 0;
  origSpeech.voices = [];
  ctl = makeControlStub({
    config: { meterCardOrder: [A, B], swrCards: [], accessibility: { speechEnabled: true, speechMode: 'interval', speechIntervalS: 5, speechMinGapMs: 0, speechMetric: 'avg', speechIncludeMeterName: true, speechIncludeSwr: true, speechRate: 1.5, speechVolume: 0.5, speechVoice: '', toneEnabled: false } },
  });
  recA = rec(A, 'Bench A');
  recB = rec(B, 'Bench B');
  ctl.meterRegistry.set(A, recA);
  ctl.meterRegistry.set(B, recB);
  ctl._a11yUpdateGaugeText = () => {};
});
afterEach(() => { mock.timers.reset(); globalThis.speechSynthesis = origSpeech; });

describe('_a11ySpeak', () => {
  it('cancels before speaking and applies rate, volume, voice', () => {
    const voice = { voiceURI: 'v2', name: 'Two' };
    origSpeech.voices = [{ voiceURI: 'v1' }, voice];
    ctl.config.accessibility.speechVoice = 'v2';
    assert.equal(ctl._a11ySpeak('hi'), true);
    assert.equal(origSpeech.cancelCount, 1);
    const u = origSpeech.spoken[0];
    assert.equal(u.text, 'hi');
    assert.equal(u.rate, 1.5);
    assert.equal(u.volume, 0.5);
    assert.equal(u.voice, voice);
    ctl._a11ySpeak('again');
    assert.equal(origSpeech.cancelCount, 2);
  });
  it('returns false without throwing when speechSynthesis is missing', () => {
    delete globalThis.speechSynthesis;
    assert.equal(ctl._a11ySpeak('x'), false);
  });
});

describe('focus and order', () => {
  it('_a11yMeterOrder follows config order then registry extras', () => {
    const C = 'usbmodem:C';
    ctl.meterRegistry.set(C, rec(C, 'C'));
    assert.deepEqual(ctl._a11yMeterOrder(), [A, B, C]);
  });
  it('_a11yFocusedKey keeps a valid key', () => {
    ctl._a11yState().focusedMeterKey = B;
    assert.equal(ctl._a11yFocusedKey(), B);
  });
  it('falls back to the first connected meter and stores it', () => {
    recA.connectionState = 'disconnected';
    ctl._a11yState().focusedMeterKey = 'gone';
    assert.equal(ctl._a11yFocusedKey(), B);
    assert.equal(ctl.a11y.focusedMeterKey, B);
  });
  it('falls back to first key when none connected; null when empty', () => {
    recA.connectionState = 'disconnected';
    recB.connectionState = 'disconnected';
    assert.equal(ctl._a11yFocusedKey(), A);
    ctl.meterRegistry.clear();
    ctl.a11y.focusedMeterKey = null;
    assert.equal(ctl._a11yFocusedKey(), null);
  });
});

describe('_a11ySwrForMeter', () => {
  it('computes from the two meters last snapshots', () => {
    ctl.config.swrCards = [{ id: 's', fwdKey: A, refKey: B, fwdMetric: 'avg', refMetric: 'avg' }];
    recA.state.lastSnapshotRaw = { avg: '100' };
    recB.state.lastSnapshotRaw = { avg: '4' };
    // gamma 0.2 -> SWR 1.5
    assert.ok(Math.abs(ctl._a11ySwrForMeter(A) - 1.5) < 1e-9);
    assert.equal(ctl._a11ySwrForMeter(B), null);
  });
});

describe('_a11yOnSnapshot', () => {
  it('speaks the average by default for the focused meter', () => {
    ctl._a11yOnSnapshot(A, snap(12.5));
    assert.equal(origSpeech.spoken.length, 1);
    assert.equal(origSpeech.spoken[0].text, 'Bench A, average 12.5 watts');
  });
  it("speaks 'PEP' when speechMetric is peak", () => {
    ctl.config.accessibility.speechMetric = 'peak';
    ctl._a11yOnSnapshot(A, snap(12.5));
    assert.match(origSpeech.spoken[0].text, /PEP 12.5 watts/);
  });
  it('appends SWR when available', () => {
    ctl.config.swrCards = [{ id: 's', fwdKey: A, refKey: B }];
    recA.state.lastSnapshotRaw = { avg: '100' };
    recB.state.lastSnapshotRaw = { avg: '4' };
    ctl._a11yOnSnapshot(A, snap(100));
    assert.match(origSpeech.spoken[0].text, /SWR 1\.5 to 1$/);
  });
  it('never speaks for a non-focused meter', () => {
    ctl._a11yState().focusedMeterKey = A;
    ctl._a11yOnSnapshot(B, snap(12.5));
    assert.equal(origSpeech.spoken.length, 0);
  });
  it('calls the gauge text updater for every meter', () => {
    ctl._a11yUpdateGaugeText = mock.fn();
    ctl._a11yState().focusedMeterKey = A;
    ctl._a11yOnSnapshot(B, snap(1));
    assert.equal(ctl._a11yUpdateGaugeText.mock.callCount(), 1);
  });
  it('interval mode: 100 ms apart is one utterance, 5 s later another', () => {
    ctl._a11yOnSnapshot(A, snap(10));
    mock.timers.tick(100);
    ctl._a11yOnSnapshot(A, snap(10));
    assert.equal(origSpeech.spoken.length, 1);
    mock.timers.tick(5000);
    ctl._a11yOnSnapshot(A, snap(10));
    assert.equal(origSpeech.spoken.length, 2);
  });
  it('does not speak when speech is disabled; never throws', () => {
    ctl.config.accessibility.speechEnabled = false;
    ctl._a11yOnSnapshot(A, snap(10));
    assert.equal(origSpeech.spoken.length, 0);
    ctl._a11yOnSnapshot('missing', null);
    ctl.meterRegistry = null;
    ctl._a11yOnSnapshot(A, snap(1));
  });
  it('peak hold latches the highest value until toggled off', () => {
    ctl.config.accessibility.speechIntervalS = 0;
    ctl._a11yTogglePeakHold();
    ctl._a11yOnSnapshot(A, snap(10));
    ctl._a11yOnSnapshot(A, snap(30));
    ctl._a11yOnSnapshot(A, snap(5));
    assert.match(origSpeech.spoken[2].text, /peak hold average 30 watts/);
    ctl._a11yTogglePeakHold();
    assert.equal(recA.state.a11yPeakLatchW, undefined);
    ctl._a11yOnSnapshot(A, snap(5));
    const last = origSpeech.spoken[origSpeech.spoken.length - 1].text;
    assert.match(last, /average 5 watts/);
    assert.doesNotMatch(last, /peak hold/);
  });
});
