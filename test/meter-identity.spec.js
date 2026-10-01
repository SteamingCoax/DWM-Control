'use strict';
// Meter identity: which serial ports count as a DWM V2 (isMeterPort) and the
// stable registry key derived from a port descriptor (buildMeterKey).
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub } = require('./helpers/renderer-harness');

let ctl;
before(() => {
  loadRenderer();
  ctl = makeControlStub();
});

// Real descriptor seen on macOS (serialport list()).
const MAC_METER = {
  path: '/dev/tty.usbmodem2077338354421',
  manufacturer: 'STMicroelectronics',
  serialNumber: '207733835442',
  vendorId: '0483',
  productId: '5740',
};

describe('isMeterPort: positive matches', () => {
  it('matches the real macOS descriptor by VID/PID', () => {
    assert.equal(ctl.isMeterPort(MAC_METER), true);
  });

  it('matches manufacturer containing "DWM V2" regardless of case', () => {
    assert.equal(ctl.isMeterPort({ manufacturer: 'DWM V2 ComPort' }), true);
    assert.equal(ctl.isMeterPort({ manufacturer: 'dwm v2' }), true);
    assert.equal(ctl.isMeterPort({ manufacturer: 'Coaxon Dwm V2 Meter' }), true);
  });

  it('matches a Windows friendlyName containing "DWM V2"', () => {
    assert.equal(ctl.isMeterPort({ path: 'COM7', friendlyName: 'DWM V2 ComPort (COM7)' }), true);
  });

  it('matches VID 0483 / PID 5740 with or without a 0x prefix, in either case', () => {
    assert.equal(ctl.isMeterPort({ vendorId: '0483', productId: '5740' }), true);
    assert.equal(ctl.isMeterPort({ vendorId: '0x0483', productId: '0x5740' }), true);
    assert.equal(ctl.isMeterPort({ vendorId: '0X0483', productId: '0X5740' }), true);
    assert.equal(ctl.isMeterPort({ vendorId: '0x0483', productId: '5740' }), true);
  });

  it('matches the ST-assigned PID A59C as well as 5740', () => {
    assert.equal(ctl.isMeterPort({ vendorId: '0483', productId: 'A59C' }), true);
    assert.equal(ctl.isMeterPort({ vendorId: '0x0483', productId: '0xa59c' }), true);
    assert.equal(ctl.isMeterPort({ path: 'COM3', pnpId: 'USB\\VID_0483&PID_A59C\\207733835442' }), true);
    assert.equal(ctl.isMeterPort({ vendorId: '0483', productId: 'a59d' }), false);
    assert.equal(ctl.isMeterPort({ vendorId: '1234', productId: 'a59c' }), false);
  });

  it('matches the Linux pnpId of the COAXON-branded firmware by product string', () => {
    assert.equal(ctl.isMeterPort({ manufacturer: 'COAXON Systems Inc.', pnpId: 'usb-COAXON_Systems_Inc._DWM_V2_ComPort_207733835442-if00' }), true);
    assert.equal(ctl.isMeterPort({ manufacturer: 'COAXON Systems Inc.', pnpId: 'usb-COAXON_Systems_Inc._Other_Device_1-if00' }), false);
  });

  it('matches a Windows pnpId carrying VID_0483 and PID_5740 when vendorId/productId are empty', () => {
    assert.equal(ctl.isMeterPort({ path: 'COM3', pnpId: 'USB\\VID_0483&PID_5740\\207733835442' }), true);
    assert.equal(ctl.isMeterPort({ path: 'COM3', pnpId: 'usb\\vid_0483&pid_5740\\207733835442' }), true);
  });
});

describe('isMeterPort: negatives', () => {
  it('rejects an STM32 in DFU mode (0483:df11)', () => {
    assert.equal(ctl.isMeterPort({ manufacturer: 'STMicroelectronics', vendorId: '0483', productId: 'df11' }), false);
    assert.equal(ctl.isMeterPort({ pnpId: 'USB\\VID_0483&PID_DF11\\12345678' }), false);
  });

  it('rejects an unrelated FTDI serial adapter', () => {
    assert.equal(ctl.isMeterPort({
      path: '/dev/tty.usbserial-A10K1234', manufacturer: 'FTDI', serialNumber: 'A10K1234',
      vendorId: '0403', productId: '6001', pnpId: 'USB\\VID_0403&PID_6001\\A10K1234',
    }), false);
  });

  it('rejects a port with only one of VID/PID matching', () => {
    assert.equal(ctl.isMeterPort({ vendorId: '0483', productId: '0000' }), false);
    assert.equal(ctl.isMeterPort({ vendorId: '1234', productId: '5740' }), false);
  });

  it('rejects an empty descriptor and undefined', () => {
    assert.equal(ctl.isMeterPort({}), false);
    assert.equal(ctl.isMeterPort(undefined), false);
  });
});

