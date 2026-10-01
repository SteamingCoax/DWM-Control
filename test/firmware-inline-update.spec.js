'use strict';
// In-card firmware update (control-api.js): version compare, the Check Updates /
// Update to vX.Y.Z button, and the download -> DFU -> wait -> upload flow.
const { describe, it, before, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub, makeElement } = require('./helpers/renderer-harness');

const KEY = 'usbmodem:fw1';
const SID = 'usbmodem_fw1';
const POWER_CYCLE = /Power-cycle the meter now/;

let els;
let api;
let progressCb;
let calls;

function el(id) {
  if (!els[id]) { els[id] = makeElement('div'); els[id].id = id; }
  return els[id];
}

// Drain promise chains between fake-timer ticks (setImmediate is not mocked).
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
async function advance(ms, step = 100) {
  for (let t = 0; t < ms; t += step) { await flush(); mock.timers.tick(step); }
  await flush();
}

function makeRecord(extra = {}) {
  return { key: KEY, portPath: '/dev/cu.usbmodemfw1', friendlyName: 'Bench', connectionState: 'connected', state: {}, ...extra };
}

function makeCtl(record, extra = {}) {
  const ctl = makeControlStub({
    announce() {},
    stopMeterMonitoring() {},
    _a11yOnDfuProgress(pct) { calls.a11yProgress.push(pct); },
    _a11yOnDfuResult(ok, msg) { calls.a11yResult.push([ok, msg]); },
    sendApiCommand: async (key, cmd) => {
      calls.send.push(cmd);
      if (cmd === 'sys.fw') return { fver: 'FW: 2.6.5' };
      return {};
    },
    ...extra,
  });
  ctl.meterRegistry.set(KEY, record);
  return ctl;
}

function readyForUpdate(record) {
  record.state.fwUpdate = { stage: 'available', version: '2.7.0', deviceVersion: '2.6.5' };
}

before(() => { loadRenderer(); });

