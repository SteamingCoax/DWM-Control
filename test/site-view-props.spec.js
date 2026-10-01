'use strict';
// Site View properties pane: with nothing selected it shows Workspace Settings, and it must
// do so from startup rather than only after the first selection change.
const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer, makeControlStub, makeElement } = require('./helpers/renderer-harness');

let savedGid;
let savedApi;
before(() => { loadRenderer(); });
beforeEach(() => {
  savedGid = globalThis.document.getElementById;
  savedApi = globalThis.window.electronAPI;
  globalThis.window.electronAPI = {};
});
afterEach(() => {
  globalThis.document.getElementById = savedGid;
  globalThis.window.electronAPI = savedApi;
});

function installPropsContainer() {
  const content = makeElement('div');
  content.id = 'sv-props-content';
  globalThis.document.getElementById = (id) => (id === 'sv-props-content' ? content : null);
  return content;
}

const SETUP_STEPS = [
  '_svLoadSettings', '_svLoadSchematic', '_svRenderSidebar', '_svRender',
  '_svSetupEvents', '_svStartPowerUpdates', '_svUpdateWsNameDisplay',
];

describe('Site View properties pane', () => {
  it('_svRenderProperties shows Workspace Settings when nothing is selected', () => {
    const content = installPropsContainer();
    const ctl = makeControlStub({
      sv: {
        nodes: new Map(), connections: new Map(), selectedNodeId: null, selectedConnId: null,
        selectedNodeIds: new Set(), settings: { snapEnabled: true, snapSize: 20, gridVisible: true },
        logging: false, logFilePath: null, logsDir: null,
      },
    });
    ctl._svRenderProperties();
    assert.match(content.innerHTML, /Workspace Settings/);
  });

  it('setupSiteView renders the properties pane once setup is done', () => {
    const content = installPropsContainer();
    const order = [];
    const ctl = makeControlStub();
    for (const name of SETUP_STEPS) ctl[name] = () => order.push(name);
    ctl.setupSiteView();
    assert.match(content.innerHTML, /Workspace Settings/);
    assert.deepEqual(order, SETUP_STEPS, 'existing setup steps still run in order');
  });

  it('setupSiteView calls _svRenderProperties after the schematic loads', () => {
    installPropsContainer();
    const order = [];
    const ctl = makeControlStub();
    for (const name of SETUP_STEPS) ctl[name] = () => order.push(name);
    ctl._svRenderProperties = () => order.push('_svRenderProperties');
    ctl.setupSiteView();
    assert.ok(order.includes('_svRenderProperties'));
    assert.ok(order.indexOf('_svRenderProperties') > order.indexOf('_svLoadSchematic'));
  });

  it('the logging-rate hint points at Settings, not a Control tab field', () => {
    const content = installPropsContainer();
    const ctl = makeControlStub({
      config: { globalSampleIntervalMs: 100 },
      sv: {
        nodes: new Map(), connections: new Map(), selectedNodeId: null, selectedConnId: null,
        selectedNodeIds: new Set(), settings: { snapEnabled: true, snapSize: 20, gridVisible: true },
        logging: false, logFilePath: null, logsDir: null,
      },
    });
    ctl._svRenderProperties();
    assert.match(content.innerHTML, /set in Settings/);
  });
});