describe('buildMeterKey', () => {
  it('macOS: uses the usbmodem UID from the path', () => {
    assert.equal(ctl.buildMeterKey(MAC_METER), 'usbmodem:2077338354421');
    assert.equal(ctl.buildMeterKey({ path: '/dev/cu.usbmodem14101' }), 'usbmodem:14101');
  });

  it('macOS: the usbmodem path wins even when a pnpId is present', () => {
    assert.equal(
      ctl.buildMeterKey({ path: '/dev/tty.usbmodemABC1', pnpId: 'USB\\VID_0483&PID_5740\\SERIAL99' }),
      'usbmodem:ABC1',
    );
  });

  it('Windows: uses the serial segment at the end of pnpId', () => {
    assert.equal(
      ctl.buildMeterKey({ path: 'COM3', pnpId: 'USB\\VID_0483&PID_5740\\207733835442', vendorId: '0483', productId: '5740' }),
      'usbserial:207733835442',
    );
  });

  it('Windows: a serial segment shorter than 4 chars falls back to port:<path>', () => {
    assert.equal(ctl.buildMeterKey({ path: 'COM4', pnpId: 'USB\\VID_0483&PID_5740\\ABC' }), 'port:COM4');
  });

  it('Windows: a pnpId with a non-alphanumeric tail (composite device instance) falls back to port:<path>', () => {
    assert.equal(ctl.buildMeterKey({ path: 'COM5', pnpId: 'USB\\VID_0483&PID_5740&MI_00\\6&2A3B4C5D&0&0000' }), 'port:COM5');
  });

  it('Linux: a ttyACM port with serialNumber but no pnpId serial falls back to port:<path>', () => {
    // buildMeterKey reads the serial from pnpId only; serialNumber alone is not used.
    assert.equal(
      ctl.buildMeterKey({
        path: '/dev/ttyACM0', manufacturer: 'STMicroelectronics', serialNumber: '207733835442',
        pnpId: 'usb-STMicroelectronics_DWM_V2_ComPort_207733835442-if00', vendorId: '0483', productId: '5740',
      }),
      'port:/dev/ttyACM0',
    );
  });

  it('returns port:unknown for an empty descriptor or undefined', () => {
    assert.equal(ctl.buildMeterKey({}), 'port:unknown');
    assert.equal(ctl.buildMeterKey(undefined), 'port:unknown');
  });
});

describe('parseUsbModemUid', () => {
  it('extracts the UID and returns null for non-usbmodem paths', () => {
    assert.equal(ctl.parseUsbModemUid('/dev/tty.usbmodem2077338354421'), '2077338354421');
    assert.equal(ctl.parseUsbModemUid('COM3'), null);
    assert.equal(ctl.parseUsbModemUid(null), null);
  });
});

// Firmware built with the PID ST assigned to the DWM V2 (0483:A59C). Older firmware
// keeps ST's generic CDC PID 5740; both must be accepted.
describe('isMeterPort: assigned PID A59C and the product string', () => {
  it('matches the assigned PID by vendorId/productId on macOS-style descriptors', () => {
    assert.equal(ctl.isMeterPort({ ...MAC_METER, productId: 'a59c' }), true);
    assert.equal(ctl.isMeterPort({ ...MAC_METER, productId: 'A59C' }), true);
    assert.equal(ctl.isMeterPort({ ...MAC_METER, productId: '0xA59C' }), true);
  });

  it('still matches the legacy PID 5740', () => {
    assert.equal(ctl.isMeterPort(MAC_METER), true);
  });

  it('matches the assigned PID from a Windows pnpId when the id fields are empty', () => {
    assert.equal(ctl.isMeterPort({ path: 'COM3', pnpId: 'USB\\VID_0483&PID_A59C\\207733835442' }), true);
    assert.equal(ctl.isMeterPort({ path: 'COM3', pnpId: 'usb\\vid_0483&pid_a59c\\207733835442' }), true);
  });

  it('matches the Linux pnpId product string, independent of PID', () => {
    // Real Linux listing: manufacturer is the USB vendor string, the product string is in pnpId.
    assert.equal(ctl.isMeterPort({
      path: '/dev/ttyACM0', manufacturer: 'STMicroelectronics',
      pnpId: 'usb-STMicroelectronics_DWM_V2_ComPort_207733835442-if00',
    }), true);
    // A future PID with the same product string is recognised without a code change.
    assert.equal(ctl.isMeterPort({
      path: '/dev/ttyACM1', manufacturer: 'STMicroelectronics',
      pnpId: 'usb-STMicroelectronics_DWM_V2_ComPort_207733835442-if00', vendorId: '0483', productId: 'beef',
    }), true);
  });

  it('rejects other STM32 devices on either VID/PID form', () => {
    assert.equal(ctl.isMeterPort({ vendorId: '0483', productId: 'a59d' }), false);
    assert.equal(ctl.isMeterPort({ vendorId: '1234', productId: 'a59c' }), false);
    assert.equal(ctl.isMeterPort({ path: 'COM3', pnpId: 'USB\\VID_1234&PID_A59C\\1' }), false);
    assert.equal(ctl.isMeterPort({ path: 'COM3', pnpId: 'USB\\VID_0483&PID_DF11\\1' }), false);
    assert.equal(ctl.isMeterPort({ path: '/dev/ttyACM2', pnpId: 'usb-STMicroelectronics_STM32_Virtual_ComPort_123-if00', vendorId: '0483', productId: '5741' }), false);
  });
});
