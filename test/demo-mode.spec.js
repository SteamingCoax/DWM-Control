'use strict';
// Demo mode (renderer/modules/demo.js): two simulated meters that answer every API
// command the app sends, so the Control tab can be shown without hardware.
const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub } = require('./helpers/renderer-harness');

let P;
before(() => {
  loadRenderer();
  P = globalThis.DWMControl.prototype;
});

// Sample a generator every stepMs for durationMs and return the readings.
function run(signal, durationMs, stepMs = 100, t0 = 0) {
  const out = [];
  for (let t = t0; t <= t0 + durationMs; t += stepMs) out.push(signal.sample(t));
  return out;
}

function makeModel(profile = 'steady', seed = 1) {
  return P._demoCreateModel(profile, seed);
}

describe('demo PRNG', () => {
  it('is deterministic for a seed and stays in [0,1)', () => {
    const a = P._demoRng(42);
    const b = P._demoRng(42);
    const c = P._demoRng(43);
    const sa = Array.from({ length: 50 }, () => a());
    const sb = Array.from({ length: 50 }, () => b());
    const sc = Array.from({ length: 50 }, () => c());
    assert.deepEqual(sa, sb);
    assert.notDeepEqual(sa, sc);
    for (const v of sa) assert.ok(v >= 0 && v < 1);
  });
});

describe('demo signal generators', () => {
  it('seeded generators are deterministic', () => {
    assert.deepEqual(run(P._demoCreateSignal('voice', 7), 3000), run(P._demoCreateSignal('voice', 7), 3000));
    assert.deepEqual(run(P._demoCreateSignal('steady', 7), 3000), run(P._demoCreateSignal('steady', 7), 3000));
  });

  it('steady carrier stays within 49-51 W with peak >= avg', () => {
    const samples = run(P._demoCreateSignal('steady', 3), 10_000);
    for (const s of samples) {
      for (const m of ['inst', 'avg', 'peak']) assert.ok(s[m] >= 49 && s[m] <= 51, `${m}=${s[m]}`);
      assert.ok(s.peak >= s.avg - 1e-9);
      assert.ok(Number.isFinite(s.dev) && s.dev >= 0 && s.dev < 1);
    }
  });

  it('voice envelope has PEP well above average and real gaps between bursts', () => {
    const samples = run(P._demoCreateSignal('voice', 11), 10_000);
    const settled = samples.slice(10); // ignore the first second while the avg window fills
    const sumPeak = settled.reduce((a, s) => a + s.peak, 0);
    const sumAvg = settled.reduce((a, s) => a + s.avg, 0);
    assert.ok(sumPeak > 1.5 * sumAvg, `peak ${sumPeak} vs avg ${sumAvg}`);
    assert.ok(samples.some(s => s.inst < 5), 'never quiet between syllables');
    assert.ok(samples.some(s => s.inst > 20), 'never reached a burst');
  });

  it('max >= peak >= inst >= 0 and min <= inst, dev finite', () => {
    for (const profile of ['steady', 'voice']) {
      for (const s of run(P._demoCreateSignal(profile, 5), 5000, 37)) {
        assert.ok(s.inst >= 0);
        assert.ok(s.peak >= s.inst - 1e-9, `${profile} peak ${s.peak} < inst ${s.inst}`);
        assert.ok(s.max >= s.peak - 1e-9);
        assert.ok(s.min <= s.inst + 1e-9);
        assert.ok(Number.isFinite(s.dev));
      }
    }
  });

  it('keeps its internal history bounded', () => {
    const sig = P._demoCreateSignal('voice', 2);
    run(sig, 120_000, 50);
    assert.ok(sig._historyLength() <= 2100, `history ${sig._historyLength()}`);
  });
});