beforeEach(() => {
  els = {};
  progressCb = null;
  calls = { send: [], download: 0, dfu: 0, upload: [], close: 0, a11yProgress: [], a11yResult: [] };
  document.getElementById = (id) => el(id);
  api = {
    getLatestFirmwareVersion: async () => ({ tag_name: 'v2.7.0' }),
    downloadLatestFirmware: async () => { calls.download++; return { filePath: '/Users/x/Downloads/DWM-Control-Firmware/fw.hex' }; },
    getDfuDevices: async () => {
      calls.dfu++;
      return calls.dfu <= 2 ? { success: true, devices: [] } : { success: true, devices: [{ serial: 'ABC', path: '1-1' }] };
    },
    uploadFirmware: async (args) => {
      calls.upload.push(args);
      progressCb?.({}, 'Download\t[=====     ]  50%');
      progressCb?.({}, 'Download\t[==========] 100%');
      return { success: true, output: '' };
    },
    onUploadProgress: (cb) => { progressCb = cb; return () => { progressCb = null; }; },
    closeSerialPort: async () => { calls.close++; return { success: true }; },
  };
  window.electronAPI = api;
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(() => { mock.timers.reset(); });

const btn = () => el(`meter-${SID}-fw-btn`);
const status = () => el(`meter-${SID}-fw-status`).textContent;
const progress = () => el(`meter-${SID}-fw-progress`).getAttribute('aria-valuenow');

describe('_fwCompareVersions', () => {
  it('reports an available update with both version strings', () => {
    const ctl = makeControlStub();
    assert.deepEqual(ctl._fwCompareVersions('FW: 2.6.5', 'v2.7.0'),
      { deviceVerStr: '2.6.5', latestVerStr: '2.7.0', updateAvailable: true });
  });
  it('equal or newer device firmware is not an update', () => {
    const ctl = makeControlStub();
    assert.equal(ctl._fwCompareVersions('2.7.0', 'v2.7.0').updateAvailable, false);
    assert.equal(ctl._fwCompareVersions('2.8.1', 'v2.7.0').updateAvailable, false);
  });
  it('returns null when either side is unparsable', () => {
    const ctl = makeControlStub();
    assert.equal(ctl._fwCompareVersions('garbage', 'v2.7.0'), null);
    assert.equal(ctl._fwCompareVersions('2.6.5', 'latest'), null);
  });
});

describe('checkFirmwareUpdate', () => {
  it('turns the check button into "Update to vX.Y.Z" when a newer release exists', async () => {
    const record = makeRecord();
    const ctl = makeCtl(record);
    await ctl.checkFirmwareUpdate(KEY);
    assert.equal(btn().dataset.meterAction, 'run-fw-update');
    assert.equal(btn().textContent, 'Update to v2.7.0');
    assert.ok(btn().className.includes('btn-warning'));
    assert.equal(record.state.fwUpdate.stage, 'available');
    assert.equal(record.state.fwUpdate.version, '2.7.0');
    assert.match(el(`meter-${SID}-fw-update-notice`).innerHTML, /2\.6\.5/);
  });

  it('shows "Up to date" for 5 s, then "Check Updates"', async () => {
    api.getLatestFirmwareVersion = async () => ({ tag_name: 'v2.6.5' });
    const ctl = makeCtl(makeRecord());
    await ctl.checkFirmwareUpdate(KEY);
    assert.equal(btn().textContent, 'Up to date');
    mock.timers.tick(4900);
    assert.equal(btn().textContent, 'Up to date');
    mock.timers.tick(200);
    assert.equal(btn().textContent, 'Check Updates');
    assert.equal(btn().dataset.meterAction, 'check-updates');
  });

  it('dismiss resets the button to Check Updates', async () => {
    const record = makeRecord();
    const ctl = makeCtl(record);
    await ctl.checkFirmwareUpdate(KEY);
    ctl._handleMeterCardAction(KEY, 'dismiss-fw-notice');
    assert.equal(btn().textContent, 'Check Updates');
    assert.equal(btn().dataset.meterAction, 'check-updates');
    assert.equal(el(`meter-${SID}-fw-update-notice`).style.display, 'none');
  });
});

describe('runInlineFirmwareUpdate', () => {
  it('downloads, enters DFU, waits for the device, uploads and reports success', async () => {
    const record = makeRecord();
    readyForUpdate(record);
    const ctl = makeCtl(record);
    const run = ctl.runInlineFirmwareUpdate(KEY);
    await advance(6000);
    await run;

    assert.equal(calls.download, 1);
    assert.ok(calls.send.includes('sys.dfu'));
    assert.equal(calls.close, 1);
    assert.equal(calls.dfu, 3, 'polled until the third call returned a device');
    assert.equal(calls.upload.length, 1);
    assert.equal(calls.upload[0].hexFilePath, '/Users/x/Downloads/DWM-Control-Firmware/fw.hex');
    assert.deepEqual(calls.upload[0].deviceInfo, { serial: 'ABC', path: '1-1' });
    assert.ok(calls.a11yProgress.some((p) => p > 0 && p < 100), 'intermediate progress was reported');
    assert.equal(progress(), '100');
    assert.match(status(), POWER_CYCLE);
    assert.equal(record.state.fwUpdate.stage, 'done');
    assert.deepEqual(calls.a11yResult.at(-1)[0], true);
    assert.equal(progressCb, null, 'upload-progress listener removed after the upload');
    assert.equal(btn().textContent, 'Check Updates');
    assert.equal(btn().disabled, true, 'disabled until the meter reconnects');
  });

  it('sets connectionState to updating while waiting for the DFU device', async () => {
    const record = makeRecord();
    readyForUpdate(record);
    const ctl = makeCtl(record);
    const run = ctl.runInlineFirmwareUpdate(KEY);
    await advance(1500);
    assert.equal(record.connectionState, 'updating');
    assert.equal(record.state.fwUpdate.stage, 'waiting-dfu');
    assert.match(status(), /Waiting for DFU device/);
    await advance(6000);
    await run;
  });

  it('moves aria-valuenow from dfu-util progress lines', async () => {
    const record = makeRecord();
    readyForUpdate(record);
    const seen = [];
    api.uploadFirmware = async () => {
      progressCb({}, 'Download\t[=====     ]  50%');
      seen.push(progress());
      assert.match(status(), /Uploading firmware… \d+%/);
      return { success: true };
    };
    const ctl = makeCtl(record);
    const run = ctl.runInlineFirmwareUpdate(KEY);
    await advance(6000);
    await run;
    assert.equal(seen[0], String(ctl.parseProgressFromDfuOutput('Download\t[=====     ]  50%')));
  });

  it('times out when no DFU device appears', async () => {
    const record = makeRecord();
    readyForUpdate(record);
    api.getDfuDevices = async () => { calls.dfu++; return { success: true, devices: [] }; };
    const ctl = makeCtl(record);
    const run = ctl.runInlineFirmwareUpdate(KEY);
    await advance(35000, 500);
    await run;
    assert.equal(record.state.fwUpdate.stage, 'error');
    assert.match(status(), /No DFU device/);
    assert.equal(btn().textContent, 'Update to v2.7.0');
    assert.equal(btn().dataset.meterAction, 'run-fw-update');
    assert.equal(btn().disabled, false, 'retry is possible while the meter sits in DFU mode');
    assert.equal(record.connectionState, 'available');
    assert.equal(calls.upload.length, 0);
  });

  it('upload failure shows the error and offers a retry', async () => {
    const record = makeRecord();
    readyForUpdate(record);
    api.uploadFirmware = async () => ({ success: false, error: 'dfu-util exited with code 74' });
    const ctl = makeCtl(record);
    const run = ctl.runInlineFirmwareUpdate(KEY);
    await advance(6000);
    await run;
    assert.equal(record.state.fwUpdate.stage, 'error');
    assert.match(status(), /code 74/);
    assert.equal(btn().textContent, 'Update to v2.7.0');
    assert.equal(record.connectionState, 'available');
    assert.equal(calls.a11yResult.at(-1)[0], false);
  });

  it('retry after a failure skips the download and sys.dfu when the meter is already in DFU mode', async () => {
    const record = makeRecord();
    readyForUpdate(record);
    let fail = true;
    api.uploadFirmware = async () => (fail ? { success: false, error: 'boom' } : { success: true });
    const ctl = makeCtl(record);
    let run = ctl.runInlineFirmwareUpdate(KEY);
    await advance(6000);
    await run;
    fail = false;
    calls.send = [];
    run = ctl.runInlineFirmwareUpdate(KEY);
    await advance(3000);
    await run;
    assert.equal(calls.download, 1);
    assert.ok(!calls.send.includes('sys.dfu'));
    assert.equal(record.state.fwUpdate.stage, 'done');
  });

  it('ignores a second click while an update is running', async () => {
    const record = makeRecord();
    readyForUpdate(record);
    const ctl = makeCtl(record);
    const run = ctl.runInlineFirmwareUpdate(KEY);
    const second = ctl.runInlineFirmwareUpdate(KEY);
    await advance(6000);
    await Promise.all([run, second]);
    assert.equal(calls.download, 1);
    assert.equal(calls.upload.length, 1);
  });

  it('download failure leaves the meter connected and offers a retry', async () => {
    const record = makeRecord();
    readyForUpdate(record);
    api.downloadLatestFirmware = async () => { throw new Error('net::ERR_INTERNET_DISCONNECTED'); };
    const ctl = makeCtl(record);
    await ctl.runInlineFirmwareUpdate(KEY);
    assert.equal(record.state.fwUpdate.stage, 'error');
    assert.match(status(), /download failed/i);
    assert.equal(record.connectionState, 'connected');
    assert.ok(!calls.send.includes('sys.dfu'));
  });

  it('simulates the update on a demo meter without touching DFU', async () => {
    const record = makeRecord({ isDemo: true });
    readyForUpdate(record);
    const ctl = makeCtl(record);
    const run = ctl.runInlineFirmwareUpdate(KEY);
    await advance(4000);
    await run;
    assert.equal(calls.dfu, 0);
    assert.equal(calls.upload.length, 0);
    assert.equal(record.state.fwUpdate.stage, 'done');
    assert.equal(progress(), '100');
    assert.equal(record.connectionState, 'connected');
  });
});

describe('meter card while updating', () => {
  it('connect button reads "Updating…" and is disabled', () => {
    const record = makeRecord({ connectionState: 'updating' });
    record.state.fwUpdate = { stage: 'waiting-dfu', version: '2.7.0' };
    const ctl = makeCtl(record);
    ctl.updateMeterCardUI(KEY);
    const connectBtn = el(`meter-${SID}-connect-btn`);
    assert.equal(connectBtn.textContent, 'Updating…');
    assert.equal(connectBtn.disabled, true);
    assert.equal(btn().disabled, true);
  });

  it('connect and disconnect are no-ops while updating', async () => {
    const record = makeRecord({ connectionState: 'updating' });
    record.state.fwUpdate = { stage: 'uploading', version: '2.7.0' };
    let opened = 0;
    api.openSerialPort = async () => { opened++; return { success: true }; };
    const ctl = makeCtl(record);
    await ctl.connectMeter(KEY);
    await ctl.disconnectMeter(KEY);
    assert.equal(opened, 0);
    assert.equal(calls.close, 0);
    assert.equal(record.connectionState, 'updating');
  });

  it('holds the record through the update so discovery does not drop the card', () => {
    const ctl = makeControlStub();
    assert.equal(ctl.isMeterHeldForFirmwareUpdate({ connectionState: 'updating' }), true);
    assert.equal(ctl.isMeterHeldForFirmwareUpdate({ connectionState: 'available', state: { fwUpdate: { stage: 'done', doneAt: Date.now() } } }), true);
    assert.equal(ctl.isMeterHeldForFirmwareUpdate({ connectionState: 'available', state: { fwUpdate: { stage: 'idle' } } }), false);
    assert.equal(ctl.isMeterHeldForFirmwareUpdate({ connectionState: 'connected', state: {} }), false);
  });
});

describe('meter card markup', () => {
  it('has an id on the update button and an accessible progress bar and status line', () => {
    const { findById } = require('./helpers/html-tags');
    const ctl = makeControlStub({ scalePower: (w) => ({ scaled: w, unit: 'W' }), _normalizeRange: (cfg) => ({ cfg }) });
    const html = ctl.renderMeterCard({ key: KEY, friendlyName: 'Bench', connectionState: 'connected', portPath: '/dev/x', elementId: 1, elementRating: 100 });
    const b = findById(html, `meter-${SID}-fw-btn`);
    assert.equal(b.attrs['data-meter-action'], 'check-updates');
    const bar = findById(html, `meter-${SID}-fw-progress`);
    assert.equal(bar.attrs.role, 'progressbar');
    assert.ok(bar.attrs['aria-label']);
    assert.equal(bar.attrs['aria-valuemin'], '0');
    assert.equal(bar.attrs['aria-valuemax'], '100');
    assert.ok(findById(html, `meter-${SID}-fw-progress-fill`));
    assert.equal(findById(html, `meter-${SID}-fw-status`).attrs.role, 'status');
  });
});
