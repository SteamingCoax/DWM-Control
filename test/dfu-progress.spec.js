'use strict';
// parseProgressFromDfuOutput (renderer/modules/firmware.js): maps dfu-util output to a
// monotonic 0..100 progress value shared by the Firmware tab and the in-card update.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub } = require('./helpers/renderer-harness');

let ctl;
before(() => { loadRenderer(); ctl = makeControlStub(); });

const p = (line) => ctl.parseProgressFromDfuOutput(line);

describe('parseProgressFromDfuOutput', () => {
  it('keeps the setup phases below 5% instead of jumping ahead', () => {
    assert.ok(p('Opening DFU capable USB device...') <= 5);
    assert.ok(p('Device ID 0483:df11') === null || p('Device ID 0483:df11') <= 5);
    assert.ok(p('Downloading element to address = 0x08000000, size = 123456') <= 5);
  });

  it('maps the Erase phase into 5..30 and Download into 30..100', () => {
    assert.equal(p('Erase   \t[                         ]   0%'), 5);
    assert.equal(p('Erase   \t[============             ]  50%'), 18);
    assert.equal(p('Erase   \t[=========================] 100%'), 30);
    assert.equal(p('Download\t[                         ]   0%'), 30);
    assert.equal(p('Download\t[============             ]  50%'), 65);
    assert.equal(p('Download\t[=========================] 100%'), 100);
  });

  it('reports 100 on completion and null on errors or unrelated lines', () => {
    assert.equal(p('File downloaded successfully'), 100);
    assert.equal(p('Done!'), 100);
    assert.equal(p('dfu-util: Error during download'), null);
    assert.equal(p('Copyright 2005-2009 Weston Schmidt'), null);
    assert.equal(p(''), null);
    assert.equal(p(null), null);
  });

  it('takes the furthest value from a multi-line chunk, including \\r-separated progress', () => {
    const chunk = 'Downloading element to address = 0x08000000, size = 100\nErase   \t[=====                    ]  20%\rErase   \t[==========               ]  40%';
    assert.equal(p(chunk), 15);
    const chunk2 = 'Erase   \t[=========================] 100%\r\nDownload\t[=====                    ]  20%\r\n';
    assert.equal(p(chunk2), 44);
  });

  it('never goes backwards across the sequence dfu-util prints', () => {
    const seq = [
      'Opening DFU capable USB device...', 'Device ID 0483:df11', 'Device DFU version 011a',
      'Claiming USB DFU Interface...', 'Setting Alternate Interface #0 ...', 'Determining device status...',
      'DFU state(2) = dfuIDLE, status(0) = No error condition is present', 'DFU mode device DFU version 011a',
      'Device returned transfer size 2048', 'DfuSe interface name: "Internal Flash   "',
      'Downloading element to address = 0x08000000, size = 123456',
      'Erase   \t[=====                    ]  20%', 'Erase   \t[=========================] 100%',
      'Download\t[=====                    ]  20%', 'Download\t[=========================] 100%',
      'File downloaded successfully',
    ];
    let last = 0;
    for (const line of seq) {
      const v = p(line);
      if (v === null) continue;
      assert.ok(v >= last, `${line} gave ${v} < ${last}`);
      last = v;
    }
    assert.equal(last, 100);
  });
});