describe('_demoResponseFor', () => {
  const D_KEYS = ['inst', 'avg', 'peak', 'max', 'min', 'dev', 'pvolt', 'svolt'];

  it('pwr.snap returns a compact d of 8 finite numbers plus elem/etype/eval/range', () => {
    const r = P._demoResponseFor(makeModel(), 'pwr.snap', {}, 1000);
    assert.equal(r.status, 'ok');
    assert.equal(r.cmd, 'pwr.snap');
    const d = r.d.split(',');
    assert.equal(d.length, D_KEYS.length);
    d.forEach(v => assert.ok(Number.isFinite(Number.parseFloat(v)), v));
    assert.equal(r.elem, '1');
    assert.equal(r.etype, '30ua');
    assert.equal(Number.parseFloat(r.eval), 100);
    assert.deepEqual(P._normalizeRange(r.range), { cfg: 0, multiplier: 1, label: '1x' });
  });

  it('cfg.set range=2 echoes {key,val} and the next pwr.snap reports 4x', () => {
    const m = makeModel();
    const set = P._demoResponseFor(m, 'cfg.set', { key: 'range', val: '2' }, 0);
    assert.equal(set.key, 'range');
    assert.equal(P._normalizeRange(set.val).cfg, 2);
    const snap = P._demoResponseFor(m, 'pwr.snap', {}, 100);
    assert.deepEqual(P._normalizeRange(snap.range), { cfg: 2, multiplier: 4, label: '4x' });
    assert.equal(P._demoResponseFor(m, 'cfg.get', { key: 'range' }, 200).val, '2');
  });

  it('cfg.set round-trips bright, avgw, elem, eval and etype', () => {
    const m = makeModel();
    assert.equal(P._demoResponseFor(m, 'cfg.set', { key: 'bright', val: '3' }, 0).val, '3');
    assert.equal(P._demoResponseFor(m, 'cfg.get', { key: 'bright' }, 0).val, '3');
    P._demoResponseFor(m, 'cfg.set', { key: 'avgw', val: '2.5' }, 0);
    assert.equal(Number.parseFloat(P._demoResponseFor(m, 'cfg.get', { key: 'avgw' }, 0).val), 2.5);
    P._demoResponseFor(m, 'cfg.set', { key: 'eval', elem: 3, val: '250' }, 0);
    P._demoResponseFor(m, 'cfg.set', { key: 'etype', elem: 3, val: '100ua' }, 0);
    P._demoResponseFor(m, 'cfg.set', { key: 'elem', val: '3' }, 0);
    const info = P._demoResponseFor(m, 'pwr.info', {}, 0);
    assert.equal(info.elem, '3');
    assert.equal(info.etype, '100ua');
    assert.equal(Number.parseFloat(info.eval), 250);
    const elems = P._demoResponseFor(m, 'cfg.elems', {}, 0);
    assert.equal(Number.parseFloat(elems.e3v), 250);
    assert.equal(elems.e3t, '100ua');
  });

  it('rejects out-of-range cfg.set values with an ERR_ code', () => {
    const m = makeModel();
    assert.throws(() => P._demoResponseFor(m, 'cfg.set', { key: 'range', val: '9' }, 0), e => /^ERR_/.test(e.code));
    assert.throws(() => P._demoResponseFor(m, 'cfg.set', { key: 'nope', val: '1' }, 0), e => /^ERR_/.test(e.code));
  });

  it('sys.fw returns an fver the firmware update check can parse', () => {
    const r = P._demoResponseFor(makeModel(), 'sys.fw', {}, 0);
    assert.deepEqual(P._parseSemver(r.fver), [2, 6, 0]);
    assert.match(r.fver, /demo/);
  });

  it('sys.id, sys.nget/nset and sys.cmds answer like the firmware', () => {
    const m = makeModel('voice');
    const id = P._demoResponseFor(m, 'sys.id', {}, 0);
    assert.ok(id.uid && id.dname);
    assert.equal(P._demoResponseFor(m, 'sys.nset', { name: 'Bench_1' }, 0).dname, 'Bench_1');
    assert.equal(P._demoResponseFor(m, 'sys.nget', {}, 0).dname, 'Bench_1');
    const cmds = P._demoResponseFor(m, 'sys.cmds', {}, 0).cmds.split(',');
    for (const c of ['pwr.snap', 'pwr.get', 'pwr.info', 'cfg.get', 'cfg.set', 'cfg.elems', 'sys.id', 'sys.fw']) {
      assert.ok(cmds.includes(c), c);
    }
    for (const c of ['sys.save', 'sys.rst', 'sys.dfu']) {
      assert.equal(P._demoResponseFor(m, c, {}, 0).status, 'ok');
    }
  });

  it('pwr.get returns the requested metric', () => {
    const r = P._demoResponseFor(makeModel(), 'pwr.get', { met: 'avg' }, 500);
    assert.equal(r.met, 'avg');
    assert.ok(Number.isFinite(Number.parseFloat(r.value)));
    assert.throws(() => P._demoResponseFor(makeModel(), 'pwr.get', { met: 'bogus' }, 0), e => e.code === 'ERR_UNKNOWN_METRIC');
  });

  it('cfg.elems renders through _renderElementProfileOptions', () => {
    const ctl = makeControlStub();
    const resp = P._demoResponseFor(makeModel(), 'cfg.elems', {}, 0);
    const record = { elementProfiles: ctl._parseElementProfiles(resp) };
    const html = ctl._renderElementProfileOptions(record, 1);
    assert.equal((html.match(/<option/g) || []).length, 8);
    assert.match(html, /Element 1 - 100 W - 30ua/);
  });

  it('unknown commands throw an error with code ERR_UNKNOWN_CMD', () => {
    assert.throws(() => P._demoResponseFor(makeModel(), 'foo.bar', {}, 0), (e) => {
      assert.equal(e.code, 'ERR_UNKNOWN_CMD');
      assert.match(e.message, /foo\.bar failed/);
      return true;
    });
  });
});

