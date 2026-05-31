/**
 * site-view-components.js
 * RF schematic component type registry for the Site View schematic editor.
 * Exposes window.SiteViewComponents with all component definitions and helpers.
 */
(function () {
    'use strict';

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** Escape special characters for safe SVG text content. */
    function _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Get the position of a port in the node's local coordinate space (origin = node top-left).
     * @param {object} typeDef  - Component type definition
     * @param {object} port     - Port definition object
     * @returns {{ x: number, y: number }}
     */
    function _portLocalPos(typeDef, port) {
        const w = typeDef.width;
        const h = typeDef.height;
        switch (port.side) {
            case 'left':   return { x: 0, y: h * (port.yRatio ?? 0.5) };
            case 'right':  return { x: w, y: h * (port.yRatio ?? 0.5) };
            case 'top':    return { x: w * (port.xRatio ?? 0.5), y: 0 };
            case 'bottom': return { x: w * (port.xRatio ?? 0.5), y: h };
            default:       return { x: 0, y: 0 };
        }
    }

    /**
     * Get the position and text-anchor for a port's label.
     * Label is placed 14px outward from the port circle in the direction of the port's side.
     * @param {object} port  - Port definition
     * @param {number} px    - Port local x
     * @param {number} py    - Port local y
     * @returns {{ x: number, y: number, anchor: string }}
     */
    function _portLabelPos(port, px, py) {
        const off = 14;
        switch (port.side) {
            case 'left':   return { x: px - off, y: py + 3.5, anchor: 'end' };
            case 'right':  return { x: px + off, y: py + 3.5, anchor: 'start' };
            case 'top':    return { x: px,        y: py - off, anchor: 'middle' };
            case 'bottom': return { x: px,        y: py + off + 5, anchor: 'middle' };
            default:       return { x: px,        y: py,       anchor: 'middle' };
        }
    }

    // ─── Category Registry ───────────────────────────────────────────────────

    /**
     * Ordered list of component categories used in the sidebar palette.
     * @type {Array<{id: string, label: string}>}
     */
    const CATEGORIES = [
        { id: 'sources',       label: 'Sources' },
        { id: 'amplification', label: 'Amplification' },
        { id: 'passive',       label: 'Passive' },
        { id: 'meters',        label: 'Meters' },
        { id: 'load',          label: 'Loads' },
        { id: 'switching',     label: 'Switching' },
    ];

    // ─── Component Type Definitions ──────────────────────────────────────────

    /**
     * All registered component types, keyed by type id.
     * Each type defines its geometry, ports, and SVG body renderer.
     *
     * Port definition:
     *   { id, side: 'left'|'right'|'top'|'bottom', type: 'input'|'output'|'bidirectional',
     *     label, yRatio? (left/right), xRatio? (top/bottom) }
     */
    const COMPONENT_TYPES = {

        // ── Transmitter ──────────────────────────────────────────────────────
        'transmitter': {
            id: 'transmitter',
            label: 'Transmitter',
            category: 'sources',
            width: 140,
            height: 70,
            defaultLabel: 'TX',
            ports: [
                { id: 'rf-out', side: 'right', type: 'output', label: 'RF Out', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const cx = w * 0.35, cy = h * 0.5;
                // Three sine-wave lines on the right suggest RF energy radiating out
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="6"/>
                    <text class="sv-node-type-icon" x="${cx}" y="${cy - 6}" text-anchor="middle">TX</text>
                    <text class="sv-node-label" x="${cx}" y="${cy + 12}" text-anchor="middle">${_esc(node.label)}</text>
                    <line class="sv-node-deco" x1="${w * 0.57}" y1="${cy}" x2="${w * 0.62}" y2="${cy}" stroke-width="1.5"/>
                    <path class="sv-node-deco" d="M${w*0.63},${cy-9} C${w*0.68},${cy-15} ${w*0.73},${cy-3} ${w*0.78},${cy-9} S${w*0.88},${cy-15} ${w*0.93},${cy-9}" fill="none" stroke-width="1.5" stroke-linecap="round" opacity="0.85"/>
                    <path class="sv-node-deco" d="M${w*0.63},${cy} C${w*0.68},${cy-6} ${w*0.73},${cy+6} ${w*0.78},${cy} S${w*0.88},${cy-6} ${w*0.93},${cy}" fill="none" stroke-width="1.5" stroke-linecap="round" opacity="1"/>
                    <path class="sv-node-deco" d="M${w*0.63},${cy+9} C${w*0.68},${cy+3} ${w*0.73},${cy+15} ${w*0.78},${cy+9} S${w*0.88},${cy+3} ${w*0.93},${cy+9}" fill="none" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
                `;
            },
        },

        // ── Amplifier ────────────────────────────────────────────────────────
        'amplifier': {
            id: 'amplifier',
            label: 'Amplifier',
            category: 'amplification',
            width: 100,
            height: 70,
            defaultLabel: 'AMP',
            ports: [
                { id: 'in',  side: 'left',  type: 'input',  label: 'In',  yRatio: 0.5 },
                { id: 'out', side: 'right', type: 'output', label: 'Out', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                // IEEE-standard amplifier symbol: triangle pointing right
                const pts = `${w * 0.08},${h * 0.09} ${w * 0.08},${h * 0.91} ${w * 0.92},${h * 0.5}`;
                return `
                    <polygon class="sv-node-body" points="${pts}"/>
                    <text class="sv-node-type-icon" x="${w * 0.35}" y="${h * 0.46}" text-anchor="middle" font-size="12">▶</text>
                    <text class="sv-node-label" x="${w * 0.35}" y="${h * 0.64}" text-anchor="middle" font-size="10">${_esc(node.label)}</text>
                `;
            },
        },

        // ── Attenuator ───────────────────────────────────────────────────────
        'attenuator': {
            id: 'attenuator',
            label: 'Attenuator',
            category: 'passive',
            width: 110,
            height: 60,
            defaultLabel: 'ATT',
            ports: [
                { id: 'in',  side: 'left',  type: 'input',  label: 'In',  yRatio: 0.5 },
                { id: 'out', side: 'right', type: 'output', label: 'Out', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const db = node.props.attenuationDb != null ? node.props.attenuationDb : '--';
                // Suggest a Pi attenuator network with two vertical shunt lines and one series line
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <line class="sv-node-deco" x1="${w*0.28}" y1="${h*0.28}" x2="${w*0.28}" y2="${h*0.72}" stroke-width="1.5" opacity="0.5"/>
                    <line class="sv-node-deco" x1="${w*0.72}" y1="${h*0.28}" x2="${w*0.72}" y2="${h*0.72}" stroke-width="1.5" opacity="0.5"/>
                    <line class="sv-node-deco" x1="${w*0.22}" y1="${h*0.5}" x2="${w*0.78}" y2="${h*0.5}" stroke-width="1.5" opacity="0.3"/>
                    <text class="sv-node-type-icon" x="${w*0.5}" y="${h*0.43}" text-anchor="middle" font-size="12">ATT</text>
                    <text class="sv-node-label" x="${w*0.5}" y="${h*0.76}" text-anchor="middle" font-size="10">${_esc(db)} dB</text>
                `;
            },
        },

        // ── DWM Power Meter ──────────────────────────────────────────────────
        'dwm-meter': {
            id: 'dwm-meter',
            label: 'DWM Power Meter',
            category: 'meters',
            width: 160,
            height: 90,
            defaultLabel: 'PWR Meter',
            ports: [
                { id: 'in',  side: 'left',  type: 'input',  label: 'In',  yRatio: 0.5 },
                { id: 'out', side: 'right', type: 'output', label: 'Out', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const devName = node.props.deviceName || 'Unlinked';
                const mType = node.props.measureType === 'reverse' ? 'RFL' : 'FWD';
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <!-- Meter arc icon (semicircle + needle) -->
                    <path class="sv-node-deco" d="M${w*0.07},${h*0.3} A${w*0.1},${w*0.1} 0 0,1 ${w*0.27},${h*0.3}" fill="none" stroke-width="2" opacity="0.9"/>
                    <line class="sv-node-deco" x1="${w*0.17}" y1="${h*0.3}" x2="${w*0.24}" y2="${h*0.18}" stroke-width="1.5" opacity="0.9"/>
                    <!-- Component label and device name -->
                    <text class="sv-node-type-icon" x="${w*0.62}" y="${h*0.22}" text-anchor="middle" font-size="10">${_esc(node.label)}</text>
                    <text class="sv-meter-label" x="${w*0.62}" y="${h*0.4}" text-anchor="middle">${_esc(devName)}</text>
                    <!-- Horizontal divider -->
                    <line class="sv-node-deco" x1="${w*0.06}" y1="${h*0.49}" x2="${w*0.94}" y2="${h*0.49}" stroke-width="0.5" opacity="0.3"/>
                    <!-- Live power readout — inner <g data-node-id> allows targeted DOM updates -->
                    <g data-node-id="${_esc(node.id)}">
                        <text class="sv-meter-label" x="${w*0.1}" y="${h*0.64}" text-anchor="start">${mType}:</text>
                        <text class="sv-meter-fwd sv-meter-power-fwd" x="${w*0.92}" y="${h*0.64}" text-anchor="end">-- dBm</text>
                        <text class="sv-meter-label" x="${w*0.1}" y="${h*0.82}" text-anchor="start">RFL:</text>
                        <text class="sv-meter-rfl sv-meter-power-rfl" x="${w*0.92}" y="${h*0.82}" text-anchor="end">-- dBm</text>
                    </g>
                `;
            },
        },

        // ── 3dB Hybrid Coupler ────────────────────────────────────────────────
        'hybrid-3db': {
            id: 'hybrid-3db',
            label: '3dB Hybrid',
            category: 'passive',
            width: 120,
            height: 90,
            defaultLabel: '3dB HYB',
            ports: [
                { id: 'in1',  side: 'left',  type: 'input',  label: 'In 1',  yRatio: 0.33 },
                { id: 'in2',  side: 'left',  type: 'input',  label: 'In 2',  yRatio: 0.67 },
                { id: 'out1', side: 'right', type: 'output', label: 'Out 1', yRatio: 0.33 },
                { id: 'out2', side: 'right', type: 'output', label: 'Out 2', yRatio: 0.67 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                // Junction cross symbol on left half, 3dB/90° labels on right
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <line class="sv-node-deco" x1="${w*0.35}" y1="${h*0.25}" x2="${w*0.35}" y2="${h*0.75}" stroke-width="1.5" opacity="0.55"/>
                    <line class="sv-node-deco" x1="${w*0.22}" y1="${h*0.5}" x2="${w*0.48}" y2="${h*0.5}" stroke-width="1.5" opacity="0.55"/>
                    <circle class="sv-node-deco" cx="${w*0.35}" cy="${h*0.5}" r="3" opacity="0.8"/>
                    <text class="sv-node-type-icon" x="${w*0.72}" y="${h*0.41}" text-anchor="middle">3dB</text>
                    <text class="sv-node-label" x="${w*0.72}" y="${h*0.61}" text-anchor="middle">90°</text>
                    <text class="sv-node-label" x="${w*0.5}" y="${h*0.88}" text-anchor="middle" font-size="9">${_esc(node.label)}</text>
                `;
            },
        },

        // ── Combiner / Splitter ───────────────────────────────────────────────
        'combiner': {
            id: 'combiner',
            label: 'Combiner/Splitter',
            category: 'passive',
            width: 120,
            height: 90,
            defaultLabel: 'COMB',
            ports: [
                { id: 'in1', side: 'left',  type: 'input',  label: 'In 1', yRatio: 0.33 },
                { id: 'in2', side: 'left',  type: 'input',  label: 'In 2', yRatio: 0.67 },
                { id: 'out', side: 'right', type: 'output', label: 'Out',  yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                // Trapezoid shape: wide on left (2 ports), narrow on right (1 port)
                const pts = `${w*0.15},${h*0.14} ${w*0.15},${h*0.86} ${w*0.85},${h*0.64} ${w*0.85},${h*0.36}`;
                return `
                    <polygon class="sv-node-body" points="${pts}"/>
                    <text class="sv-node-type-icon" x="${w*0.48}" y="${h*0.47}" text-anchor="middle">COMB</text>
                    <text class="sv-node-label" x="${w*0.48}" y="${h*0.65}" text-anchor="middle">${_esc(node.label)}</text>
                `;
            },
        },

        // ── Antenna ───────────────────────────────────────────────────────────
        'antenna': {
            id: 'antenna',
            label: 'Antenna',
            category: 'load',
            width: 90,
            height: 100,
            defaultLabel: 'ANT',
            ports: [
                { id: 'feed', side: 'left', type: 'input', label: 'Feed', yRatio: 0.7 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const mx = w * 0.5;    // mast horizontal center
                const feedY = h * 0.7; // matches port yRatio
                const topY  = h * 0.08;
                // Classic Yagi-style antenna symbol: vertical mast with horizontal elements
                // decreasing in length from top (director) to feedpoint
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <!-- Horizontal feed line from left port edge to mast base -->
                    <line class="sv-node-deco" x1="0" y1="${feedY}" x2="${mx}" y2="${feedY}" stroke-width="1.5" opacity="0.5"/>
                    <!-- Mast (vertical radiator) -->
                    <line class="sv-node-deco" x1="${mx}" y1="${topY}" x2="${mx}" y2="${feedY}" stroke-width="2" opacity="0.75"/>
                    <!-- Radiating elements: longest at top, tapering down to feedpoint -->
                    <line class="sv-node-deco" x1="${w*0.14}" y1="${topY}"    x2="${w*0.86}" y2="${topY}"    stroke-width="2"   stroke-linecap="round" opacity="0.9"/>
                    <line class="sv-node-deco" x1="${w*0.21}" y1="${h*0.22}"  x2="${w*0.79}" y2="${h*0.22}"  stroke-width="1.8" stroke-linecap="round" opacity="0.75"/>
                    <line class="sv-node-deco" x1="${w*0.29}" y1="${h*0.36}"  x2="${w*0.71}" y2="${h*0.36}"  stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
                    <line class="sv-node-deco" x1="${w*0.37}" y1="${h*0.5}"   x2="${w*0.63}" y2="${h*0.5}"   stroke-width="1.5" stroke-linecap="round" opacity="0.45"/>
                    <!-- Label below feedpoint -->
                    <text class="sv-node-label" x="${mx}" y="${h*0.88}" text-anchor="middle" font-size="10">${_esc(node.label)}</text>
                `;
            },
        },

        // ── Coax Switch ───────────────────────────────────────────────────────
        'coax-switch': {
            id: 'coax-switch',
            label: 'Coax Switch',
            category: 'switching',
            width: 120,
            height: 90,
            defaultLabel: 'SW',
            ports: [
                { id: 'in',   side: 'left',  type: 'input',  label: 'In',    yRatio: 0.5 },
                { id: 'out1', side: 'right', type: 'output', label: 'Port 1', yRatio: 0.33 },
                { id: 'out2', side: 'right', type: 'output', label: 'Port 2', yRatio: 0.67 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                // Switch pivot point roughly aligns with the input port
                const px = w * 0.44, py = h * 0.5;
                // Active arm aims toward out1 (upper right)
                const ax = w * 0.76, ay = h * 0.33;
                // Inactive arm aims toward out2 (lower right)
                const bx = w * 0.76, by = h * 0.67;
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <!-- Active connection arm (solid) -->
                    <line class="sv-node-deco" x1="${px}" y1="${py}" x2="${ax}" y2="${ay}" stroke-width="2" stroke-linecap="round" opacity="0.85"/>
                    <!-- Inactive connection arm (dashed) -->
                    <line class="sv-node-deco" x1="${px}" y1="${py}" x2="${bx}" y2="${by}" stroke-width="1.5" stroke-dasharray="4,3" stroke-linecap="round" opacity="0.4"/>
                    <!-- Arc indicating switch rotation range -->
                    <path class="sv-node-deco" d="M${ax},${ay + 4} A${h*0.22},${h*0.22} 0 0,1 ${bx},${by - 4}" fill="none" stroke-width="1" stroke-dasharray="3,3" opacity="0.35"/>
                    <!-- Pivot circle -->
                    <circle class="sv-node-deco" cx="${px}" cy="${py}" r="4.5" opacity="0.85"/>
                    <text class="sv-node-type-icon" x="${w*0.2}" y="${h*0.44}" text-anchor="middle" font-size="14">SW</text>
                    <text class="sv-node-label" x="${w*0.2}" y="${h*0.64}" text-anchor="middle" font-size="10">${_esc(node.label)}</text>
                `;
            },
        },

        // ── Directional Coupler ───────────────────────────────────────────────
        'coupler': {
            id: 'coupler',
            label: 'Directional Coupler',
            category: 'passive',
            width: 130,
            height: 90,
            defaultLabel: 'CPLR',
            ports: [
                { id: 'in',      side: 'left',   type: 'input',  label: 'In',      yRatio: 0.5 },
                { id: 'out',     side: 'right',  type: 'output', label: 'Out',     yRatio: 0.5 },
                { id: 'coupled', side: 'bottom', type: 'output', label: 'Coupled', xRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const cx = w * 0.5;
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <!-- Main through-line (dashed to suggest minimal insertion loss) -->
                    <line class="sv-node-deco" x1="${w*0.07}" y1="${h*0.5}" x2="${w*0.93}" y2="${h*0.5}" stroke-width="1.5" stroke-dasharray="5,2" opacity="0.3"/>
                    <!-- Two parallel coupled-line bars (IEEE directional coupler symbol) -->
                    <line class="sv-node-deco" x1="${w*0.38}" y1="${h*0.3}" x2="${w*0.62}" y2="${h*0.3}" stroke-width="2" opacity="0.6"/>
                    <line class="sv-node-deco" x1="${w*0.38}" y1="${h*0.4}" x2="${w*0.62}" y2="${h*0.4}" stroke-width="2" opacity="0.6"/>
                    <!-- Coupled port arrow pointing downward -->
                    <line class="sv-node-deco" x1="${cx}" y1="${h*0.5}" x2="${cx}" y2="${h*0.87}" stroke-width="1.5" opacity="0.75"/>
                    <polygon class="sv-node-deco" points="${cx},${h*0.87} ${cx-5},${h*0.76} ${cx+5},${h*0.76}" opacity="0.75"/>
                    <text class="sv-node-type-icon" x="${cx}" y="${h*0.22}" text-anchor="middle" font-size="12">CPL</text>
                    <text class="sv-node-label" x="${w*0.26}" y="${h*0.72}" text-anchor="middle" font-size="10">${_esc(node.label)}</text>
                `;
            },
        },

    }; // end COMPONENT_TYPES

    // ─── Public API Functions ─────────────────────────────────────────────────

    /**
     * Create a new node object of the specified component type.
     * @param {string} type  - Component type id (key in COMPONENT_TYPES)
     * @param {number} x     - Canvas x position (top-left of component bounding box)
     * @param {number} y     - Canvas y position
     * @returns {object} Node object
     */
    function createNode(type, x, y) {
        const typeDef = COMPONENT_TYPES[type];
        if (!typeDef) {
            throw new Error(`SiteViewComponents: unknown component type "${type}"`);
        }

        let props = {};
        if (type === 'attenuator') {
            props = { attenuationDb: 3 };
        } else if (type === 'dwm-meter') {
            props = { deviceUid: null, deviceName: null, measureType: 'forward' };
        }

        return {
            id: 'node-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            type,
            x,
            y,
            label: typeDef.defaultLabel,
            props,
        };
    }

    /**
     * Get a port's absolute position in canvas coordinate space.
     * @param {object} node    - Node object
     * @param {string} portId  - Port id
     * @returns {{ x: number, y: number, side: string } | null}
     */
    function getPortAbsolutePos(node, portId) {
        const typeDef = COMPONENT_TYPES[node.type];
        if (!typeDef) return null;
        const port = typeDef.ports.find(p => p.id === portId);
        if (!port) return null;
        const local = _portLocalPos(typeDef, port);
        return {
            x: node.x + local.x,
            y: node.y + local.y,
            side: port.side,
        };
    }

    /**
     * Get a port's position in screen/pixel space, accounting for viewport pan and zoom.
     * @param {object} node      - Node object
     * @param {string} portId    - Port id
     * @param {object} viewport  - { x: panX, y: panY, scale: zoomScale }
     * @returns {{ x: number, y: number } | null}
     */
    function getPortScreenPos(node, portId, viewport) {
        const abs = getPortAbsolutePos(node, portId);
        if (!abs) return null;
        const s = viewport.scale ?? 1;
        return {
            x: abs.x * s + (viewport.x ?? 0),
            y: abs.y * s + (viewport.y ?? 0),
        };
    }

    /**
     * Render the full SVG <g> element for a node, including body, selection rect, and port circles.
     * @param {object} node  - Node object (from createNode)
     * @returns {string} SVG markup string
     */
    function renderNodeSVG(node) {
        const typeDef = COMPONENT_TYPES[node.type];
        if (!typeDef) {
            return `<!-- sv-unknown-type: ${_esc(node.type)} -->`;
        }

        const w = typeDef.width;
        const h = typeDef.height;
        const nid = _esc(node.id);

        // Build SVG for each port: a transparent hit circle + a visual circle + a label
        const portsHtml = typeDef.ports.map(port => {
            const { x: px, y: py } = _portLocalPos(typeDef, port);
            const lp = _portLabelPos(port, px, py);
            const pid = _esc(port.id);
            return (
                // Large transparent circle handles pointer events for drag-to-connect
                `<circle class="sv-port-hit" cx="${px}" cy="${py}" r="12"` +
                    ` data-node-id="${nid}" data-port-id="${pid}"` +
                    ` data-port-type="${port.type}" data-port-side="${port.side}"/>` +
                // Smaller visible circle — pointer-events disabled so hit circle takes precedence
                `<circle class="sv-port sv-port-${port.type}" cx="${px}" cy="${py}" r="6"` +
                    ` pointer-events="none" data-node-id="${nid}" data-port-id="${pid}"/>` +
                // Port label positioned outward from the port side
                `<text class="sv-port-label" x="${lp.x}" y="${lp.y}"` +
                    ` font-size="9" text-anchor="${lp.anchor}">${_esc(port.label)}</text>`
            );
        }).join('\n        ');

        return (
            `<g id="sv-node-${nid}" class="sv-node sv-node-${_esc(node.type)}"` +
            ` transform="translate(${node.x},${node.y})" data-node-id="${nid}">` +
            `\n    ${typeDef.renderBody(node)}` +
            // Selection highlight rect — hidden by default, shown via .sv-selected CSS class
            `\n    <rect class="sv-node-selection" x="-4" y="-4"` +
            ` width="${w + 8}" height="${h + 8}" rx="8"` +
            ` fill="none" stroke="var(--sv-select-color)" stroke-width="2"` +
            ` stroke-dasharray="6,3" visibility="hidden"/>` +
            `\n        ${portsHtml}` +
            `\n</g>`
        );
    }

    /**
     * Return the component palette grouped by category, in display order.
     * @returns {Array<{id: string, label: string, items: Array<{typeId: string, label: string}>}>}
     */
    function getComponentCategories() {
        const map = {};
        CATEGORIES.forEach(c => {
            map[c.id] = { id: c.id, label: c.label, items: [] };
        });
        Object.values(COMPONENT_TYPES).forEach(t => {
            if (map[t.category]) {
                map[t.category].items.push({ typeId: t.id, label: t.label });
            }
        });
        // Return only categories that have at least one component
        return CATEGORIES.map(c => map[c.id]).filter(c => c.items.length > 0);
    }

    // ─── Export ───────────────────────────────────────────────────────────────

    window.SiteViewComponents = {
        COMPONENT_TYPES,
        CATEGORIES,
        createNode,
        getPortAbsolutePos,
        getPortScreenPos,
        renderNodeSVG,
        getComponentCategories,
    };

})();
