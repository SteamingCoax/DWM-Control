'use strict';
// lib/dfu-path.js is the pure core of main.js's getDfuUtilPath(): given the
// platform, arch, dev/packaged state, and a base path, it picks which
// dfu-util binary to invoke for firmware flashing. These tests pin the exact
// candidate lists, their order, and the dev-mode fallbacks, using stubbed
// fs.existsSync / fs.chmodSync so no real filesystem or Electron is needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { resolveDfuUtilPath } = require('../lib/dfu-path');

// Builds an `exists` stub backed by a Set of paths that should report true.
function existsFromSet(paths) {
  const set = new Set(paths);
  return (p) => set.has(p);
}

function makeChmodRecorder() {
  const calls = [];
  const chmod = (p, mode) => {
    calls.push([p, mode]);
  };
  return { chmod, calls };
}

const noopLog = () => {};

test('darwin, packaged: app.asar.unpacked candidate wins when it exists, and gets chmod-ed', () => {
  const basePath = '/Applications/DWM Control.app/Contents/Resources';
  const unpacked = path.join(basePath, 'app.asar.unpacked', 'Programs', 'dfu-util', 'dfu-util');
  const legacy = path.join(basePath, 'Programs', 'dfu-util', 'dfu-util');
  const { chmod, calls } = makeChmodRecorder();

  const result = resolveDfuUtilPath({
    platform: 'darwin',
    arch: 'arm64',
    isDev: false,
    basePath,
    exists: existsFromSet([unpacked, legacy]),
    chmod,
    log: noopLog,
  });

  assert.equal(result, unpacked);
  assert.deepEqual(calls, [[unpacked, 0o755]]);
});

test('darwin, packaged: falls back to the legacy Programs path when app.asar.unpacked is missing', () => {
  const basePath = '/Applications/DWM Control.app/Contents/Resources';
  const unpacked = path.join(basePath, 'app.asar.unpacked', 'Programs', 'dfu-util', 'dfu-util');
  const legacy = path.join(basePath, 'Programs', 'dfu-util', 'dfu-util');
  const { chmod, calls } = makeChmodRecorder();

  const result = resolveDfuUtilPath({
    platform: 'darwin',
    arch: 'arm64',
    isDev: false,
    basePath,
    exists: existsFromSet([legacy]),
    chmod,
    log: noopLog,
  });

  assert.equal(result, legacy);
  assert.deepEqual(calls, [[legacy, 0o755]]);
});

test('darwin, packaged: falls back to the bare system binary when neither bundled path exists', () => {
  const basePath = '/Applications/DWM Control.app/Contents/Resources';
  const { chmod, calls } = makeChmodRecorder();

  const result = resolveDfuUtilPath({
    platform: 'darwin',
    arch: 'arm64',
    isDev: false,
    basePath,
    exists: existsFromSet([]),
    chmod,
    log: noopLog,
  });

  assert.equal(result, 'dfu-util');
  assert.deepEqual(calls, []);
});

test('darwin, dev mode: always the bare system binary, regardless of what exists on disk', () => {
  const basePath = '/Users/dev/DWM-Control';
  const unpacked = path.join(basePath, 'app.asar.unpacked', 'Programs', 'dfu-util', 'dfu-util');
  const { chmod, calls } = makeChmodRecorder();

  const result = resolveDfuUtilPath({
    platform: 'darwin',
    arch: 'arm64',
    isDev: true,
    basePath,
    // Even if a bundled binary happens to exist, dev mode never looks for it.
    exists: existsFromSet([unpacked]),
    chmod,
    log: noopLog,
  });

  assert.equal(result, 'dfu-util');
  assert.deepEqual(calls, []);
});

for (const arch of ['x64', 'arm64', 'arm']) {
  test(`linux, packaged, arch=${arch}: app.asar.unpacked linux-${arch} candidate wins and is chmod-ed`, () => {
    const basePath = '/opt/DWM Control/resources';
    const unpacked = path.join(basePath, 'app.asar.unpacked', 'Programs', 'dfu-util', `linux-${arch}`, 'dfu-util');
    const legacy = path.join(basePath, 'Programs', 'dfu-util', `linux-${arch}`, 'dfu-util');
    const { chmod, calls } = makeChmodRecorder();

    const result = resolveDfuUtilPath({
      platform: 'linux',
      arch,
      isDev: false,
      basePath,
      exists: existsFromSet([unpacked, legacy]),
      chmod,
      log: noopLog,
    });

    assert.equal(result, unpacked);
    assert.deepEqual(calls, [[unpacked, 0o755]]);
  });
}