// A stub with the board/monitor side effects recorded instead of performed.
function makeDemoStub(extra = {}) {
  const calls = { monitor: [], stop: [], board: 0, saved: 0, autoQuery: [], announce: [] };
  const ctl = makeControlStub({
    config: { demoMode: false, meterCardOrder: ['usbmodem:REAL'], boardCardOrder: ['meter:usbmodem:REAL'] },
    refreshMeterBoard() { calls.board++; },
    startMeterMonitoring(key) { calls.monitor.push(key); },
    stopMeterMonitoring(key) { calls.stop.push(key); },
    saveConfig() { calls.saved++; },
    _autoQueryMeterOnConnect(key) { calls.autoQuery.push(key); },
    announce(text) { calls.announce.push(text); },
    updateMeterCardUI() {},
    resetMeterReadings() {},
    ...extra,
  });
  return { ctl, calls };
}

describe('setDemoMode', () => {
  beforeEach(() => { document.getElementById = () => null; });

  it('adds two connected demo meters and their card order entries', () => {
    const { ctl, calls } = makeDemoStub();
    ctl.setDemoMode(true);
    const demo = [...ctl.meterRegistry.values()].filter(r => r.isDemo);
    assert.deepEqual(demo.map(r => r.key).sort(), ['demo:steady', 'demo:voice']);
    for (const r of demo) {
      assert.equal(r.connectionState, 'connected');
      assert.ok(r.portPath.startsWith('demo://'));
      assert.ok(r.state && r.state.pendingRequests instanceof Map);
      assert.equal(r.elementRating, 100);
      assert.equal(r.rangeCfg, 0);
      assert.equal(r.rangeMultiplier, 1);
    }
    assert.equal(ctl.meterRegistry.get('demo:steady').friendlyName, 'Demo Steady');
    assert.equal(ctl.meterRegistry.get('demo:voice').friendlyName, 'Demo Voice');
    assert.ok(ctl.config.meterCardOrder.includes('demo:steady'));
    assert.ok(ctl.config.meterCardOrder.includes('demo:voice'));
    assert.ok(ctl.config.boardCardOrder.includes('meter:demo:voice'));
    assert.equal(ctl.config.demoMode, true);
    assert.deepEqual(calls.monitor.sort(), ['demo:steady', 'demo:voice']);
    assert.ok(calls.board >= 1);
    assert.ok(calls.saved >= 1);
    assert.deepEqual(calls.announce, ['Demo mode on']);
  });

  it('is idempotent when turned on twice', () => {
    const { ctl, calls } = makeDemoStub();
    ctl.setDemoMode(true);
    ctl.setDemoMode(true);
    assert.equal([...ctl.meterRegistry.values()].filter(r => r.isDemo).length, 2);
    assert.equal(ctl.config.meterCardOrder.filter(k => k === 'demo:steady').length, 1);
    assert.equal(ctl.config.boardCardOrder.filter(k => k === 'meter:demo:steady').length, 1);
    assert.equal(calls.monitor.length, 2);
    assert.equal(calls.announce.length, 1);
  });

  it('removes the demo meters and their order entries when turned off', () => {
    const { ctl, calls } = makeDemoStub();
    ctl.meterRegistry.set('usbmodem:REAL', { key: 'usbmodem:REAL', connectionState: 'connected', state: {} });
    ctl.setDemoMode(true);
    ctl.activeMeterKey = 'demo:voice';
    ctl.setDemoMode(false);
    assert.deepEqual([...ctl.meterRegistry.keys()], ['usbmodem:REAL']);
    assert.deepEqual(ctl.config.meterCardOrder, ['usbmodem:REAL']);
    assert.deepEqual(ctl.config.boardCardOrder, ['meter:usbmodem:REAL']);
    assert.deepEqual(calls.stop.sort(), ['demo:steady', 'demo:voice']);
    assert.equal(ctl.config.demoMode, false);
    assert.notEqual(ctl.activeMeterKey, 'demo:voice');
    assert.deepEqual(calls.announce, ['Demo mode on', 'Demo mode off']);
  });

  it('turning off when already off does nothing', () => {
    const { ctl, calls } = makeDemoStub();
    ctl.setDemoMode(false);
    assert.equal(calls.announce.length, 0);
    assert.deepEqual(ctl.config.meterCardOrder, ['usbmodem:REAL']);
  });

  it('setupDemoMode starts only when config.demoMode is true', () => {
    const off = makeDemoStub();
    off.ctl.setupDemoMode();
    assert.equal(off.ctl.meterRegistry.size, 0);
    const on = makeDemoStub();
    on.ctl.config.demoMode = true;
    on.ctl.setupDemoMode();
    assert.equal(on.ctl.meterRegistry.size, 2);
    assert.equal(on.calls.announce.length, 0, 'start-up should not speak');
  });
});

