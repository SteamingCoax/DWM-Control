'use strict';
// Component type registry for the Site View schematic editor (renderer/modules/site-view-components.js).
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadRenderer } = require('./helpers/renderer-harness');

let SVC;

before(() => {
  loadRenderer({ scripts: ['renderer/modules/site-view-components.js'] });
  SVC = globalThis.window.SiteViewComponents;
});

const VALID_SIDES = new Set(['left', 'right', 'top', 'bottom']);
const VALID_PORT_TYPES = new Set(['input', 'output', 'bidirectional']);

describe('COMPONENT_TYPES shape', () => {
  it('exposes the registry and helpers', () => {
    assert.ok(SVC, 'window.SiteViewComponents must be set');
    assert.ok(SVC.COMPONENT_TYPES && typeof SVC.COMPONENT_TYPES === 'object');
    assert.ok(Array.isArray(SVC.CATEGORIES));
  });

  it('every type definition has the fields the rest of the code relies on', () => {
    for (const [key, t] of Object.entries(SVC.COMPONENT_TYPES)) {
      assert.equal(t.id, key, `type keyed "${key}" must have matching id`);
      assert.equal(typeof t.label, 'string', `${key}.label`);
      assert.ok(t.label.length > 0, `${key}.label non-empty`);
      assert.equal(typeof t.defaultLabel, 'string', `${key}.defaultLabel`);
      assert.equal(typeof t.category, 'string', `${key}.category`);
      assert.equal(typeof t.width, 'number', `${key}.width`);
      assert.ok(t.width > 0, `${key}.width > 0`);
      assert.equal(typeof t.height, 'number', `${key}.height`);
      assert.ok(t.height > 0, `${key}.height > 0`);
      assert.equal(typeof t.renderBody, 'function', `${key}.renderBody`);
      assert.ok(Array.isArray(t.ports) && t.ports.length > 0, `${key}.ports non-empty array`);
      for (const port of t.ports) {
        assert.equal(typeof port.id, 'string', `${key} port.id`);
        assert.ok(port.id.length > 0, `${key} port.id non-empty`);
        assert.ok(VALID_SIDES.has(port.side), `${key} port "${port.id}" side "${port.side}" must be one of left/right/top/bottom`);
        assert.ok(VALID_PORT_TYPES.has(port.type), `${key} port "${port.id}" type "${port.type}" must be input/output/bidirectional`);
        assert.equal(typeof port.label, 'string', `${key} port "${port.id}" label`);
      }
    }
  });

  it('type ids are unique', () => {
    const ids = Object.values(SVC.COMPONENT_TYPES).map(t => t.id);
    assert.equal(new Set(ids).size, ids.length);
    // Keys must also line up 1:1 with ids (already checked above per-entry, this is the aggregate view).
    assert.deepEqual([...Object.keys(SVC.COMPONENT_TYPES)].sort(), [...ids].sort());
  });

  it('CATEGORIES entries are unique and every type belongs to a declared category', () => {
    const catIds = SVC.CATEGORIES.map(c => c.id);
    assert.equal(new Set(catIds).size, catIds.length, 'category ids unique');
    for (const c of SVC.CATEGORIES) {
      assert.equal(typeof c.label, 'string');
      assert.ok(c.label.length > 0);
    }
    for (const [key, t] of Object.entries(SVC.COMPONENT_TYPES)) {
      assert.ok(catIds.includes(t.category), `${key}.category "${t.category}" must be a declared category`);
    }
  });
});

describe('getComponentCategories', () => {
  it('lists only existing types, each type appears exactly once, and matches CATEGORIES', () => {
    const cats = SVC.getComponentCategories();
    assert.ok(Array.isArray(cats));

    const seenTypeIds = [];
    for (const c of cats) {
      const declared = SVC.CATEGORIES.find(dc => dc.id === c.id);
      assert.ok(declared, `returned category "${c.id}" must exist in CATEGORIES`);
      assert.equal(c.label, declared.label, `category "${c.id}" label must match CATEGORIES`);
      assert.ok(Array.isArray(c.items) && c.items.length > 0, `category "${c.id}" must be non-empty (filtered)`);
      for (const item of c.items) {
        const typeDef = SVC.COMPONENT_TYPES[item.typeId];
        assert.ok(typeDef, `category "${c.id}" references unknown type "${item.typeId}"`);
        assert.equal(typeDef.category, c.id, `type "${item.typeId}" must actually belong to category "${c.id}"`);
        assert.equal(item.label, typeDef.label);
        seenTypeIds.push(item.typeId);
      }
    }

    // Every component type appears in exactly one category's item list.
    const allTypeIds = Object.keys(SVC.COMPONENT_TYPES);
    assert.equal(seenTypeIds.length, allTypeIds.length, 'every type must appear exactly once across all categories');
    assert.deepEqual([...seenTypeIds].sort(), [...allTypeIds].sort());

    // Order of returned categories follows CATEGORIES order (minus empty ones - none are empty here).
    const nonEmptyDeclaredOrder = SVC.CATEGORIES.map(c => c.id).filter(id =>
      Object.values(SVC.COMPONENT_TYPES).some(t => t.category === id)
    );
    assert.deepEqual(cats.map(c => c.id), nonEmptyDeclaredOrder);
  });
});

