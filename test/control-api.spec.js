'use strict';
// Serial API layer (control-api.js): frame parsing, request/response correlation,
// and sendApiCommand's per-meter queue and proto=1 fallback.
const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub } = require('./helpers/renderer-harness');

const KEY = 'usbmodem:TEST1';
const PORT = '/dev/tty.usbmodemTEST1';

let ctl;
let record;
let writes;       // every frame written, in order (trailing \r\n stripped)
let responder;    // (frame) => response line | null; null means "stay silent"

before(() => loadRenderer());

// Parse an outgoing frame the same way the firmware would.
const parseSent = (frame) => ctl.parseApiFrame(frame.trim());

// Default meter behaviour: answer every command with an ok response on the same proto.
const okResponder = (f) => `proto=${f.proto} type=resp status=ok cmd=${f.cmd} req=${f.req}`;

beforeEach(() => {
  writes = [];
  responder = okResponder;
  // sendApiCommand -> writeSerialData (renderer.js) -> window.electronAPI.writeSerial
  window.electronAPI = {
    writeSerial: async (portPath, data) => {
      assert.equal(portPath, PORT);
      writes.push(data.trim());
      const reply = responder(parseSent(data));
      if (reply) setImmediate(() => ctl.handleControlSerialLine(KEY, reply));
      return { success: true };
    },
  };
  ctl = makeControlStub({ config: { globalApiPacingMs: 0 } });
  record = { key: KEY, portPath: PORT, connectionState: 'connected', state: ctl.createMeterState() };
  ctl.meterRegistry.set(KEY, record);
});

afterEach(() => {
  // Nothing may be left waiting; otherwise its timer would keep the process alive.
  for (const p of record.state.pendingRequests.values()) clearTimeout(p.timeoutId);
  record.state.pendingRequests.clear();
});

// Register a pending request directly, as sendApiCommand would.
function addPending(req) {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  const timeoutId = setTimeout(() => {}, 60_000);
  record.state.pendingRequests.set(req, { command: 'x', resolve, reject, timeoutId });
  return promise;
}

describe('parseApiFrame', () => {
  it('splits space-separated key=value tokens and keeps the raw line', () => {
    const line = 'proto=2 type=resp status=ok cmd=pwr.snap req=101 avg=12.5 peak=40';
    assert.deepEqual(ctl.parseApiFrame(line), {
      raw: line, proto: '2', type: 'resp', status: 'ok', cmd: 'pwr.snap', req: '101', avg: '12.5', peak: '40',
    });
  });

  it('keeps everything after the first = as the value', () => {
    assert.equal(ctl.parseApiFrame('msg=a=b').msg, 'a=b');
  });

  it('ignores tokens without a key and returns only raw for non-frame lines', () => {
    assert.deepEqual(ctl.parseApiFrame('Hello from bootloader'), { raw: 'Hello from bootloader' });
    assert.deepEqual(ctl.parseApiFrame('=x proto=2'), { raw: '=x proto=2', proto: '2' });
  });
});