describe('demo meters through the real command path', () => {
  let ctl;
  let opened;
  beforeEach(() => {
    opened = [];
    document.getElementById = () => null;
    window.electronAPI = {
      writeSerial: async () => { throw new Error('demo must not write serial'); },
      openSerialPort: async (p) => { opened.push(p); return { success: true }; },
      closeSerialPort: async (p) => { opened.push(`close:${p}`); return { success: true }; },
      getSerialPorts: async () => ({ success: true, ports: [] }),
    };
    ({ ctl } = makeDemoStub({
      config: { demoMode: false, globalApiPacingMs: 100 },
      // keep the snapshot path's drawing out of the test
      _updateMeterGauges() {}, _pushMeterHistory() {}, _drawMeterHistory() {},
      _updateSwrCardsForMeter() {}, _a11yOnSnapshot() {}, _updateGaugeScale() {},
    }));
    ctl.setDemoMode(true);
  });
  afterEach(() => { window.electronAPI = {}; });

  it('sendApiCommand answers pwr.snap without touching the serial port', async () => {
    const t0 = Date.now();
    const resp = await ctl.sendApiCommand('demo:steady', 'pwr.snap');
    assert.ok(Date.now() - t0 < 90, 'demo commands skip the pacing delay');
    assert.equal(resp.cmd, 'pwr.snap');
    assert.ok(resp.d);
  });

  it('refreshPowerSnapshot parses the demo response into the record', async () => {
    await ctl.refreshPowerSnapshot('demo:steady', { quiet: true, pacingMs: 0 });
    const rec = ctl.meterRegistry.get('demo:steady');
    const raw = rec.state.lastSnapshotRaw;
    assert.ok(raw);
    const avg = Number.parseFloat(raw.avg);
    assert.ok(avg > 49 && avg < 51, `avg ${avg}`);
    assert.equal(rec.elementRating, 100);
    assert.equal(rec.rangeMultiplier, 1);
    assert.equal(rec.state.maxPowerW, 100);
  });

  it('unknown commands reject with code ERR_UNKNOWN_CMD and do not fall back to proto 1', async () => {
    await assert.rejects(ctl.sendApiCommand('demo:voice', 'zz.top'), e => e.code === 'ERR_UNKNOWN_CMD');
    assert.equal(ctl.meterRegistry.get('demo:voice').state.protocolVersion, '2');
  });

  it('a disconnected demo meter rejects commands', async () => {
    await ctl.disconnectMeter('demo:voice');
    await assert.rejects(ctl.sendApiCommand('demo:voice', 'pwr.snap'), /not connected/);
  });

  it('connectMeter / disconnectMeter on a demo meter never open or close a port', async () => {
    await ctl.disconnectMeter('demo:voice');
    assert.equal(ctl.meterRegistry.get('demo:voice').connectionState, 'disconnected');
    await ctl.connectMeter('demo:voice');
    assert.equal(ctl.meterRegistry.get('demo:voice').connectionState, 'connected');
    assert.deepEqual(opened, []);
  });

  it('scanAndSyncMeters with no serial ports keeps the demo meters', async () => {
    await ctl.scanAndSyncMeters({ allowAutoConnect: true });
    assert.ok(ctl.meterRegistry.has('demo:steady'));
    assert.ok(ctl.meterRegistry.has('demo:voice'));
    assert.equal(ctl.meterRegistry.get('demo:steady').connectionState, 'connected');
    assert.deepEqual(opened, []);
  });

  it('the watchdog never tries to reopen a demo port', async () => {
    await ctl._triggerMeterWatchdogReconnect('demo:steady');
    assert.deepEqual(opened, []);
    assert.equal(ctl.meterRegistry.get('demo:steady').connectionState, 'connected');
  });
});