describe('createNode', () => {
  it('throws for an unknown type', () => {
    assert.throws(() => SVC.createNode('not-a-real-type', 0, 0), /unknown component type/);
  });

  it('returns a node with the expected shape for every registered type', () => {
    for (const type of Object.keys(SVC.COMPONENT_TYPES)) {
      const node = SVC.createNode(type, 10, 20);
      assert.equal(node.type, type);
      assert.equal(node.x, 10);
      assert.equal(node.y, 20);
      assert.equal(node.flipped, false);
      assert.equal(node.label, SVC.COMPONENT_TYPES[type].defaultLabel);
      assert.equal(typeof node.id, 'string');
      assert.ok(node.id.length > 0);
      assert.equal(typeof node.props, 'object');
    }
  });

  it('produces unique ids across repeated calls', () => {
    const a = SVC.createNode('amplifier', 0, 0);
    const b = SVC.createNode('amplifier', 0, 0);
    assert.notEqual(a.id, b.id);
  });

  it('ports from a fresh node match getNodePorts for statically-ported types', () => {
    // Types without getPorts()/getHeight() resolve straight through to typeDef.ports,
    // so a freshly created node's ports must be identical to the static definition.
    for (const [type, typeDef] of Object.entries(SVC.COMPONENT_TYPES)) {
      if (typeof typeDef.getPorts === 'function') continue; // dynamic types checked separately below
      const node = SVC.createNode(type, 0, 0);
      assert.deepEqual(SVC.getNodePorts(node), typeDef.ports, `${type} ports should be unchanged from the static definition`);
    }
  });

  it('ports from a fresh dynamic-port node have one entry per configured default port', () => {
    // combiner/splitter/coax-switch default to numPorts: 2 via createNode's props table.
    const combiner = SVC.createNode('combiner', 0, 0);
    assert.equal(combiner.props.numPorts, 2);
    assert.equal(SVC.getNodePorts(combiner).length, 3); // in1, in2, out

    const splitter = SVC.createNode('splitter', 0, 0);
    assert.equal(SVC.getNodePorts(splitter).length, 3); // in, out1, out2

    const coaxSwitch = SVC.createNode('coax-switch', 0, 0);
    assert.equal(SVC.getNodePorts(coaxSwitch).length, 3); // in, out1, out2
  });
});

describe('getNodeHeight', () => {
  it('returns the static height for a type with no getHeight()', () => {
    const node = SVC.createNode('amplifier', 0, 0);
    assert.equal(SVC.getNodeHeight(node), SVC.COMPONENT_TYPES.amplifier.height);
  });

  it('grows with port count for combiner/splitter/coax-switch', () => {
    const withPorts = (type, numPorts) => {
      const node = SVC.createNode(type, 0, 0);
      node.props.numPorts = numPorts;
      return SVC.getNodeHeight(node);
    };
    for (const type of ['combiner', 'splitter', 'coax-switch']) {
      const h2 = withPorts(type, 2);
      const h5 = withPorts(type, 5);
      const h8 = withPorts(type, 8);
      assert.ok(h5 > h2, `${type}: height for 5 ports should exceed 2 ports`);
      assert.ok(h8 > h5, `${type}: height for 8 ports should exceed 5 ports`);
    }
  });

  it('clamps numPorts to the documented 2..8 range', () => {
    const node = SVC.createNode('combiner', 0, 0);
    node.props.numPorts = 100;
    const clampedHigh = SVC.getNodeHeight(node);
    node.props.numPorts = 8;
    assert.equal(clampedHigh, SVC.getNodeHeight(node));

    node.props.numPorts = -3;
    const clampedLow = SVC.getNodeHeight(node);
    node.props.numPorts = 2;
    assert.equal(clampedLow, SVC.getNodeHeight(node));
  });
});

