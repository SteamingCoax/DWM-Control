'use strict';
// Tab switching (renderer.js): activateTab, ensureActiveTab, click + keyboard navigation.
const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub, makeElement } = require('./helpers/renderer-harness');

const KEYS = ['control', 'firmware', 'deembed', 'siteview'];
let ctl, buttons, panels, nav, saved, focusCalls, clickHandlers;

function build() {
  focusCalls = [];
  clickHandlers = {};
  buttons = {};
  panels = {};
  for (const key of KEYS) {
    const b = makeElement('button');
    b.classList.add('tab-button');
    b.dataset.tab = key;
    b.setAttribute('data-tab', key);
    b.focus = () => focusCalls.push(key);
    b.addEventListener = (type, fn) => { if (type === 'click') clickHandlers[key] = fn; };
    buttons[key] = b;
    const p = makeElement('section');
    p.classList.add('tab-panel');
    p.id = `${key}-panel`;
    panels[key] = p;
  }
  nav = makeElement('nav');
  nav.handlers = {};
  nav.addEventListener = (type, fn) => { nav.handlers[type] = fn; };
}

function wireDocument() {
  const d = globalThis.document;
  saved = { qsa: d.querySelectorAll, qs: d.querySelector, gid: d.getElementById };
  d.querySelectorAll = (sel) => {
    if (sel === '.tab-button') return KEYS.map(k => buttons[k]);
    if (sel === '.tab-panel') return KEYS.map(k => panels[k]);
    return [];
  };
  d.querySelector = (sel) => {
    if (sel === '.tab-navigation') return nav;
    const m = /^\[data-tab="(\w+)"\]$/.exec(sel);
    if (m) return buttons[m[1]] || null;
    if (sel === '.tab-button.active') return KEYS.map(k => buttons[k]).find(b => b.classList.contains('active')) || null;
    if (sel === '.tab-panel.active') return KEYS.map(k => panels[k]).find(p => p.classList.contains('active')) || null;
    return null;
  };
  d.getElementById = (id) => KEYS.map(k => panels[k]).find(p => p.id === id) || null;
}

function keyEvent(key, target) {
  return { key, target, prevented: false, preventDefault() { this.prevented = true; } };
}

before(() => { loadRenderer(); });
beforeEach(() => {
  build();
  wireDocument();
  ctl = makeControlStub({ uiSettings: { headerConnection: false }, tabSettings: { control: true, firmware: true, terminal: false, deembed: true, siteview: true } });
});
afterEach(() => {
  const d = globalThis.document;
  d.querySelectorAll = saved.qsa;
  d.querySelector = saved.qs;
  d.getElementById = saved.gid;
});

describe('activateTab', () => {
  it('marks the chosen tab selected and shows only its panel', () => {
    ctl.activateTab('firmware');
    for (const k of KEYS) {
      const on = k === 'firmware';
      assert.equal(buttons[k].classList.contains('active'), on, `${k} active`);
      assert.equal(buttons[k].getAttribute('aria-selected'), on ? 'true' : 'false');
      assert.equal(buttons[k].getAttribute('tabindex'), on ? '0' : '-1');
      assert.equal(panels[k].classList.contains('active'), on);
      assert.equal(panels[k].hidden, !on);
      assert.equal(panels[k].getAttribute('hidden') !== null, !on);
    }
  });

  it('returns the activated button', () => {
    assert.equal(ctl.activateTab('deembed'), buttons.deembed);
  });

  it('ignores unknown keys', () => {
    ctl.activateTab('control');
    assert.equal(ctl.activateTab('nope'), null);
    assert.ok(buttons.control.classList.contains('active'));
    assert.equal(panels.control.hidden, false);
  });
});

describe('click handling', () => {
  it('click on a tab button activates it', () => {
    ctl.setupTabSwitching();
    clickHandlers.siteview();
    assert.ok(buttons.siteview.classList.contains('active'));
    assert.equal(buttons.siteview.getAttribute('aria-selected'), 'true');
    assert.equal(panels.siteview.hidden, false);
    assert.equal(panels.control.hidden, true);
  });
});

describe('keyboard navigation', () => {
  beforeEach(() => { ctl.activateTab('control'); });

  it('registers a keydown handler on the tab navigation', () => {
    ctl.setupTabSwitching();
    assert.equal(typeof nav.handlers.keydown, 'function');
  });

  it('ArrowRight moves to the next visible tab and focuses it', () => {
    const ev = keyEvent('ArrowRight', buttons.control);
    ctl._onTabListKeydown(ev);
    assert.ok(ev.prevented);
    assert.ok(buttons.firmware.classList.contains('active'));
    assert.deepEqual(focusCalls, ['firmware']);
  });

  it('ArrowLeft wraps from the first to the last', () => {
    ctl._onTabListKeydown(keyEvent('ArrowLeft', buttons.control));
    assert.ok(buttons.siteview.classList.contains('active'));
    assert.deepEqual(focusCalls, ['siteview']);
  });

  it('ArrowRight wraps from the last to the first', () => {
    ctl.activateTab('siteview');
    ctl._onTabListKeydown(keyEvent('ArrowRight', buttons.siteview));
    assert.ok(buttons.control.classList.contains('active'));
  });

  it('Home and End jump to first and last', () => {
    ctl._onTabListKeydown(keyEvent('End', buttons.control));
    assert.ok(buttons.siteview.classList.contains('active'));
    ctl._onTabListKeydown(keyEvent('Home', buttons.siteview));
    assert.ok(buttons.control.classList.contains('active'));
  });

  it('skips hidden tabs (display none)', () => {
    buttons.firmware.style.display = 'none';
    ctl._onTabListKeydown(keyEvent('ArrowRight', buttons.control));
    assert.ok(buttons.deembed.classList.contains('active'));
    buttons.control.style.display = 'none';
    ctl._onTabListKeydown(keyEvent('Home', buttons.deembed));
    assert.ok(buttons.deembed.classList.contains('active'));
  });

  it('ignores keys from non-tab targets and other keys', () => {
    const ev = keyEvent('ArrowRight', makeElement('input'));
    ctl._onTabListKeydown(ev);
    assert.equal(ev.prevented, false);
    assert.ok(buttons.control.classList.contains('active'));
    const ev2 = keyEvent('a', buttons.control);
    ctl._onTabListKeydown(ev2);
    assert.equal(ev2.prevented, false);
    assert.deepEqual(focusCalls, []);
  });
});

describe('ensureActiveTab', () => {
  it('activates the first enabled tab when control is disabled', () => {
    ctl.tabSettings = { control: false, firmware: true, terminal: false, deembed: true, siteview: true };
    ctl.configureTabVisibility();
    ctl.ensureActiveTab();
    assert.ok(buttons.firmware.classList.contains('active'));
    assert.equal(panels.firmware.hidden, false);
    for (const k of ['control', 'deembed', 'siteview']) assert.equal(panels[k].hidden, true, k);
  });
});
