'use strict';
// loadConfig/saveConfig (renderer/modules/extensions.js), persisted in localStorage under
// 'dwm-control-config' with a 'dwm-control-config-backup' mirror.
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub } = require('./helpers/renderer-harness');

const MAIN_KEY = 'dwm-control-config';
const BACKUP_KEY = 'dwm-control-config-backup';

let ctl;

before(() => {
  loadRenderer();
  ctl = makeControlStub();
  // makeControlStub() installs a no-op saveConfig as an *own* property (for tests that
  // don't want persistence side effects), which shadows DWMControl.prototype.saveConfig.
  // This file is specifically testing the real saveConfig, so remove the shadow and fall
  // through to the prototype implementation.
  delete ctl.saveConfig;
});

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe('loadConfig defaults', () => {
  it('returns the documented defaults when storage is empty, without writing anything back', () => {
    const cfg = ctl.loadConfig();
    assert.equal(cfg.layoutVersion, 2);
    assert.equal(cfg.theme, 'dark');
    assert.equal(cfg.outputVisible, false);
    assert.equal(cfg.lastDevice, null);
    assert.equal(cfg.lastPort, null);
    assert.equal(cfg.lastBaud, 115200);
    assert.equal(cfg.globalSampleIntervalMs, 100);
    assert.equal(cfg.usbApiProtocolVersion, 2);
    assert.equal(cfg.usbApiAcceptLegacyV1, true);
    assert.equal(cfg.globalDebugLoggingEnabled, false);
    assert.deepEqual(cfg.meterCardOrder, []);
    assert.deepEqual(cfg.boardCardOrder, []);
    assert.deepEqual(cfg.swrCards, []);
    assert.deepEqual(cfg.meterCards, {});
    assert.equal(cfg.deembedPowerUnit, 'W');
    assert.equal(cfg.deembedVoltageMode, 'manual');
    assert.equal(cfg.deembedPowerRating, null);

    // The empty-storage path returns early and must not self-heal into empty storage.
    assert.equal(globalThis.localStorage.getItem(MAIN_KEY), null);
    assert.equal(globalThis.localStorage.getItem(BACKUP_KEY), null);
  });
});

describe('saveConfig', () => {
  it('writes the same JSON payload to both the main and backup keys', () => {
    ctl.config = { theme: 'light', lastBaud: 9600, nested: { a: 1 } };
    ctl.saveConfig();
    const expected = JSON.stringify(ctl.config);
    assert.equal(globalThis.localStorage.getItem(MAIN_KEY), expected);
    assert.equal(globalThis.localStorage.getItem(BACKUP_KEY), expected);
  });

  it('does not throw when this.config cannot be JSON-serialized', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    ctl.config = cyclic;
    assert.doesNotThrow(() => ctl.saveConfig());
    // Nothing valid could be written; the key from the previous test's clear() stays empty.
    assert.equal(globalThis.localStorage.getItem(MAIN_KEY), null);
  });
});

describe('loadConfig / saveConfig round trip', () => {
  it('a full, already-valid config survives save + load unchanged', () => {
    const full = {
      layoutVersion: 3,
      theme: 'light',
      outputVisible: true,
      lastDevice: 'dev-1',
      lastPort: '/dev/tty.usbmodemABC',
      lastBaud: 9600,
      globalSampleIntervalMs: 250,
      usbApiProtocolVersion: 1,
      usbApiAcceptLegacyV1: false,
      globalDebugLoggingEnabled: true,
      deembedPowerUnit: 'dBm',
      deembedVoltageMode: 'auto',
      deembedPowerRating: 100,
      meterCardOrder: ['usbmodem:ABC'],
      boardCardOrder: ['meter:usbmodem:ABC', 'swr:swr1'],
      meterCards: {
        'usbmodem:ABC': {
          viewMode: 'history',
          cardLayout: 'dual',
          gaugeMetricL: 'peak',
          gaugeMetricR: 'avg',
          gaugeDisplayL: 'gauge',
          gaugeDisplayR: 'numeric',
          historyWindowMs: 5000,
          historyLines: ['avg', 'peak'],
          pepHoldMs: 200,
        },
      },
      swrCards: [
        {
          id: 'swr1',
          fwdKey: 'usbmodem:ABC',
          refKey: 'usbmodem:DEF',
          fwdMetric: 'avg',
          refMetric: 'peak',
          viewMode: 'gauges',
          cardLayout: 'both',
          historyWindowMs: 1000,
        },
      ],
    };

    ctl.config = full;
    ctl.saveConfig();

    const fresh = makeControlStub();
    const loaded = fresh.loadConfig();
    assert.deepEqual(loaded, full);

    // loadConfig re-serializes the normalized object (whose key order differs from `full`'s
    // insertion order - defaultConfig's keys come first), so compare parsed values, not raw text.
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(MAIN_KEY)), full);
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(BACKUP_KEY)), full);
  });
});

