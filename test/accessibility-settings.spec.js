'use strict';
const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub, makeElement } = require('./helpers/renderer-harness');
const { extractTags, findById, stripTags } = require('./helpers/html-tags');

let origSpeech; let origAC; let origGet;
before(() => { loadRenderer(); origSpeech = globalThis.speechSynthesis; origAC = globalThis.AudioContext; origGet = document.getElementById; });
afterEach(() => { globalThis.speechSynthesis = origSpeech; document.getElementById = origGet; });

const voices = [
  { name: 'Alex', lang: 'en-US', voiceURI: 'uri-alex' },
  { name: 'Amelie', lang: 'fr-CA', voiceURI: 'uri-amelie' },
];

function makeCtl(acc) {
  const ctl = makeControlStub({ config: { accessibility: { ...acc } } });
  ctl.config.accessibility = ctl.normalizeAccessibility(acc);
  return ctl;
}

describe('rendered settings group', () => {
  beforeEach(() => { globalThis.speechSynthesis.voices = voices; });
  afterEach(() => { globalThis.speechSynthesis.voices = []; });

  it('labels every a11y control', () => {
    const html = makeCtl({})._a11yRenderSettingsGroup();
    assert.ok(findById(html, 'a11y-settings'));
    const labelFors = extractTags(html, 'label').map((l) => l.attrs.for).filter(Boolean);
    const controls = [...extractTags(html, 'input'), ...extractTags(html, 'select')].filter((t) => String(t.attrs.id || '').startsWith('a11y-'));
    assert.ok(controls.length >= 16);
    for (const c of controls) assert.ok(labelFors.includes(c.attrs.id), `no label for ${c.attrs.id}`);
    assert.match(stripTags(html), /Accessibility/);
    assert.match(html, /<details>\s*<summary>Shortcuts<\/summary>/);
  });

  it('reflects a non-default config', () => {
    const html = makeCtl({ speechEnabled: true, speechMode: 'change', toneMinHz: 200, announcements: 'both', toneWave: 'square' })._a11yRenderSettingsGroup();
    assert.ok('checked' in findById(html, 'a11y-speech-enabled').attrs);
    assert.equal(findById(html, 'a11y-tone-enabled').attrs.checked, undefined);
    assert.equal(findById(html, 'a11y-tone-min-hz').attrs.value, '200');
    const selected = (id) => {
      const sel = findById(html, id);
      return extractTags(sel.inner, 'option').filter((o) => 'selected' in o.attrs).map((o) => o.attrs.value);
    };
    assert.deepEqual(selected('a11y-speech-mode'), ['change']);
    assert.deepEqual(selected('a11y-announcements'), ['both']);
    assert.deepEqual(selected('a11y-tone-wave'), ['square']);
  });

  it('lists voices and selects the configured one', () => {
    const html = makeCtl({ speechVoice: 'uri-amelie' })._a11yRenderSettingsGroup();
    const opts = extractTags(findById(html, 'a11y-speech-voice').inner, 'option');
    assert.deepEqual(opts.map((o) => o.attrs.value), ['', 'uri-alex', 'uri-amelie']);
    assert.match(html, /Amelie \(fr-CA\)/);
    assert.deepEqual(opts.filter((o) => 'selected' in o.attrs).map((o) => o.attrs.value), ['uri-amelie']);
  });

  it('shows a disabled placeholder with no voices', () => {
    globalThis.speechSynthesis.voices = [];
    const html = makeCtl({})._a11yRenderSettingsGroup();
    const opts = extractTags(findById(html, 'a11y-speech-voice').inner, 'option');
    assert.ok(opts.some((o) => 'disabled' in o.attrs && /No voices available/.test(o.inner)));
  });
});

describe('form binding', () => {
  let els; let handlers; let ctl; let saves;
  beforeEach(() => {
    els = {}; handlers = {}; saves = 0;
    globalThis.speechSynthesis.cancelCount = 0;
    globalThis.AudioContext = origAC;
    origAC.instances.length = 0;
    const ids = ['speech-enabled', 'speech-mode', 'speech-interval', 'tone-enabled', 'tone-wave', 'tone-volume'];
    for (const s of ids) {
      const el = makeElement('input');
      el.id = `a11y-${s}`;
      el.addEventListener = (type, fn) => { if (type === 'change') handlers[el.id] = fn; };
      els[el.id] = el;
    }
    document.getElementById = (id) => els[id] || null;
    ctl = makeCtl({});
    ctl.saveConfig = () => { saves++; };
    ctl._a11yBindSettingsEvents();
  });

  it('reads only controls that exist', () => {
    els['a11y-speech-interval'].value = '12';
    els['a11y-speech-enabled'].checked = true;
    els['a11y-speech-mode'].value = 'manual';
    const got = ctl._a11yReadSettingsForm();
    assert.deepEqual(Object.keys(got).sort(), ['speechEnabled', 'speechIntervalS', 'speechMode', 'toneEnabled', 'toneVolume', 'toneWave'].sort());
    assert.equal(got.speechIntervalS, 12);
    assert.equal(got.speechEnabled, true);
  });

  it('normalizes and saves on change', () => {
    els['a11y-speech-interval'].value = '999';
    els['a11y-speech-mode'].value = 'change';
    els['a11y-tone-volume'].value = '0.4';
    handlers['a11y-speech-interval']();
    assert.equal(ctl.config.accessibility.speechIntervalS, 60);
    assert.equal(ctl.config.accessibility.speechMode, 'change');
    assert.equal(ctl.config.accessibility.toneVolume, 0.4);
    assert.equal(saves, 1);
  });

  it('starts and stops the tone', () => {
    els['a11y-tone-enabled'].checked = true;
    handlers['a11y-tone-enabled']();
    assert.equal(origAC.instances.length, 1);
    assert.equal(ctl.a11y.tone.running, true);
    const osc = ctl.a11y.tone.osc;
    assert.equal(osc.started, 1);
    els['a11y-tone-wave'].value = 'square';
    els['a11y-tone-volume'].value = '0.5';
    handlers['a11y-tone-wave']();
    assert.equal(osc.type, 'square');
    assert.equal(ctl.a11y.tone.gain.gain.value, 0.5);
    els['a11y-tone-enabled'].checked = false;
    handlers['a11y-tone-enabled']();
    assert.equal(ctl.a11y.tone.running, false);
  });

  it('cancels speech when spoken readouts are turned off', () => {
    els['a11y-speech-enabled'].checked = false;
    handlers['a11y-speech-enabled']();
    assert.equal(globalThis.speechSynthesis.cancelCount, 1);
  });

  it('skips missing elements', () => {
    document.getElementById = () => null;
    assert.doesNotThrow(() => ctl._a11yBindSettingsEvents());
    assert.deepEqual(ctl._a11yReadSettingsForm(), {});
  });
});