test('linux, packaged: falls back to the legacy linux-<arch> path when app.asar.unpacked is missing', () => {
  const basePath = '/opt/DWM Control/resources';
  const arch = 'x64';
  const legacy = path.join(basePath, 'Programs', 'dfu-util', `linux-${arch}`, 'dfu-util');
  const { chmod, calls } = makeChmodRecorder();

  const result = resolveDfuUtilPath({
    platform: 'linux',
    arch,
    isDev: false,
    basePath,
    exists: existsFromSet([legacy]),
    chmod,
    log: noopLog,
  });

  assert.equal(result, legacy);
  assert.deepEqual(calls, [[legacy, 0o755]]);
});

test('linux, packaged: falls back to the bare system binary when nothing bundled exists', () => {
  const basePath = '/opt/DWM Control/resources';
  const { chmod, calls } = makeChmodRecorder();

  const result = resolveDfuUtilPath({
    platform: 'linux',
    arch: 'x64',
    isDev: false,
    basePath,
    exists: existsFromSet([]),
    chmod,
    log: noopLog,
  });

  assert.equal(result, 'dfu-util');
  assert.deepEqual(calls, []);
});

test('linux, dev mode: bare system binary (no isDev short-circuit in this branch, but dev basePath will not match anyway)', () => {
  // Unlike the darwin branch, the linux branch never checks `isDev` directly
  // - it always probes the bundled candidate paths first. In dev mode the
  // caller passes basePath=__dirname, which normally has no
  // Programs/dfu-util/linux-<arch> binary, so it still falls through to the
  // bare 'dfu-util'. This test pins that (slightly inconsistent-with-darwin)
  // behaviour: passing isDev=true does NOT by itself skip the file probes.
  const basePath = '/Users/dev/DWM-Control';
  const { chmod, calls } = makeChmodRecorder();

  const result = resolveDfuUtilPath({
    platform: 'linux',
    arch: 'x64',
    isDev: true,
    basePath,
    exists: existsFromSet([]),
    chmod,
    log: noopLog,
  });

  assert.equal(result, 'dfu-util');
  assert.deepEqual(calls, []);
});

test('win32: the five candidates are probed in order, first match wins, no chmod is ever called', () => {
  const basePath = 'C:\\Program Files\\DWM Control';
  const candidates = [
    path.join(basePath, 'app.asar.unpacked', 'Programs', 'dfu-util', 'dfu-util.exe'),
    path.join(basePath, 'Programs', 'dfu-util', 'dfu-util.exe'),
    path.join(basePath, 'app', 'Programs', 'dfu-util', 'dfu-util.exe'),
    path.join(basePath, 'resources', 'app.asar.unpacked', 'Programs', 'dfu-util', 'dfu-util.exe'),
    path.join(basePath, 'resources', 'Programs', 'dfu-util', 'dfu-util.exe'),
  ];

  // Only the 3rd candidate exists; the first two must be tried and rejected first.
  const { chmod, calls } = makeChmodRecorder();
  const result = resolveDfuUtilPath({
    platform: 'win32',
    arch: 'x64',
    isDev: false,
    basePath,
    exists: existsFromSet([candidates[2]]),
    chmod,
    log: noopLog,
  });

  assert.equal(result, candidates[2]);
  assert.deepEqual(calls, []); // Windows branch never chmods.
});

test('win32: falls back to the first candidate (for error reporting) when none exist', () => {
  const basePath = 'C:\\Program Files\\DWM Control';
  const defaultPath = path.join(basePath, 'app.asar.unpacked', 'Programs', 'dfu-util', 'dfu-util.exe');

  const result = resolveDfuUtilPath({
    platform: 'win32',
    arch: 'x64',
    isDev: false,
    basePath,
    exists: existsFromSet([]),
    chmod: () => {},
    log: noopLog,
  });

  assert.equal(result, defaultPath);
});

test('win32, isDev=true: dev is not special-cased for Windows, same five candidates apply', () => {
  // The Windows branch, like Linux, never reads `isDev`; only darwin does.
  const basePath = 'C:\\dev\\DWM-Control';
  const defaultPath = path.join(basePath, 'app.asar.unpacked', 'Programs', 'dfu-util', 'dfu-util.exe');

  const result = resolveDfuUtilPath({
    platform: 'win32',
    arch: 'x64',
    isDev: true,
    basePath,
    exists: existsFromSet([]),
    chmod: () => {},
    log: noopLog,
  });

  assert.equal(result, defaultPath);
});

test('log callback receives diagnostic lines instead of writing straight to console', () => {
  const basePath = '/Applications/DWM Control.app/Contents/Resources';
  const lines = [];
  const log = (...args) => lines.push(args.join(' '));

  resolveDfuUtilPath({
    platform: 'darwin',
    arch: 'arm64',
    isDev: false,
    basePath,
    exists: existsFromSet([]),
    chmod: () => {},
    log,
  });

  assert.ok(lines.length > 0);
  assert.ok(lines.some((l) => l.includes('macOS testing path')));
  assert.ok(lines.some((l) => l.includes('Bundled dfu-util not found, falling back to system')));
});
