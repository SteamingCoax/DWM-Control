'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeUpdateChannel, isPrereleaseVersion, resolveAllowPrerelease,
} = require('../lib/update-channel');

describe('normalizeUpdateChannel', () => {
  const table = [
    ['beta', 'beta'], ['stable', 'stable'], ['BETA', 'beta'], ['Stable', 'stable'],
    [' beta ', 'beta'], ['nightly', null], ['', null], [undefined, null], [null, null],
    [42, null], [{}, null], [true, null], ['auto', null],
  ];
  for (const [input, expected] of table) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(normalizeUpdateChannel(input), expected);
    });
  }
});

describe('isPrereleaseVersion', () => {
  const table = [
    ['1.4.0-beta.3', true], ['1.4.0-rc.1', true], ['1.4.0', false], ['v1.4.0-beta.1', true],
    ['1.4.0+build5', false], ['garbage', false], ['', false], [undefined, false],
    [null, false], [140, false], ['-beta', false],
  ];
  for (const [input, expected] of table) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(isPrereleaseVersion(input), expected);
    });
  }
});

describe('resolveAllowPrerelease', () => {
  it('beta always allows', () => {
    assert.equal(resolveAllowPrerelease('beta', '1.4.0'), true);
    assert.equal(resolveAllowPrerelease('beta', '1.4.0-beta.3'), true);
  });
  it('stable never allows', () => {
    assert.equal(resolveAllowPrerelease('stable', '1.4.0-beta.3'), false);
    assert.equal(resolveAllowPrerelease('stable', '1.4.0'), false);
  });
  it('auto follows the current version', () => {
    assert.equal(resolveAllowPrerelease(null, '1.4.0-beta.3'), true);
    assert.equal(resolveAllowPrerelease(null, '1.4.0'), false);
    assert.equal(resolveAllowPrerelease(undefined, undefined), false);
  });
  it('unknown channel is treated as auto', () => {
    assert.equal(resolveAllowPrerelease('nightly', '1.4.0-beta.1'), true);
  });
});
