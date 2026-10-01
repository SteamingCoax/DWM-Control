'use strict';
// Loads the renderer scripts the way index.html does (classic <script> tags, in order)
// so DWMControl.prototype methods can be unit-tested under Node without Electron.
// Scripts are run with vm.runInThisContext so top-level `class`/`const` declarations
// become globals visible to the modules loaded after them, exactly as in a browser.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

function makeElement(tag = 'div') {
  const classSet = new Set();
  const el = {
    tagName: String(tag).toUpperCase(), id: '', get className() { return [...classSet].join(' '); }, set className(v) {
      classSet.clear();
      if (v) v.split(/\s+/).filter(Boolean).forEach(c => classSet.add(c));
    },
    style: {}, dataset: {}, children: [],
    textContent: '', innerText: '', innerHTML: '', value: '', disabled: false, checked: false, hidden: false,
    classList: {
      add(...names) { names.forEach(n => classSet.add(n)); },
      remove(...names) { names.forEach(n => classSet.delete(n)); },
      toggle(name, force) {
        if (force === undefined) {
          if (classSet.has(name)) classSet.delete(name);
          else classSet.add(name);
        } else if (force) {
          classSet.add(name);
        } else {
          classSet.delete(name);
        }
      },
      contains(name) { return classSet.has(name); },
    },
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k] ?? null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(c) { this.children.push(c); return c; }, removeChild() {}, remove() {}, replaceChildren() { this.children = []; },
    insertAdjacentHTML() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    getContext() { return new Proxy({}, { get: () => () => {} }); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; },
    focus() {}, blur() {}, click() {}, scrollIntoView() {},
  };
  return el;
}

function makeDocument() {
  const body = makeElement('body');
  return {
    body, documentElement: makeElement('html'), title: '',
    getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement: (tag) => makeElement(tag), createElementNS: (_ns, tag) => makeElement(tag),
    createDocumentFragment: () => makeElement('fragment'), createTextNode: (t) => ({ textContent: t }),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    hasFocus() { return true; }, activeElement: null,
  };
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; }, _map: m,
  };
}

function makeSpeechStubs() {
  class SpeechSynthesisUtterance {
    constructor(text) {
      this.text = text;
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.voice = null;
      this.lang = '';
    }
  }

  const speechSynthesis = {
    spoken: [],
    cancelCount: 0,
    voices: [],
    speaking: false,
    pending: false,
    speak(u) { this.spoken.push(u); },
    cancel() { this.cancelCount++; },
    getVoices() { return this.voices; },
    addEventListener() {},
    removeEventListener() {},
  };

  return { speechSynthesis, SpeechSynthesisUtterance };
}

function makeAudioStubs() {
  class AudioContext {
    static instances = [];

    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
      AudioContext.instances.push(this);
    }

    async resume() {
      this.state = 'running';
      return Promise.resolve();
    }

    async close() {
      return Promise.resolve();
    }

    createOscillator() {
      return {
        type: 'sine',
        frequency: {
          value: 440,
          calls: [],
          setTargetAtTime(v, t, c) {
            this.value = v;
            this.calls.push([v, t, c]);
          },
        },
        started: 0,
        stopped: 0,
        disconnected: 0,
        start() { this.started++; },
        stop() { this.stopped++; },
        disconnect() { this.disconnected++; },
        connect(n) { this.connectedTo = n; return n; },
      };
    }

    createGain() {
      return {
        gain: {
          value: 1,
          calls: [],
          setTargetAtTime(v, t, c) {
            this.value = v;
            this.calls.push([v, t, c]);
          },
        },
        disconnected: 0,
        connect(n) { this.connectedTo = n; return n; },
        disconnect() { this.disconnected++; },
      };
    }
  }

  return { AudioContext };
}

// Node 22 exposes some browser-named globals (navigator, ...) as getter-only
// properties, so everything is (re)defined with defineProperty.
function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: true });
}

function installBrowserGlobals(overrides = {}) {
  const g = globalThis;
  const EventCtor = class { constructor(t) { this.type = t; } };
  const { speechSynthesis, SpeechSynthesisUtterance } = makeSpeechStubs();
  const { AudioContext } = makeAudioStubs();
  const globals = {
    window: g, self: g, document: makeDocument(), localStorage: makeStorage(), sessionStorage: makeStorage(),
    navigator: { userAgent: 'node-test', platform: process.platform, clipboard: { writeText: async () => {} } },
    location: { href: 'file:///index.html', search: '', hash: '' },
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    alert: () => {}, confirm: () => true, prompt: () => null,
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    Image: class {}, HTMLElement: class {}, HTMLCanvasElement: class {},
    Event: EventCtor, CustomEvent: class extends EventCtor { constructor(t, i) { super(t); this.detail = i?.detail; } },
    speechSynthesis, SpeechSynthesisUtterance, AudioContext,
    electronAPI: overrides.electronAPI || {},
    ...(overrides.globals || {}),
  };
  for (const [k, v] of Object.entries(globals)) defineGlobal(k, v);
  return g;
}

function runScript(relPath) {
  const abs = path.join(ROOT, relPath);
  const code = fs.readFileSync(abs, 'utf8');
  vm.runInThisContext(code, { filename: abs });
}

// Same order as index.html. Load only what a test needs; renderer.js is always first.
const RENDERER_SCRIPTS = [
  'renderer.js',
  'renderer/modules/deembed.js',
  'renderer/modules/extensions.js',
  'renderer/modules/control.js',
  'renderer/modules/control-events.js',
  'renderer/modules/control-api.js',
  'renderer/modules/control-gauges.js',
  'renderer/modules/control-history.js',
  'renderer/modules/control-monitor.js',
  'renderer/modules/accessibility.js',
  'renderer/modules/settings.js',
  'renderer/modules/demo.js',
  'renderer/modules/firmware.js',
  'renderer/modules/site-view-components.js',
  'renderer/modules/site-view.js',
];

let loaded = false;
function loadRenderer(options = {}) {
  if (loaded) return globalThis;
  installBrowserGlobals(options);
  // dwm-core's browser bundle defines window.DWMProtocol (IIFE with a CommonJS footer).
  runScript('node_modules/dwm-core/dist/dwm-protocol.browser.js');
  const scripts = options.scripts || RENDERER_SCRIPTS;
  for (const s of scripts) runScript(s);
  // A top-level `class` evaluated via vm becomes a lexical global, not a property of
  // globalThis; resolve it once so tests can reach it as globalThis.DWMControl.
  defineGlobal('DWMControl', vm.runInThisContext('typeof DWMControl === "function" ? DWMControl : undefined'));
  loaded = true;
  return globalThis;
}

// A DWMControl-shaped `this` for calling prototype methods without running the constructor.
function makeControlStub(extra = {}) {
  const stub = Object.create(globalThis.DWMControl.prototype);
  Object.assign(stub, {
    meterRegistry: new Map(), config: {}, tabSettings: {},
    appendOutput() {}, appendSerialMonitor() {}, setMeterStatus() {}, showUpdateNotification() {},
    saveConfig() {}, meterSafeId: (key) => String(key).replace(/[^a-zA-Z0-9_-]/g, '_'),
  }, extra);
  return stub;
}

module.exports = { loadRenderer, makeControlStub, makeElement, makeStorage, installBrowserGlobals, runScript, RENDERER_SCRIPTS, ROOT, makeSpeechStubs, makeAudioStubs, makeDocument };