describe('handleControlSerialLine', () => {
  it('resolves the matching pending request with the parsed frame', async () => {
    const p = addPending('7');
    ctl.handleControlSerialLine(KEY, 'proto=2 type=resp status=ok cmd=sys.fw req=7 fver=2.6.5');
    const frame = await p;
    assert.equal(frame.fver, '2.6.5');
    assert.equal(frame.req, '7');
    assert.equal(record.state.pendingRequests.has('7'), false);
  });

  it('ignores a response whose req is unknown', () => {
    const p = addPending('7');
    assert.doesNotThrow(() => ctl.handleControlSerialLine(KEY, 'proto=2 type=resp status=ok cmd=sys.fw req=99'));
    assert.equal(record.state.pendingRequests.has('7'), true);
    p.catch(() => {});
  });

  it('ignores lines that are not proto= frames or carry an unsupported proto', () => {
    addPending('7').catch(() => {});
    ctl.handleControlSerialLine(KEY, 'debug: req=7');
    ctl.handleControlSerialLine(KEY, 'proto=9 type=resp status=ok req=7');
    assert.equal(record.state.pendingRequests.has('7'), true);
  });

  it('rejects the pending request on a status=error frame with the described error', async () => {
    const p = addPending('8');
    ctl.handleControlSerialLine(KEY, 'proto=2 type=err status=error cmd=cfg.set req=8 code=ERR_VALUE_RANGE msg=bright_out_of_range');
    await assert.rejects(p, {
      message: 'cfg.set failed: Numeric value was out of the accepted range (bright_out_of_range)',
    });
  });

  it('updates the record protocolVersion from an ok response', async () => {
    record.state.protocolVersion = '2';
    const p = addPending('9');
    ctl.handleControlSerialLine(KEY, 'proto=1 type=resp status=ok cmd=sys.fw req=9');
    await p;
    assert.equal(record.state.protocolVersion, '1');
  });

  it('reports an unsolicited err frame through setMeterStatus', () => {
    const statuses = [];
    ctl.setMeterStatus = (key, msg, level) => statuses.push({ key, msg, level });
    ctl.handleControlSerialLine(KEY, 'proto=2 type=err status=error cmd=pwr.get code=ERR_BUSY');
    assert.deepEqual(statuses, [{ key: KEY, msg: 'pwr.get failed: Device is temporarily unable to service the command', level: 'error' }]);
  });
});

describe('handleControlSerialData', () => {
  it('buffers partial lines and dispatches complete CRLF-terminated frames', async () => {
    const p = addPending('5');
    ctl.handleControlSerialData(PORT, 'proto=2 type=resp sta');
    assert.equal(record.state.pendingRequests.has('5'), true);
    ctl.handleControlSerialData(PORT, 'tus=ok cmd=sys.fw req=5\r\nproto=2 ty');
    assert.equal((await p).cmd, 'sys.fw');
    assert.equal(record.state.serialBuffer, 'proto=2 ty');
  });
});

