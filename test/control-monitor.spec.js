'use strict';
const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub } = require('./helpers/renderer-harness');

let origGet;
before(() => { loadRenderer(); origGet = document.getElementById; });
afterEach(() => { document.getElementById = origGet; });

describe('setCfgValue', () => {
  let ctl; let applied; let statuses;
  beforeEach(() => {
    applied = []; statuses = [];
    ctl = makeControlStub();
    ctl.applyCfgValue = async (...a) => { applied.push(a); return 'done'; };
    ctl.setMeterStatus = (...a) => statuses.push(a);
  });

  it('delegates the trimmed input value to applyCfgValue', async () => {
    document.getElementById = (id) => (id === 'inp' ? { value: '  2  ' } : null);
    await ctl.setCfgValue('k', 'range', 'inp');
    assert.deepEqual(applied, [['k', 'range', '2']]);
  });
  it('warns and does not delegate on an empty value', async () => {
    document.getElementById = () => ({ value: '   ' });
    await ctl.setCfgValue('k', 'range', 'inp');
    assert.equal(applied.length, 0);
    assert.equal(statuses.length, 1);
    assert.equal(statuses[0][2], 'warning');
  });
  it('does nothing when the input is missing', async () => {
    document.getElementById = () => null;
    await ctl.setCfgValue('k', 'range', 'inp');
    assert.equal(applied.length, 0);
    assert.equal(statuses.length, 0);
  });
});

describe('applyCfgValue range', () => {
  it('updates the record and announces the new range', async () => {
    const calls = [];
    const rec = { key: 'k', elementRating: 100, rangeCfg: 0, rangeMultiplier: 1, state: {} };
    const ctl = makeControlStub({
      sendApiCommand: async (_k, _c, f) => ({ key: f.key, val: f.val }),
      _updateGaugeScale() {},
      _a11yAnnounceRange: (k) => calls.push(k),
    });
    ctl.meterRegistry.set('k', rec);
    document.getElementById = () => null;
    await ctl.applyCfgValue('k', 'range', '2');
    assert.equal(rec.rangeCfg, 2);
    assert.equal(rec.rangeMultiplier, 4);
    assert.deepEqual(calls, ['k']);
  });
});
