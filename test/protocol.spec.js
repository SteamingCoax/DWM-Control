'use strict';
// Protocol layer compatibility: the app must speak both proto 1 (legacy meters) and
// proto 2, and must accept every on-wire range spelling. The layer lives in dwm-core.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { protocol } = require('dwm-core');

test('builds proto 2 request frames by default', () => {
  const frame = protocol.buildFrame('pwr.snap', '101', { met: 'avg' });
  assert.equal(frame, 'proto=2 type=cmd cmd=pwr.snap req=101 met=avg\r\n');
});

test('can build proto 1 request frames for legacy meters', () => {
  const frame = protocol.buildFrame('pwr.snap', '101', { met: 'avg' }, '1');
  assert.equal(frame, 'proto=1 type=cmd cmd=pwr.snap req=101 met=avg\r\n');
});

test('accepts proto 1 and proto 2 responses during transition', () => {
  assert.equal(protocol.isSupportedProto('1'), true);
  assert.equal(protocol.isSupportedProto('2'), true);
  assert.equal(protocol.isSupportedProto('3'), false);
});

test('parses textual range values', () => {
  assert.equal(protocol.parseRangeMultiplier('1x'), 1);
  assert.equal(protocol.parseRangeMultiplier('2x'), 2);
  assert.equal(protocol.parseRangeMultiplier('4x'), 4);
});

test('parses numeric range values and cfg mappings', () => {
  assert.equal(protocol.parseRangeMultiplier('0'), 1);
  assert.equal(protocol.parseRangeMultiplier('1'), 2);
  assert.equal(protocol.parseRangeMultiplier('2'), 4);
  assert.equal(protocol.parseRangeCfg('0'), 0);
  assert.equal(protocol.parseRangeCfg('1'), 1);
  assert.equal(protocol.parseRangeCfg('2'), 2);
  assert.equal(protocol.parseRangeCfg('1x'), 0);
  assert.equal(protocol.parseRangeCfg('2x'), 1);
  assert.equal(protocol.parseRangeCfg('4x'), 2);
  assert.equal(protocol.cfgToRangeMultiplier(0), 1);
  assert.equal(protocol.cfgToRangeMultiplier(1), 2);
  assert.equal(protocol.cfgToRangeMultiplier(2), 4);
  assert.deepEqual(protocol.normalizeRange('4x'), { cfg: 2, multiplier: 4, label: '4x' });
});

console.log('USB protocol compatibility tests passed.');