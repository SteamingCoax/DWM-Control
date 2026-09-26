'use strict';
// Firmware update check helpers: _parseSemver / _semverIsNewer (control-api.js).
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub } = require('./helpers/renderer-harness');

let ctl;
before(() => {
  loadRenderer();
  ctl = makeControlStub();
});

describe('_parseSemver', () => {
  it('parses tags with and without a leading v', () => {
    assert.deepEqual(ctl._parseSemver('v2.6.5'), [2, 6, 5]);
    assert.deepEqual(ctl._parseSemver('2.6.3'), [2, 6, 3]);
    assert.deepEqual(ctl._parseSemver('v2.10.0'), [2, 10, 0]);
  });

  it('finds the first x.y.z inside surrounding text', () => {
    assert.deepEqual(ctl._parseSemver('DWM-V2-fw-2.6.5-beta.1'), [2, 6, 5]);
    assert.deepEqual(ctl._parseSemver('fver=1.0.12'), [1, 0, 12]);
  });

  it('returns null for malformed or empty input', () => {
    assert.equal(ctl._parseSemver('v2.6'), null);
    assert.equal(ctl._parseSemver('latest'), null);
    assert.equal(ctl._parseSemver(''), null);
    assert.equal(ctl._parseSemver(null), null);
    assert.equal(ctl._parseSemver(undefined), null);
  });
});

describe('_semverIsNewer', () => {
  const v = (s) => ctl._parseSemver(s);

  it('compares numerically, not lexically', () => {
    assert.equal(ctl._semverIsNewer(v('v2.10.0'), v('v2.6.5')), true);
    assert.equal(ctl._semverIsNewer(v('v2.6.5'), v('v2.10.0')), false);
  });

  it('detects newer patch, minor and major', () => {
    assert.equal(ctl._semverIsNewer(v('v2.6.5'), v('2.6.3')), true);
    assert.equal(ctl._semverIsNewer(v('2.7.0'), v('2.6.9')), true);
    assert.equal(ctl._semverIsNewer(v('3.0.0'), v('2.99.99')), true);
  });

  it('returns false for older or equal versions', () => {
    assert.equal(ctl._semverIsNewer(v('2.6.3'), v('v2.6.5')), false);
    assert.equal(ctl._semverIsNewer(v('v2.6.5'), v('2.6.5')), false);
  });
});
