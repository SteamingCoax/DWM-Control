'use strict';
// After a successful flash (including dfu-util exit 74, which dwm-core reports as
// success) the app waits for the meter to restart by itself and reconnects.
const { describe, it, before, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub, makeElement } = require('./helpers/renderer-harness');

const KEY = 'usbmodem:fw1';
const SID = 'usbmodem_fw1';
const SN = '207733835442';
const OLD_PORT = { path: '/dev/cu.usbmodemfw1', vendorId: '0483', productId: '5740', serialNumber: SN };
const NEW_PORT = { path: '/dev/cu.usbmodemfw1', vendorId: '0483', productId: 'A59C', serialNumber: SN };

let els, api, calls, ports;
const el = (id) => { if (!els[id]) { els[id] = makeElement('div'); els[id].id = id; } return els[id]; };
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
async function advance(ms, step = 100) { for (let t = 0; t < ms; t += step) { await flush(); mock.timers.tick(step); } await flush(); }
const status = () => el(`meter-${SID}-fw-status`).textContent;

// A control stub whose scanAndSyncMeters behaves like discovery: a listed DWM port
// becomes a connected record.
function makeCtl(record) {
  const ctl = makeControlStub({
    announce(msg) { calls.announce.push(msg); },
    stopMeterMonitoring() {},
    refreshMeterBoard() {},
    _a11yOnDfuProgress() {},
    _a11yOnDfuResult() {},
    sendApiCommand: async () => ({}),
    scanAndSyncMeters: async () => {
      calls.scan++;
      for (const port of ports.filter((p) => ctl.isMeterPort(p))) {
        const key = ctl.buildMeterKey(port);
        const rec = ctl.meterRegistry.get(key) || { key, friendlyName: 'DWM V2', connectionState: 'available', state: {} };
        rec.portPath = port.path;
        rec.serialNumber = port.serialNumber || rec.serialNumber || null;
        ctl.meterRegistry.set(key, rec);
        if (rec.connectionState === 'available') {
          rec.connectionState = 'connected';
          ctl._fwOnReconnected(key);
        }
      }
    },
  });
  ctl.meterRegistry.set(KEY, record);
  return ctl;
}

const doneRecord = () => ({
  key: KEY, portPath: OLD_PORT.path, friendlyName: 'Bench', serialNumber: SN,
  connectionState: 'available', state: { fwUpdate: { stage: 'done', version: '2.7.0', doneAt: Date.now() } },
});

before(() => { loadRenderer(); });
beforeEach(() => {
  els = {}; ports = []; calls = { scan: 0, announce: [], output: [] };
  document.getElementById = (id) => el(id);
  api = { getSerialPorts: async () => ({ success: true, ports }) };
  window.electronAPI = api;
  mock.timers.enable({ apis: ['setTimeout'] });
});
afterEach(() => { mock.timers.reset(); });

