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
      accessibility: {
        speechEnabled: false,
        speechMode: 'interval',
        speechIntervalS: 5,
        speechChangePct: 10,
        speechMinGapMs: 1500,
        speechMetric: 'avg',
        speechRate: 1.0,
        speechVolume: 1.0,
        speechVoice: '',
        speechIncludeMeterName: true,
        speechIncludeSwr: true,
        toneEnabled: false,
        toneMinHz: 100,
        toneMaxHz: 1000,
        toneVolume: 0.3,
        toneWave: 'sine',
        toneMuteBelowPct: 1,
        announcements: 'auto',
        shortcutsEnabled: true,
        focusedMeterKey: null,
      },
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

describe('accessibility config', () => {
  it('loadConfig defaults include the accessibility block', () => {
    const cfg = ctl.loadConfig();
    assert.ok(cfg.accessibility, 'accessibility block must be present');
    const defaults = ctl._accessibilityDefaults();
    assert.deepEqual(cfg.accessibility, defaults);
    assert.equal(cfg.accessibility.speechEnabled, false);
    assert.equal(cfg.accessibility.speechMode, 'interval');
    assert.equal(cfg.accessibility.speechIntervalS, 5);
    assert.equal(cfg.accessibility.speechChangePct, 10);
    assert.equal(cfg.accessibility.speechMinGapMs, 1500);
    assert.equal(cfg.accessibility.speechMetric, 'avg');
    assert.equal(cfg.accessibility.speechRate, 1.0);
    assert.equal(cfg.accessibility.speechVolume, 1.0);
    assert.equal(cfg.accessibility.speechVoice, '');
    assert.equal(cfg.accessibility.speechIncludeMeterName, true);
    assert.equal(cfg.accessibility.speechIncludeSwr, true);
    assert.equal(cfg.accessibility.toneEnabled, false);
    assert.equal(cfg.accessibility.toneMinHz, 100);
    assert.equal(cfg.accessibility.toneMaxHz, 1000);
    assert.equal(cfg.accessibility.toneVolume, 0.3);
    assert.equal(cfg.accessibility.toneWave, 'sine');
    assert.equal(cfg.accessibility.toneMuteBelowPct, 1);
    assert.equal(cfg.accessibility.announcements, 'auto');
    assert.equal(cfg.accessibility.shortcutsEnabled, true);
    assert.equal(cfg.accessibility.focusedMeterKey, null);
  });

  it('normalizeAccessibility returns defaults for non-objects', () => {
    const defaults = ctl._accessibilityDefaults();
    assert.deepEqual(ctl.normalizeAccessibility(undefined), defaults);
    assert.deepEqual(ctl.normalizeAccessibility(null), defaults);
    assert.deepEqual(ctl.normalizeAccessibility('x'), defaults);
    assert.deepEqual(ctl.normalizeAccessibility(42), defaults);
  });

  it('drops unknown keys', () => {
    const input = {
      speechEnabled: true,
      unknownKey: 'should-be-dropped',
      anotherBadKey: 123,
    };
    const normalized = ctl.normalizeAccessibility(input);
    assert.ok(!('unknownKey' in normalized), 'unknown keys must be dropped');
    assert.ok(!('anotherBadKey' in normalized), 'unknown keys must be dropped');
    assert.equal(normalized.speechEnabled, true);
  });

  it('clamps speechIntervalS 0->1 and 999->60, and speechMinGapMs 1->500 and 99999->10000', () => {
    // speechIntervalS: clamp to 1..60
    assert.equal(ctl.normalizeAccessibility({ speechIntervalS: 0 }).speechIntervalS, 1);
    assert.equal(ctl.normalizeAccessibility({ speechIntervalS: 999 }).speechIntervalS, 60);
    assert.equal(ctl.normalizeAccessibility({ speechIntervalS: 30 }).speechIntervalS, 30);
    assert.equal(ctl.normalizeAccessibility({ speechIntervalS: 30.7 }).speechIntervalS, 30, 'must truncate to int');

    // speechMinGapMs: clamp to 500..10000
    assert.equal(ctl.normalizeAccessibility({ speechMinGapMs: 1 }).speechMinGapMs, 500);
    assert.equal(ctl.normalizeAccessibility({ speechMinGapMs: 99999 }).speechMinGapMs, 10000);
    assert.equal(ctl.normalizeAccessibility({ speechMinGapMs: 2000 }).speechMinGapMs, 2000);
    assert.equal(ctl.normalizeAccessibility({ speechMinGapMs: 2000.7 }).speechMinGapMs, 2000, 'must truncate to int');
  });

  it('rejects invalid enums and out-of-range numbers back to defaults', () => {
    // Invalid speechMode -> default
    assert.equal(ctl.normalizeAccessibility({ speechMode: 'bogus' }).speechMode, 'interval');
    // Invalid speechMetric -> default
    assert.equal(ctl.normalizeAccessibility({ speechMetric: 'dev' }).speechMetric, 'avg');
    // Invalid toneWave -> default
    assert.equal(ctl.normalizeAccessibility({ toneWave: 'noise' }).toneWave, 'sine');
    // Invalid announcements -> default
    assert.equal(ctl.normalizeAccessibility({ announcements: 'loud' }).announcements, 'auto');

    // Out-of-range numbers -> defaults
    assert.equal(ctl.normalizeAccessibility({ speechRate: 5 }).speechRate, 1.0);
    assert.equal(ctl.normalizeAccessibility({ toneVolume: -1 }).toneVolume, 0.3);
    assert.equal(ctl.normalizeAccessibility({ toneMinHz: 10 }).toneMinHz, 100);
    assert.equal(ctl.normalizeAccessibility({ speechChangePct: 0 }).speechChangePct, 10);
    assert.equal(ctl.normalizeAccessibility({ speechChangePct: 101 }).speechChangePct, 10);
  });

  it('forces toneMaxHz above toneMinHz', () => {
    // If max < min after normalization, set max to max(min + 50, default), capped at 8000
    // Case 1: toneMinHz is 1000, toneMaxHz is 900 (rejected as < min), becomes 1050
    const result = ctl.normalizeAccessibility({ toneMinHz: 1000, toneMaxHz: 900 });
    assert.ok(result.toneMaxHz > result.toneMinHz, 'toneMaxHz must be > toneMinHz');
    assert.equal(result.toneMaxHz, 1050, 'toneMaxHz should be set to min + 50 when that exceeds default');

    // Case 2: toneMinHz is 1500, toneMaxHz is 1400 (rejected as < min), becomes 1550
    const result2 = ctl.normalizeAccessibility({ toneMinHz: 1500, toneMaxHz: 1400 });
    assert.ok(result2.toneMaxHz > result2.toneMinHz);
    assert.equal(result2.toneMaxHz, 1550, 'toneMaxHz should be set to min + 50 when that exceeds default');
  });

  it('keeps a non-empty focusedMeterKey string and nulls anything else', () => {
    assert.equal(ctl.normalizeAccessibility({ focusedMeterKey: 'usbmodem:abc' }).focusedMeterKey, 'usbmodem:abc');
    assert.equal(ctl.normalizeAccessibility({ focusedMeterKey: 123 }).focusedMeterKey, null);
    assert.equal(ctl.normalizeAccessibility({ focusedMeterKey: '' }).focusedMeterKey, null);
    assert.equal(ctl.normalizeAccessibility({ focusedMeterKey: null }).focusedMeterKey, null);
  });

  it('round trip: a stored valid accessibility object survives loadConfig', () => {
    const customA11y = {
      speechEnabled: true,
      speechMode: 'change',
      speechIntervalS: 10,
      speechChangePct: 20,
      speechMinGapMs: 2000,
      speechMetric: 'peak',
      speechRate: 1.5,
      speechVolume: 0.8,
      speechVoice: 'com.apple.speech.synthesis.voice.Victoria',
      speechIncludeMeterName: false,
      speechIncludeSwr: false,
      toneEnabled: true,
      toneMinHz: 200,
      toneMaxHz: 2000,
      toneVolume: 0.5,
      toneWave: 'triangle',
      toneMuteBelowPct: 5,
      announcements: 'both',
      shortcutsEnabled: false,
      focusedMeterKey: 'usbmodem:xyz',
    };
    const fullConfig = {
      layoutVersion: 2,
      theme: 'light',
      accessibility: customA11y,
    };
    globalThis.localStorage.setItem(MAIN_KEY, JSON.stringify(fullConfig));

    const loaded = ctl.loadConfig();
    assert.deepEqual(loaded.accessibility, customA11y);
    assert.equal(loaded.accessibility.speechEnabled, true);
    assert.equal(loaded.accessibility.toneMinHz, 200);
    assert.equal(loaded.accessibility.toneMaxHz, 2000);
    assert.equal(loaded.accessibility.focusedMeterKey, 'usbmodem:xyz');
  });

  it('stored config without an accessibility block gets the defaults', () => {
    globalThis.localStorage.setItem(MAIN_KEY, JSON.stringify({
      layoutVersion: 2,
      theme: 'light',
    }));
    const loaded = ctl.loadConfig();
    assert.deepEqual(loaded.accessibility, ctl._accessibilityDefaults());
  });
});