describe('sendApiCommand', () => {
  it('throws when the meter is not connected', async () => {
    record.connectionState = 'available';
    await assert.rejects(ctl.sendApiCommand(KEY, 'sys.fw'), { message: 'Device is not connected' });
    await assert.rejects(ctl.sendApiCommand('port:missing', 'sys.fw'), { message: 'Device is not connected' });
  });

  it('writes a proto=2 frame with fields and resolves with the response', async () => {
    const resp = await ctl.sendApiCommand(KEY, 'pwr.snap', { met: 'avg' });
    assert.deepEqual(writes, ['proto=2 type=cmd cmd=pwr.snap req=1 met=avg']);
    assert.equal(resp.cmd, 'pwr.snap');
    assert.equal(resp.status, 'ok');
  });

  it('uses an incrementing req id per meter', async () => {
    await ctl.sendApiCommand(KEY, 'a');
    await ctl.sendApiCommand(KEY, 'b');
    await ctl.sendApiCommand(KEY, 'c');
    assert.deepEqual(writes.map((w) => parseSent(w).req), ['1', '2', '3']);
    assert.equal(record.state.nextRequestId, 4);
  });

  it('runs commands to one meter strictly in order, one at a time', async () => {
    const events = [];
    window.electronAPI.writeSerial = async (_path, data) => {
      const f = parseSent(data);
      writes.push(data.trim());
      events.push(`tx:${f.cmd}`);
      // Delay each reply so a non-serialized implementation would interleave writes.
      setTimeout(() => {
        events.push(`rx:${f.cmd}`);
        ctl.handleControlSerialLine(KEY, okResponder(f));
      }, 5);
      return { success: true };
    };
    const results = await Promise.all(['one', 'two', 'three'].map((c) => ctl.sendApiCommand(KEY, c)));
    assert.deepEqual(results.map((r) => r.cmd), ['one', 'two', 'three']);
    assert.deepEqual(events, ['tx:one', 'rx:one', 'tx:two', 'rx:two', 'tx:three', 'rx:three']);
  });

  it('a failed command does not block the queue for the next one', async () => {
    responder = (f) => (f.cmd === 'bad'
      ? `proto=2 type=err status=error cmd=bad req=${f.req} code=ERR_VALUE_RANGE`
      : okResponder(f));
    const bad = ctl.sendApiCommand(KEY, 'bad');
    const good = ctl.sendApiCommand(KEY, 'good');
    await assert.rejects(bad, /bad failed/);
    assert.equal((await good).cmd, 'good');
  });

  it('falls back to proto=1 on timeout and remembers it', async () => {
    responder = (f) => (f.proto === '1' ? okResponder(f) : null);
    const resp = await ctl.sendApiCommand(KEY, 'sys.fw', {}, { timeoutMs: 20 });
    assert.deepEqual(writes.map((w) => parseSent(w).proto), ['2', '1']);
    assert.equal(resp.proto, '1');
    assert.equal(record.state.protocolVersion, '1');
  });

  it('falls back to proto=1 when the write itself fails', async () => {
    window.electronAPI.writeSerial = async (_path, data) => {
      const f = parseSent(data);
      writes.push(data.trim());
      if (f.proto === '2') return { success: false, error: 'Failed to write sys.fw' };
      setImmediate(() => ctl.handleControlSerialLine(KEY, okResponder(f)));
      return { success: true };
    };
    await ctl.sendApiCommand(KEY, 'sys.fw');
    assert.deepEqual(writes.map((w) => parseSent(w).proto), ['2', '1']);
    assert.equal(record.state.protocolVersion, '1');
  });

  it('does not fall back when allowLegacyFallback is false', async () => {
    responder = () => null;
    await assert.rejects(
      ctl.sendApiCommand(KEY, 'sys.fw', {}, { timeoutMs: 20, allowLegacyFallback: false }),
      { message: 'sys.fw timed out after 20ms' },
    );
    assert.equal(writes.length, 1);
    assert.equal(record.state.protocolVersion, '2');
  });

  // describeApiError() turns code=ERR_UNKNOWN_CMD into "Command not recognised by firmware",
  // so the rejection message never contains the ERR_* code and the fallback regex
  // /ERR_(UNKNOWN_CMD|BAD_FRAME|BAD_ENUM)/ in sendApiCommand can never match.
  for (const code of ['ERR_UNKNOWN_CMD', 'ERR_BAD_FRAME', 'ERR_BAD_ENUM']) {
    it(`falls back to proto=1 on ${code}`, async () => {
      responder = (f) => (f.proto === '1'
        ? okResponder(f)
        : `proto=2 type=err status=error cmd=${f.cmd} req=${f.req} code=${code}`);
      await ctl.sendApiCommand(KEY, 'sys.fw');
      assert.deepEqual(writes.map((w) => parseSent(w).proto), ['2', '1']);
      assert.equal(record.state.protocolVersion, '1');
    });
  }

  it('does not fall back on an unrelated device error', async () => {
    responder = (f) => `proto=2 type=err status=error cmd=${f.cmd} req=${f.req} code=ERR_VALUE_RANGE msg=elem_out_of_range`;
    await assert.rejects(ctl.sendApiCommand(KEY, 'cfg.elem'), /Numeric value was out of the accepted range/);
    assert.equal(writes.length, 1);
    assert.equal(record.state.protocolVersion, '2');
  });

  it('does not fall back again when the meter is already on proto 1', async () => {
    record.state.protocolVersion = '1';
    responder = () => null;
    await assert.rejects(ctl.sendApiCommand(KEY, 'sys.fw', {}, { timeoutMs: 20 }), /timed out/);
    assert.deepEqual(writes.map((w) => parseSent(w).proto), ['1']);
    assert.equal(record.state.protocolVersion, '1');
  });

  it('options.protocolVersion overrides the stored version for that call', async () => {
    await ctl.sendApiCommand(KEY, 'sys.fw', {}, { protocolVersion: '1' });
    assert.equal(parseSent(writes[0]).proto, '1');
  });

  it('leaves no pending requests or busy flag behind', async () => {
    await ctl.sendApiCommand(KEY, 'sys.fw');
    assert.equal(record.state.pendingRequests.size, 0);
    assert.equal(record.state.monitorBusy, false);
  });
});