describe('_fwAwaitRestart (in-card flow)', () => {
  it('reconnects once the meter re-enumerates with the new PID and reports Reconnected', async () => {
    const record = doneRecord();
    const ctl = makeCtl(record);
    const wait = ctl._fwAwaitRestart(KEY);
    await advance(3000);
    assert.equal(calls.scan, 0, 'nothing to scan while the meter is absent');
    ports = [NEW_PORT];
    await advance(1500);
    const found = await wait;
    assert.equal(found, record);
    assert.equal(record.connectionState, 'connected');
    assert.equal(record.state.fwUpdate.stage, 'idle');
    assert.equal(status(), 'Reconnected');
  });

  it('shows the power-cycle hint only after the 20 s timeout', async () => {
    const record = doneRecord();
    const ctl = makeCtl(record);
    const wait = ctl._fwAwaitRestart(KEY);
    await advance(15000, 500);
    assert.doesNotMatch(status(), /power.?cycle/i);
    await advance(7000, 500);
    assert.equal(await wait, null);
    assert.match(status(), /did not come back within 20 seconds/);
    assert.match(status(), /power-cycle/);
    assert.equal(record.state.fwUpdate.stage, 'done');
  });

  it('matches by USB serial number when the device key changed (Linux path moved)', async () => {
    const record = doneRecord();
    const ctl = makeCtl(record);
    ports = [{ path: '/dev/ttyACM1', vendorId: '0483', productId: 'a59c', serialNumber: SN }];
    const found = await ctl._fwAwaitRestart(KEY);
    assert.equal(found.key, 'port:/dev/ttyACM1');
    assert.equal(found.serialNumber, SN);
    assert.equal(ctl.meterRegistry.has(KEY), false, 'stale card for the old key is dropped');
  });

  it('falls back to the only DWM port when the old serial number is unknown', async () => {
    const record = doneRecord();
    record.serialNumber = null;
    const ctl = makeCtl(record);
    ports = [{ path: '/dev/ttyACM3', vendorId: '0483', productId: 'a59c' }];
    const found = await ctl._fwAwaitRestart(KEY);
    assert.equal(found.portPath, '/dev/ttyACM3');
  });

  it('does not adopt a different meter (other serial) as the flashed one', async () => {
    const record = doneRecord();
    const ctl = makeCtl(record);
    ports = [{ path: '/dev/ttyACM9', vendorId: '0483', productId: 'a59c', serialNumber: 'OTHER00000' }];
    const wait = ctl._fwAwaitRestart(KEY);
    await advance(22000, 500);
    assert.equal(await wait, null);
  });
});

describe('Firmware tab upload', () => {
  it('treats success (dfu-util exit 74 maps to success in dwm-core) as complete and waits for the restart', async () => {
    const lines = [];
    const ctl = makeControlStub({
      announce() {}, _a11yOnDfuResult() {}, _a11yOnDfuProgress() {}, appendOutput(m) { lines.push(m); },
      appendSerialMonitor(m) { lines.push(m); },
      _dfuMeterIdentity: { key: KEY, serialNumber: SN },
    });
    ctl.selectedHexFile = '/Users/x/fw.hex';
    ctl.selectedDevice = { serial: 'ABC' };
    ctl.meterRegistry.set(KEY, { key: KEY, portPath: OLD_PORT.path, serialNumber: SN, connectionState: 'available', state: {} });
    ctl.scanAndSyncMeters = async () => {
      const rec = ctl.meterRegistry.get(KEY);
      rec.connectionState = 'connected';
    };
    api.uploadFirmware = async () => ({ success: true, output: 'Error during download get_status\n' });
    await ctl.uploadFirmware();
    assert.ok(lines.includes('Firmware upload successful.'));
    assert.ok(lines.some((l) => /waiting for meter to restart/.test(l)));
    ports = [NEW_PORT];
    await advance(2000);
    const found = await ctl._fwTabRestartWait;
    assert.equal(found.key, KEY);
    assert.ok(lines.includes('Reconnected'));
    assert.equal(ctl._dfuMeterIdentity, null);
  });

  it('a failed upload does not start the restart wait', async () => {
    const ctl = makeControlStub({ announce() {}, _a11yOnDfuResult() {}, _a11yOnDfuProgress() {}, appendOutput() {}, appendSerialMonitor() {} });
    ctl.selectedHexFile = '/Users/x/fw.hex';
    ctl.selectedDevice = { serial: 'ABC' };
    api.uploadFirmware = async () => ({ success: false, error: 'Upload failed with code 1', output: '' });
    await ctl.uploadFirmware();
    assert.equal(ctl._fwTabRestartWait, undefined);
  });
});

describe('copy', () => {
  it('no longer tells the user to power-cycle in the update notice or confirmation', () => {
    const ctl = makeControlStub({ meterSafeId: (k) => k.replace(/:/g, '_') });
    ctl.meterRegistry.set(KEY, { key: KEY, state: { fwUpdate: { stage: 'available', version: '2.7.0', deviceVersion: '2.6.5' } } });
    ctl._fwRenderAvailableNotice(KEY);
    assert.doesNotMatch(el(`meter-${SID}-fw-update-notice`).innerHTML, /power.?cycle|unplug/i);
  });
});
