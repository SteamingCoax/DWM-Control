'use strict';
// Settings dialog (renderer/modules/settings.js + index.html): markup, panel rendering,
// tab switching, open/close focus handling, and the Control/Updates bindings.
const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadRenderer, makeControlStub, makeElement, RENDERER_SCRIPTS, ROOT } = require('./helpers/renderer-harness');
const { extractTags, findById } = require('./helpers/html-tags');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const KEYS = ['general', 'control', 'accessibility', 'updates'];

let saved;
before(() => { loadRenderer(); });
beforeEach(() => {
  const d = globalThis.document;
  saved = { gid: d.getElementById, qsa: d.querySelectorAll, qs: d.querySelector, active: d.activeElement, api: globalThis.window.electronAPI };
});
afterEach(() => {
  const d = globalThis.document;
  d.getElementById = saved.gid;
  d.querySelectorAll = saved.qsa;
  d.querySelector = saved.qs;
  d.activeElement = saved.active;
  globalThis.window.electronAPI = saved.api;
});

function labelFors(markup) {
  return extractTags(markup, 'label').map(l => l.attrs.for).filter(Boolean);
}

describe('index.html settings markup', () => {
  it('has a gear button with an accessible name in the titlebar', () => {
    const btn = findById(html, 'settings-button');
    assert.ok(btn, '#settings-button exists');
    assert.equal(btn.tag.toLowerCase(), 'button');
    assert.equal(btn.attrs['aria-label'], 'Settings');
  });

  it('no longer carries a static theme select (settings.js renders it)', () => {
    assert.equal(findById(html, 'theme-select'), null);
    assert.equal(/theme-select-wrap/.test(html), false);
  });

  it('has a labelled dialog with a close button', () => {
    const dlg = findById(html, 'app-settings-dialog');
    assert.ok(dlg, '#app-settings-dialog exists');
    assert.equal(dlg.tag.toLowerCase(), 'dialog');
    assert.ok(findById(html, dlg.attrs['aria-labelledby']), 'aria-labelledby resolves');
    const close = findById(html, 'app-settings-close');
    assert.ok(close);
    assert.ok(close.attrs['aria-label']);
  });

  it('has a tablist of four tabs wired to four tabpanels, exactly one selected', () => {
    const list = extractTags(html, 'div').find(t => String(t.attrs.class || '').split(/\s+/).includes('settings-tabs'));
    assert.ok(list);
    assert.equal(list.attrs.role, 'tablist');
    assert.ok(list.attrs['aria-label']);
    const tabs = extractTags(html, 'button').filter(t => String(t.attrs.class || '').split(/\s+/).includes('settings-tab'));
    assert.deepEqual(tabs.map(t => t.attrs['data-settings-tab']), KEYS);
    let selected = 0;
    for (const tab of tabs) {
      assert.equal(tab.attrs.role, 'tab');
      assert.equal(tab.attrs.id, `settings-tab-${tab.attrs['data-settings-tab']}`);
      const panel = findById(html, tab.attrs['aria-controls']);
      assert.ok(panel, `panel for ${tab.attrs.id}`);
      assert.equal(panel.attrs.role, 'tabpanel');
      assert.equal(panel.attrs['aria-labelledby'], tab.attrs.id);
      const on = tab.attrs['aria-selected'] === 'true';
      if (on) selected += 1;
      assert.equal(tab.attrs.tabindex, on ? '0' : '-1');
      assert.equal(panel.attrs.hidden === undefined, on, `${panel.attrs.id} hidden iff not selected`);
    }
    assert.equal(selected, 1);
    assert.equal(tabs[0].attrs['aria-selected'], 'true', 'general selected by default');
  });

  it('loads settings.js after accessibility.js and keeps RENDERER_SCRIPTS in step', () => {
    const srcs = extractTags(html, 'script').map(s => s.attrs.src).filter(s => s && !s.includes('node_modules'))
      .map(s => s.replace(/^\.\//, ''));
    assert.deepEqual(srcs, RENDERER_SCRIPTS);
    const i = RENDERER_SCRIPTS.indexOf('renderer/modules/settings.js');
    assert.equal(RENDERER_SCRIPTS[i - 1], 'renderer/modules/accessibility.js');
  });
});

describe('_renderSettingsPanel', () => {
  it('control panel carries every field with a label', () => {
    const out = makeControlStub({ config: { globalAutoStartPolling: false } })._renderSettingsPanel('control');
    const fors = labelFors(out);
    for (const id of ['global-timing-ms', 'global-board-layout', 'global-debug-logging', 'global-auto-start-polling']) {
      assert.ok(findById(out, id), `#${id}`);
      assert.ok(fors.includes(id), `label for #${id}`);
    }
    assert.equal(findById(out, 'global-auto-start-polling').attrs.checked, undefined);
    const on = makeControlStub({ config: {} })._renderSettingsPanel('control');
    assert.ok('checked' in findById(on, 'global-auto-start-polling').attrs, 'auto-start defaults on');
  });

  it('general panel renders the theme select with the configured theme selected', () => {
    const out = makeControlStub({ config: { theme: 'ocean' } })._renderSettingsPanel('general');
    const sel = findById(out, 'theme-select');
    assert.ok(sel);
    assert.ok(labelFors(out).includes('theme-select'));
    const opts = extractTags(out, 'option');
    assert.deepEqual(opts.map(o => o.attrs.value), ['dark', 'light', 'ocean', 'carbon', 'amber']);
    assert.deepEqual(opts.filter(o => 'selected' in o.attrs).map(o => o.attrs.value), ['ocean']);
    const def = extractTags(makeControlStub({ config: {} })._renderSettingsPanel('general'), 'option');
    assert.deepEqual(def.filter(o => 'selected' in o.attrs).map(o => o.attrs.value), ['carbon']);
  });

  it('accessibility panel reuses the a11y settings group', () => {
    const ctl = makeControlStub({ config: {} });
    assert.ok(findById(ctl._renderSettingsPanel('accessibility'), 'a11y-settings'));
  });

  it('updates panel has the beta checkbox, version slot and check button', () => {
    const out = makeControlStub({ config: {} })._renderSettingsPanel('updates');
    assert.ok(findById(out, 'update-channel-beta'));
    assert.ok(labelFors(out).includes('update-channel-beta'));
    assert.ok(findById(out, 'settings-app-version'));
    assert.ok(findById(out, 'settings-check-updates'));
  });

  it('unknown key renders nothing', () => {
    assert.equal(makeControlStub()._renderSettingsPanel('nope'), '');
  });
});

// ─── DOM-backed tests ─────────────────────────────────────────────────────────

function buildDialogDom() {
  const els = {};
  const focusLog = [];
  const buttons = KEYS.map((k) => {
    const b = makeElement('button');
    b.id = `settings-tab-${k}`;
    b.classList.add('settings-tab');
    b.setAttribute('data-settings-tab', k);
    b.focus = () => focusLog.push(k);
    els[b.id] = b;
    return b;
  });
  const panels = KEYS.map((k) => {
    const p = makeElement('section');
    p.id = `settings-panel-${k}`;
    p.classList.add('settings-panel');
    els[p.id] = p;
    return p;
  });
  const dialog = makeElement('dialog');
  dialog.open = false;
  dialog.calls = [];
  dialog.handlers = {};
  dialog.showModal = function() { this.calls.push('showModal'); this.open = true; };
  dialog.close = function() { this.calls.push('close'); this.open = false; };
  dialog.addEventListener = (type, fn) => { dialog.handlers[type] = fn; };
  els['app-settings-dialog'] = dialog;
  const d = globalThis.document;
  d.getElementById = (id) => els[id] || null;
  d.querySelectorAll = (sel) => {
    if (sel === '.settings-tab') return buttons;
    if (sel === '.settings-panel') return panels;
    return [];
  };
  return { els, buttons, panels, dialog, focusLog };
}

function keyEvent(key, target) {
  return { key, target, prevented: false, preventDefault() { this.prevented = true; } };
}

describe('activateSettingsTab', () => {
  it('selects one tab and shows only its panel', () => {
    const { buttons, panels } = buildDialogDom();
    const ctl = makeControlStub();
    const ret = ctl.activateSettingsTab('updates');
    assert.equal(ret, buttons[3]);
    KEYS.forEach((k, i) => {
      const on = k === 'updates';
      assert.equal(buttons[i].classList.contains('active'), on);
      assert.equal(buttons[i].getAttribute('aria-selected'), on ? 'true' : 'false');
      assert.equal(buttons[i].getAttribute('tabindex'), on ? '0' : '-1');
      assert.equal(panels[i].hidden, !on);
      assert.equal(panels[i].getAttribute('hidden') !== null, !on);
    });
  });

  it('returns null for an unknown key and changes nothing', () => {
    const { buttons } = buildDialogDom();
    const ctl = makeControlStub();
    assert.equal(ctl.activateSettingsTab('bogus'), null);
    assert.equal(buttons[0].getAttribute('aria-selected'), null);
  });
});

describe('openSettings / closeSettings', () => {
  it('opens modally on the requested tab and focuses it', () => {
    const { dialog, buttons, focusLog } = buildDialogDom();
    const ctl = makeControlStub();
    ctl.openSettings('control');
    assert.deepEqual(dialog.calls, ['showModal']);
    assert.equal(buttons[1].getAttribute('aria-selected'), 'true');
    assert.deepEqual(focusLog, ['control']);
  });

  it('does not call showModal again when already open', () => {
    const { dialog } = buildDialogDom();
    const ctl = makeControlStub();
    ctl.openSettings('general');
    ctl.openSettings('updates');
    assert.deepEqual(dialog.calls, ['showModal']);
  });

  it('reopens on the last used tab by default', () => {
    const { buttons } = buildDialogDom();
    const ctl = makeControlStub();
    ctl.openSettings('accessibility');
    ctl.closeSettings();
    ctl.openSettings();
    assert.equal(buttons[2].getAttribute('aria-selected'), 'true');
  });

  it('closeSettings closes and restores focus to the previous element', () => {
    const { dialog } = buildDialogDom();
    const prev = makeElement('button');
    let restored = 0;
    prev.focus = () => { restored += 1; };
    globalThis.document.activeElement = prev;
    const ctl = makeControlStub();
    ctl.openSettings('general');
    ctl.closeSettings();
    assert.deepEqual(dialog.calls, ['showModal', 'close']);
    assert.equal(restored, 1);
  });

  it('tolerates a missing dialog', () => {
    globalThis.document.getElementById = () => null;
    const ctl = makeControlStub();
    assert.doesNotThrow(() => { ctl.openSettings(); ctl.closeSettings(); });
  });
});

describe('settings tablist keyboard', () => {
  it('ArrowRight/Left/Home/End move selection and focus with wrap', () => {
    const { buttons, focusLog } = buildDialogDom();
    const ctl = makeControlStub();
    ctl.activateSettingsTab('general');
    let e = keyEvent('ArrowRight', buttons[0]);
    ctl._onSettingsTabKeydown(e);
    assert.ok(e.prevented);
    assert.equal(buttons[1].getAttribute('aria-selected'), 'true');
    ctl._onSettingsTabKeydown(keyEvent('ArrowLeft', buttons[0]));
    assert.equal(buttons[3].getAttribute('aria-selected'), 'true', 'wraps to last');
    ctl._onSettingsTabKeydown(keyEvent('Home', buttons[3]));
    assert.equal(buttons[0].getAttribute('aria-selected'), 'true');
    ctl._onSettingsTabKeydown(keyEvent('End', buttons[0]));
    assert.equal(buttons[3].getAttribute('aria-selected'), 'true');
    assert.deepEqual(focusLog, ['control', 'updates', 'general', 'updates']);
  });

  it('ignores other keys and non-tab targets', () => {
    const { buttons } = buildDialogDom();
    const ctl = makeControlStub();
    const e = keyEvent('a', buttons[0]);
    ctl._onSettingsTabKeydown(e);
    assert.equal(e.prevented, false);
    const e2 = keyEvent('ArrowRight', makeElement('input'));
    ctl._onSettingsTabKeydown(e2);
    assert.equal(e2.prevented, false);
  });
});

function inputWithHandlers(tag = 'input') {
  const el = makeElement(tag);
  el.handlers = {};
  el.addEventListener = (type, fn) => { el.handlers[type] = fn; };
  return el;
}

describe('_bindSettingsPanel', () => {
  it('updates: reflects isBetaUpdatesEnabled and switches channel on change', async () => {
    const box = inputWithHandlers();
    const span = makeElement('span');
    const check = inputWithHandlers('button');
    const updateBtn = makeElement('button');
    let clicked = 0;
    updateBtn.click = () => { clicked += 1; };
    const els = { 'update-channel-beta': box, 'settings-app-version': span, 'settings-check-updates': check, 'update-button': updateBtn };
    globalThis.document.getElementById = (id) => els[id] || null;
    globalThis.window.electronAPI = { getAppVersion: async () => '1.4.0-beta.3' };
    const channels = [];
    const seen = [];
    const ctl = makeControlStub({
      isBetaUpdatesEnabled: (v) => { seen.push(v); return true; },
      setUpdateChannel: (c) => channels.push(c),
    });
    await ctl._bindSettingsPanel('updates');
    assert.equal(span.textContent, '1.4.0-beta.3');
    assert.deepEqual(seen, ['1.4.0-beta.3']);
    assert.equal(box.checked, true);
    box.checked = false;
    box.handlers.change();
    assert.deepEqual(channels, ['stable']);
    box.checked = true;
    box.handlers.change();
    assert.deepEqual(channels, ['stable', 'beta']);
    check.handlers.click();
    assert.equal(clicked, 1);
  });

  it('updates: survives a missing bridge and missing extensions methods', async () => {
    const box = inputWithHandlers();
    globalThis.document.getElementById = (id) => (id === 'update-channel-beta' ? box : null);
    globalThis.window.electronAPI = {};
    const ctl = makeControlStub();
    await assert.doesNotReject(async () => { await ctl._bindSettingsPanel('updates'); });
    assert.doesNotThrow(() => box.handlers.change());
  });

  it('control: auto-start checkbox persists globalAutoStartPolling', () => {
    const box = inputWithHandlers();
    globalThis.document.getElementById = (id) => (id === 'global-auto-start-polling' ? box : null);
    let saves = 0;
    const ctl = makeControlStub({ config: {} });
    ctl.saveConfig = () => { saves += 1; };
    ctl._bindSettingsPanel('control');
    box.checked = false;
    box.handlers.change();
    assert.equal(ctl.config.globalAutoStartPolling, false);
    box.checked = true;
    box.handlers.change();
    assert.equal(ctl.config.globalAutoStartPolling, true);
    assert.equal(saves, 2);
  });

  it('control: debug logging and board layout still bind', () => {
    const dbg = inputWithHandlers();
    const layout = inputWithHandlers('select');
    const els = { 'global-debug-logging': dbg, 'global-board-layout': layout };
    globalThis.document.getElementById = (id) => els[id] || null;
    const ctl = makeControlStub({ config: {} });
    const layouts = [];
    ctl._applyBoardLayout = (v, persist) => layouts.push([v, persist]);
    ctl._bindSettingsPanel('control');
    dbg.checked = true;
    dbg.handlers.change();
    assert.equal(ctl.config.globalDebugLoggingEnabled, true);
    layout.value = 'grid-3';
    layout.handlers.change();
    assert.deepEqual(layouts, [['grid-3', true]]);
  });
});

describe('setupSettingsDialog', () => {
  it('renders panels, registers the menu channel and pushes the update channel', () => {
    const { els, dialog } = buildDialogDom();
    const gear = inputWithHandlers('button');
    const close = inputWithHandlers('button');
    const list = inputWithHandlers('div');
    els['settings-button'] = gear;
    els['app-settings-close'] = close;
    globalThis.document.querySelector = (sel) => (sel === '.settings-tabs' ? list : null);
    const menu = {};
    globalThis.window.electronAPI = { onMenuAction: (ch, fn) => { menu[ch] = fn; } };
    let pushed = 0;
    const ctl = makeControlStub({ config: {}, applyUpdateChannel: () => { pushed += 1; } });
    ctl.setupSettingsDialog();
    assert.equal(pushed, 1);
    assert.ok(findById(els['settings-panel-general'].innerHTML, 'theme-select'));
    assert.ok(findById(els['settings-panel-control'].innerHTML, 'global-timing-ms'));
    assert.ok(findById(els['settings-panel-accessibility'].innerHTML, 'a11y-settings'));
    assert.ok(findById(els['settings-panel-updates'].innerHTML, 'update-channel-beta'));
    assert.equal(typeof menu['menu-settings-open'], 'function');
    menu['menu-settings-open']();
    assert.deepEqual(dialog.calls, ['showModal']);
    close.handlers.click();
    assert.deepEqual(dialog.calls, ['showModal', 'close']);
    gear.handlers.click();
    assert.deepEqual(dialog.calls, ['showModal', 'close', 'showModal']);
    let prevented = false;
    dialog.handlers.cancel({ preventDefault() { prevented = true; } });
    assert.ok(prevented, 'Escape handled by closeSettings');
    assert.equal(dialog.calls.at(-1), 'close');
    assert.equal(typeof list.handlers.keydown, 'function');
    assert.equal(typeof list.handlers.click, 'function');
  });
});

describe('renderDeviceControlUI', () => {
  it('renders the board with a toolbar and no side panel', () => {
    const panel = makeElement('section');
    globalThis.document.getElementById = (id) => (id === 'control-panel' ? panel : null);
    const ctl = makeControlStub({ config: {} });
    ctl._initDragDrop = () => {};
    ctl._setupCanvasResizeObserver = () => {};
    ctl._repaintAllCanvases = () => {};
    ctl.renderDeviceControlUI();
    const out = panel.innerHTML;
    assert.ok(findById(out, 'add-swr-card-btn'));
    assert.ok(findById(out, 'open-settings-btn'));
    assert.ok(findById(out, 'meter-board'));
    assert.equal(/meter-settings-panel|meter-settings-rail|global-timing-ms/.test(out), false);
  });
});
