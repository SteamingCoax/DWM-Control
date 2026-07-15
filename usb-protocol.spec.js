const assert = require('assert');
const protocol = require('./renderer/modules/protocol.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('builds proto 2 request frames by default', () => {
  const frame = protocol.buildFrame('pwr.snap', '101', { met: 'avg' });
  assert.strictEqual(frame, 'proto=2 type=cmd cmd=pwr.snap req=101 met=avg\r\n');
});

test('can build proto 1 request frames for legacy meters', () => {
  const frame = protocol.buildFrame('pwr.snap', '101', { met: 'avg' }, '1');
  assert.strictEqual(frame, 'proto=1 type=cmd cmd=pwr.snap req=101 met=avg\r\n');
});

test('accepts proto 1 and proto 2 responses during transition', () => {
  assert.strictEqual(protocol.isSupportedProto('1'), true);
  assert.strictEqual(protocol.isSupportedProto('2'), true);
  assert.strictEqual(protocol.isSupportedProto('3'), false);
});

test('parses textual range values', () => {
  assert.strictEqual(protocol.parseRangeMultiplier('1x'), 1);
  assert.strictEqual(protocol.parseRangeMultiplier('2x'), 2);
  assert.strictEqual(protocol.parseRangeMultiplier('4x'), 4);
});

test('parses numeric range values and cfg mappings', () => {
  assert.strictEqual(protocol.parseRangeMultiplier('0'), 1);
  assert.strictEqual(protocol.parseRangeMultiplier('1'), 2);
  assert.strictEqual(protocol.parseRangeMultiplier('2'), 4);
  assert.strictEqual(protocol.parseRangeCfg('0'), 0);
  assert.strictEqual(protocol.parseRangeCfg('1'), 1);
  assert.strictEqual(protocol.parseRangeCfg('2'), 2);
  assert.strictEqual(protocol.parseRangeCfg('1x'), 0);
  assert.strictEqual(protocol.parseRangeCfg('2x'), 1);
  assert.strictEqual(protocol.parseRangeCfg('4x'), 2);
  assert.strictEqual(protocol.cfgToRangeMultiplier(0), 1);
  assert.strictEqual(protocol.cfgToRangeMultiplier(1), 2);
  assert.strictEqual(protocol.cfgToRangeMultiplier(2), 4);
  assert.deepStrictEqual(protocol.normalizeRange('4x'), { cfg: 2, multiplier: 4, label: '4x' });
});

console.log('USB protocol compatibility tests passed.');