describe('getPortAbsolutePos / getPortScreenPos', () => {
  it('computes the hand-worked position for an unflipped node', () => {
    // amplifier: width 140, height 66, ports: in (left, yRatio .5), out (right, yRatio .5)
    const node = { type: 'amplifier', x: 100, y: 50, flipped: false };
    const inPos = SVC.getPortAbsolutePos(node, 'in');
    assert.deepEqual(inPos, { x: 100, y: 50 + 66 * 0.5, side: 'left' });

    const outPos = SVC.getPortAbsolutePos(node, 'out');
    assert.deepEqual(outPos, { x: 100 + 140, y: 50 + 66 * 0.5, side: 'right' });
  });

  it('mirrors x and swaps left/right sides for a flipped node', () => {
    const node = { type: 'amplifier', x: 100, y: 50, flipped: true };
    // local x for 'in' is 0 -> absX = node.x + width - 0 = 240; side flips left -> right.
    const inPos = SVC.getPortAbsolutePos(node, 'in');
    assert.deepEqual(inPos, { x: 100 + 140 - 0, y: 50 + 66 * 0.5, side: 'right' });

    // local x for 'out' is width (140) -> absX = node.x + width - width = node.x; side flips right -> left.
    const outPos = SVC.getPortAbsolutePos(node, 'out');
    assert.deepEqual(outPos, { x: 100, y: 50 + 66 * 0.5, side: 'left' });
  });

  it('returns null for an unknown type or unknown port id', () => {
    assert.equal(SVC.getPortAbsolutePos({ type: 'nope', x: 0, y: 0 }, 'in'), null);
    assert.equal(SVC.getPortAbsolutePos({ type: 'amplifier', x: 0, y: 0 }, 'nope'), null);
  });

  it('applies viewport scale and offset on top of the absolute position', () => {
    const node = { type: 'amplifier', x: 100, y: 50, flipped: false };
    const screen = SVC.getPortScreenPos(node, 'out', { scale: 2, x: 10, y: 20 });
    // abs = { x: 240, y: 83 } -> screen = { x: 240*2+10, y: 83*2+20 }
    assert.deepEqual(screen, { x: 240 * 2 + 10, y: 83 * 2 + 20 });
  });

  it('defaults viewport scale to 1 and offsets to 0 when omitted', () => {
    const node = { type: 'amplifier', x: 100, y: 50, flipped: false };
    const screen = SVC.getPortScreenPos(node, 'in', {});
    assert.deepEqual(screen, { x: 100, y: 83 });
  });

  it('resolves ports through dynamic getPorts() for combiner/splitter-style types', () => {
    const node = SVC.createNode('coax-switch', 0, 0);
    node.props.numPorts = 3;
    // getPorts for n=3: in (left, .5), out1/out2/out3 (right, i/(n+1))
    const out2 = SVC.getPortAbsolutePos(node, 'out2');
    assert.ok(out2, 'out2 must exist when numPorts=3');
    const expectedHeight = SVC.getNodeHeight(node);
    assert.equal(out2.y, expectedHeight * (2 / 4));
  });
});

describe('renderNodeSVG', () => {
  it('mentions the node id and has balanced tags for a simple static-body type', () => {
    const node = SVC.createNode('amplifier', 5, 5);
    const svg = SVC.renderNodeSVG(node);
    assert.equal(typeof svg, 'string');
    assert.ok(svg.includes(node.id), 'output must reference the node id');
    assert.ok(svg.includes(`id="sv-node-${node.id}"`));
    assert.ok(svg.includes(`data-node-id="${node.id}"`));

    const openG = (svg.match(/<g[ >]/g) || []).length;
    const closeG = (svg.match(/<\/g>/g) || []).length;
    assert.equal(openG, closeG, 'every <g> must be closed');

    const openText = (svg.match(/<text[ >]/g) || []).length;
    const closeText = (svg.match(/<\/text>/g) || []).length;
    assert.equal(openText, closeText, 'every <text> must be closed');
  });

  it('produces an unknown-type comment (and does not throw) for a bogus type', () => {
    const node = { id: 'x1', type: 'not-a-real-type', x: 0, y: 0, label: 'X', props: {} };
    const svg = SVC.renderNodeSVG(node);
    assert.match(svg, /<!--\s*sv-unknown-type:/);
  });

  it('renders gain strips only when gainCtx says so, for a gain-capable type', () => {
    const node = SVC.createNode('amplifier', 0, 0);
    const plain = SVC.renderNodeSVG(node, null);
    const withFwd = SVC.renderNodeSVG(node, { hasFwd: true, hasRfl: false });
    const withBoth = SVC.renderNodeSVG(node, { hasFwd: true, hasRfl: true });

    assert.ok(!plain.includes('sv-comp-gain-fwd'));
    assert.ok(withFwd.includes('sv-comp-gain-fwd'));
    assert.ok(!withFwd.includes('sv-comp-gain-rfl'));
    assert.ok(withBoth.includes('sv-comp-gain-fwd') && withBoth.includes('sv-comp-gain-rfl'));
  });

  it('stays balanced and well-formed for every registered component type, flipped and not', () => {
    for (const type of Object.keys(SVC.COMPONENT_TYPES)) {
      for (const flipped of [false, true]) {
        const node = SVC.createNode(type, 0, 0);
        node.flipped = flipped;
        const svg = SVC.renderNodeSVG(node);
        assert.equal(typeof svg, 'string', `${type} flipped=${flipped}`);
        assert.ok(svg.length > 0, `${type} flipped=${flipped}`);
        const openG = (svg.match(/<g[ >]/g) || []).length;
        const closeG = (svg.match(/<\/g>/g) || []).length;
        assert.equal(openG, closeG, `${type} flipped=${flipped}: unbalanced <g>`);
        const openText = (svg.match(/<text[ >]/g) || []).length;
        const closeText = (svg.match(/<\/text>/g) || []).length;
        assert.equal(openText, closeText, `${type} flipped=${flipped}: unbalanced <text>`);
      }
    }
  });
});