describe('loadConfig corruption recovery', () => {
  it('falls back to the backup key when the main key is corrupt JSON, and self-heals both keys', () => {
    const backupConfig = { theme: 'light', lastBaud: 57600, layoutVersion: 5 };
    globalThis.localStorage.setItem(MAIN_KEY, '{not valid json');
    globalThis.localStorage.setItem(BACKUP_KEY, JSON.stringify(backupConfig));

    const loaded = ctl.loadConfig();
    assert.equal(loaded.theme, 'light');
    assert.equal(loaded.lastBaud, 57600);
    assert.equal(loaded.layoutVersion, 5);
    // Untouched defaults still present because normalization spreads defaultConfig first.
    assert.equal(loaded.deembedPowerUnit, 'W');

    // Self-heal: the corrupt main key must be replaced with the normalized JSON,
    // and the backup rewritten to match exactly (they were not equal before).
    const normalizedJson = JSON.stringify(loaded);
    assert.equal(globalThis.localStorage.getItem(MAIN_KEY), normalizedJson);
    assert.equal(globalThis.localStorage.getItem(BACKUP_KEY), normalizedJson);
  });

  it('returns defaults when both keys are corrupt JSON', () => {
    globalThis.localStorage.setItem(MAIN_KEY, '{nope');
    globalThis.localStorage.setItem(BACKUP_KEY, 'also not json');
    const loaded = ctl.loadConfig();
    assert.equal(loaded.theme, 'dark');
    assert.equal(loaded.layoutVersion, 2);
  });
});

describe('loadConfig normalisation', () => {
  it('coerces layoutVersion to a number and clamps it to a minimum of 1', () => {
    globalThis.localStorage.setItem(MAIN_KEY, JSON.stringify({ layoutVersion: 'not-a-number' }));
    assert.equal(ctl.loadConfig().layoutVersion, 1);
  });

  it('falls back to the default layoutVersion when the stored value is falsy (e.g. 0)', () => {
    globalThis.localStorage.setItem(MAIN_KEY, JSON.stringify({ layoutVersion: 0 }));
    assert.equal(ctl.loadConfig().layoutVersion, 2);
  });

  it('keeps a valid numeric layoutVersion as-is', () => {
    globalThis.localStorage.setItem(MAIN_KEY, JSON.stringify({ layoutVersion: 7 }));
    assert.equal(ctl.loadConfig().layoutVersion, 7);
  });

  it('drops out-of-range enum fields on per-meter card prefs but keeps valid ones', () => {
    const raw = {
      meterCards: {
        'usbmodem:XYZ': {
          viewMode: 'not-a-real-mode',       // invalid -> dropped
          cardLayout: 'triple-wide',         // invalid -> dropped
          gaugeMetricL: 'peak',              // valid -> kept
          gaugeDisplayR: 'numeric',          // valid -> kept
          historyLines: ['avg', 'bogus', 'avg'], // invalid entries filtered, dupes collapsed
          pepHoldMs: -5,                     // negative -> dropped
        },
      },
    };
    globalThis.localStorage.setItem(MAIN_KEY, JSON.stringify(raw));
    const prefs = ctl.loadConfig().meterCards['usbmodem:XYZ'];

    assert.ok(!('viewMode' in prefs), 'invalid viewMode must be dropped, not merely falsy');
    assert.ok(!('cardLayout' in prefs), 'invalid cardLayout must be dropped');
    assert.equal(prefs.gaugeMetricL, 'peak');
    assert.equal(prefs.gaugeDisplayR, 'numeric');
    assert.deepEqual(prefs.historyLines, ['avg']);
    assert.ok(!('pepHoldMs' in prefs), 'negative pepHoldMs must be dropped');
  });

  it('fills in swrCards defaults for missing fields but keeps the required id', () => {
    globalThis.localStorage.setItem(MAIN_KEY, JSON.stringify({
      swrCards: [{ id: 'swr-minimal' }],
    }));
    const [card] = ctl.loadConfig().swrCards;
    assert.equal(card.id, 'swr-minimal');
    assert.equal(card.fwdKey, null);
    assert.equal(card.refKey, null);
    assert.equal(card.fwdMetric, 'avg');
    assert.equal(card.refMetric, 'avg');
    assert.equal(card.viewMode, 'gauges');
    assert.equal(card.cardLayout, 'both');
    assert.equal(card.historyWindowMs, 30000);
  });

  it('discards swrCards entries without a valid string id', () => {
    globalThis.localStorage.setItem(MAIN_KEY, JSON.stringify({
      swrCards: [{ id: 'keep-me' }, { fwdKey: 'a' }, { id: 42 }, null, 'not-an-object'],
    }));
    const cards = ctl.loadConfig().swrCards;
    assert.equal(cards.length, 1);
    assert.equal(cards[0].id, 'keep-me');
  });

  it('synthesizes boardCardOrder from meterCardOrder/swrCards when missing', () => {
    globalThis.localStorage.setItem(MAIN_KEY, JSON.stringify({
      meterCardOrder: ['usbmodem:A', 'usbmodem:B'],
      swrCards: [{ id: 'swr9' }],
    }));
    const cfg = ctl.loadConfig();
    assert.deepEqual(cfg.boardCardOrder, ['meter:usbmodem:A', 'meter:usbmodem:B', 'swr:swr9']);
  });
});
