/**
 * site-view-components.js
 * RF schematic component type registry for the Site View schematic editor.
 * Exposes window.SiteViewComponents with all component definitions and helpers.
 */
(function () {
    'use strict';

    function _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _portLocalPos(typeDef, port) {
        const w = typeDef.width;
        const h = typeDef.height;
        switch (port.side) {
            case 'left':   return { x: 0,                       y: h * (port.yRatio ?? 0.5) };
            case 'right':  return { x: w,                       y: h * (port.yRatio ?? 0.5) };
            case 'top':    return { x: w * (port.xRatio ?? 0.5), y: 0 };
            case 'bottom': return { x: w * (port.xRatio ?? 0.5), y: h };
            default:       return { x: 0, y: 0 };
        }
    }

    function _portLabelPos(port, px, py, flipped = false) {
        const off = 14;
        let side = port.side;
        if (flipped) {
            if (side === 'left')       side = 'right';
            else if (side === 'right') side = 'left';
        }
        switch (side) {
            case 'left':   return { x: px - off, y: py + 3.5, anchor: 'end' };
            case 'right':  return { x: px + off, y: py + 3.5, anchor: 'start' };
            case 'top':    return { x: px,        y: py - off, anchor: 'middle' };
            case 'bottom': return { x: px,        y: py + off + 5, anchor: 'middle' };
            default:       return { x: px,        y: py,       anchor: 'middle' };
        }
    }

    const STRIP_H = 28;
    const GAIN_TYPES = new Set(['amplifier', 'attenuator', 'hybrid-3db', 'combiner',
                                 'coax-switch', '4port-switch', 'filter', 'coupler']);

    const CATEGORIES = [
        { id: 'sources',       label: 'Sources' },
        { id: 'amplification', label: 'Amplification' },
        { id: 'passive',       label: 'Passive' },
        { id: 'meters',        label: 'Meters' },
        { id: 'load',          label: 'Loads' },
        { id: 'switching',     label: 'Switching' },
    ];

    const COMPONENT_TYPES = {

        // ── Transmitter ──────────────────────────────────────────────────────
        'transmitter': {
            id: 'transmitter',
            label: 'Transmitter',
            category: 'sources',
            width: 150,
            height: 80,
            defaultLabel: 'TX',
            ports: [
                { id: 'rf-out', side: 'right', type: 'output', label: 'RF Out', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const cx = w * 0.33, cy = h * 0.5;
                const pwr  = node.props?.powerW  != null ? `${node.props.powerW} W`   : '';
                const freq = node.props?.freqMHz != null ? `${node.props.freqMHz} MHz` : '';
                // Stack label lines dynamically
                let lines = `<text class="sv-node-type-icon" x="${cx}" y="${cy - 10}" text-anchor="middle">TX</text>`;
                lines += `<text class="sv-node-label" x="${cx}" y="${cy + 5}" text-anchor="middle">${_esc(node.label)}</text>`;
                if (pwr)  lines += `<text class="sv-node-label" x="${cx}" y="${cy + 17}" text-anchor="middle" font-size="9">${_esc(pwr)}</text>`;
                if (freq) lines += `<text class="sv-node-label" x="${cx}" y="${cy + 28}" text-anchor="middle" font-size="9">${_esc(freq)}</text>`;
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="6"/>
                    ${lines}
                    <line class="sv-node-deco" x1="${w*0.55}" y1="${cy}" x2="${w*0.60}" y2="${cy}" stroke-width="1.5"/>
                    <path class="sv-node-deco" d="M${w*0.61},${cy-8} C${w*0.66},${cy-14} ${w*0.71},${cy-2} ${w*0.76},${cy-8} S${w*0.86},${cy-14} ${w*0.91},${cy-8}" fill="none" stroke-width="1.5" stroke-linecap="round" opacity="0.85"/>
                    <path class="sv-node-deco" d="M${w*0.61},${cy}   C${w*0.66},${cy-6}  ${w*0.71},${cy+6}  ${w*0.76},${cy}   S${w*0.86},${cy-6}  ${w*0.91},${cy}"   fill="none" stroke-width="1.5" stroke-linecap="round" opacity="1"/>
                    <path class="sv-node-deco" d="M${w*0.61},${cy+8} C${w*0.66},${cy+2}  ${w*0.71},${cy+14} ${w*0.76},${cy+8} S${w*0.86},${cy+2}  ${w*0.91},${cy+8}" fill="none" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
                `;
            },
        },

        // ── Amplifier ────────────────────────────────────────────────────────
        'amplifier': {
            id: 'amplifier',
            label: 'Amplifier',
            category: 'amplification',
            width: 140,
            height: 66,
            defaultLabel: 'AMP',
            ports: [
                { id: 'in',  side: 'left',  type: 'input',  label: 'In',  yRatio: 0.5 },
                { id: 'out', side: 'right', type: 'output', label: 'Out', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height; // w=140, h=66
                const midY = h * 0.5;
                const triPts = `${w*0.12},${h*0.12} ${w*0.12},${h*0.88} ${w*0.72},${midY}`;
                const confGain = node.props?.gainDb != null ? `${node.props.gainDb >= 0 ? '+' : ''}${node.props.gainDb} dB` : '';
                return `
                    <polygon class="sv-node-deco" points="${triPts}" opacity="0.55"/>
                    <text class="sv-node-type-icon" x="${w*0.35}" y="${midY - 4}" text-anchor="middle" font-size="11">▶</text>
                    <text class="sv-node-label" x="${w*0.35}" y="${midY + 9}" text-anchor="middle" font-size="10">${_esc(node.label)}</text>
                    ${confGain ? `<text class="sv-node-label" x="${w*0.35}" y="${midY + 20}" text-anchor="middle" font-size="8">${_esc(confGain)}</text>` : ''}
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
                const w = this.width, h = this.height; // w=110, h=60
                const db = node.props?.attenuationDb != null ? node.props.attenuationDb : '--';
                return `
                    <line class="sv-node-deco" x1="${w*0.28}" y1="${h*0.28}" x2="${w*0.28}" y2="${h*0.72}" stroke-width="1.5" opacity="0.5"/>
                    <line class="sv-node-deco" x1="${w*0.72}" y1="${h*0.28}" x2="${w*0.72}" y2="${h*0.72}" stroke-width="1.5" opacity="0.5"/>
                    <line class="sv-node-deco" x1="${w*0.22}" y1="${h*0.5}"  x2="${w*0.78}" y2="${h*0.5}"  stroke-width="1.5" opacity="0.3"/>
                    <text class="sv-node-type-icon" x="${w*0.5}" y="${h*0.43}" text-anchor="middle" font-size="12">ATT</text>
                    <text class="sv-node-label"     x="${w*0.5}" y="${h*0.76}" text-anchor="middle" font-size="10">${_esc(db)} dB</text>
                `;
            },
        },

        // ── Power Meter ───────────────────────────────────────────────────────
        'dwm-meter': {
            id: 'dwm-meter',
            label: 'Meter',
            category: 'meters',
            width: 150,
            height: 80,
            defaultLabel: 'METER',
            ports: [
                { id: 'in',  side: 'left',  type: 'input',  label: 'In',  yRatio: 0.5 },
                { id: 'out', side: 'right', type: 'output', label: 'Out', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const isReverse = node.props?.measureType === 'reverse';
                const dirLabel  = isReverse ? 'REFLECTED' : 'FORWARD';
                const ptLabel   = { inst: 'INST', avg: 'AVG', peak: 'PEP', max: 'MAX', min: 'MIN', dev: 'DEV' }[node.props?.powerType || 'avg'] || 'AVG';
                const devName   = node.props?.deviceName || (node.props?.deviceUid ? '' : 'Unlinked');
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <text class="sv-meter-dir" x="${w*0.5}" y="${h*0.26}" text-anchor="middle" font-size="10">${_esc(dirLabel)} · ${_esc(ptLabel)}</text>
                    <text class="sv-meter-fwd" x="${w*0.5}" y="${h*0.60}" text-anchor="middle">-- --</text>
                    <line class="sv-node-deco" x1="${w*0.06}" y1="${h*0.70}" x2="${w*0.94}" y2="${h*0.70}" stroke-width="0.5" opacity="0.3"/>
                    <text class="sv-node-label" x="${w*0.5}" y="${h*0.86}" text-anchor="middle" font-size="9">${_esc(devName || node.label)}</text>
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
                const w = this.width, h = this.height; // w=120, h=90
                return `
                    <line class="sv-node-deco" x1="${w*0.35}" y1="${h*0.25}" x2="${w*0.35}" y2="${h*0.75}" stroke-width="1.5" opacity="0.55"/>
                    <line class="sv-node-deco" x1="${w*0.22}" y1="${h*0.5}"  x2="${w*0.48}" y2="${h*0.5}"  stroke-width="1.5" opacity="0.55"/>
                    <circle class="sv-node-deco" cx="${w*0.35}" cy="${h*0.5}" r="3" opacity="0.8"/>
                    <text class="sv-node-type-icon" x="${w*0.72}" y="${h*0.41}" text-anchor="middle">3dB</text>
                    <text class="sv-node-label"     x="${w*0.72}" y="${h*0.61}" text-anchor="middle">90°</text>
                    <text class="sv-node-label"     x="${w*0.5}"  y="${h*0.88}" text-anchor="middle" font-size="9">${_esc(node.label)}</text>
                `;
            },
        },

        // ── Combiner / Splitter ───────────────────────────────────────────────
        // Ports: in1 at (0, h*0.33), in2 at (0, h*0.67), out at (w, h*0.5)
        // Shape is a trapezoid with its left vertices at the actual port positions
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
                const w = this.width, h = this.height; // w=120, h=90
                const pts = `0,${h*0.22} 0,${h*0.78} ${w*0.82},${h*0.62} ${w*0.82},${h*0.38}`;
                return `
                    <polygon class="sv-node-body" points="${pts}"/>
                    <line class="sv-node-deco" x1="${w*0.82}" y1="${h*0.5}" x2="${w}" y2="${h*0.5}" stroke-width="2" opacity="0.6"/>
                    <line class="sv-node-deco" x1="0" y1="${h*0.33}" x2="${w*0.55}" y2="${h*0.46}" stroke-width="1.5" opacity="0.5"/>
                    <line class="sv-node-deco" x1="0" y1="${h*0.67}" x2="${w*0.55}" y2="${h*0.54}" stroke-width="1.5" opacity="0.5"/>
                    <line class="sv-node-deco" x1="${w*0.55}" y1="${h*0.46}" x2="${w*0.55}" y2="${h*0.54}" stroke-width="1.5" opacity="0.5"/>
                    <line class="sv-node-deco" x1="${w*0.55}" y1="${h*0.5}" x2="${w*0.82}" y2="${h*0.5}" stroke-width="1.5" opacity="0.5"/>
                    <text class="sv-node-type-icon" x="${w*0.38}" y="${h*0.46}" text-anchor="middle" font-size="9">COMB</text>
                    <text class="sv-node-label"     x="${w*0.38}" y="${h*0.60}" text-anchor="middle" font-size="8">${_esc(node.label)}</text>
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
                // yRatio 0.5 so the feed aligns horizontally with components in the chain
                { id: 'feed', side: 'left', type: 'input', label: 'Feed', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const mx    = w * 0.5;
                const feedY = h * 0.5;   // matches port yRatio: 0.5
                const mastTopY = h * 0.08;
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <!-- Feed line from left port to mast base -->
                    <line class="sv-node-deco" x1="0" y1="${feedY}" x2="${mx}" y2="${feedY}" stroke-width="1.5" opacity="0.5"/>
                    <!-- Mast -->
                    <line class="sv-node-deco" x1="${mx}" y1="${mastTopY}" x2="${mx}" y2="${feedY}" stroke-width="2" opacity="0.75"/>
                    <!-- Elements (longest at top, tapering down) -->
                    <line class="sv-node-deco" x1="${w*0.14}" y1="${mastTopY}"   x2="${w*0.86}" y2="${mastTopY}"   stroke-width="2"   stroke-linecap="round" opacity="0.9"/>
                    <line class="sv-node-deco" x1="${w*0.21}" y1="${h*0.18}"     x2="${w*0.79}" y2="${h*0.18}"     stroke-width="1.8" stroke-linecap="round" opacity="0.75"/>
                    <line class="sv-node-deco" x1="${w*0.29}" y1="${h*0.28}"     x2="${w*0.71}" y2="${h*0.28}"     stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
                    <line class="sv-node-deco" x1="${w*0.37}" y1="${h*0.38}"     x2="${w*0.63}" y2="${h*0.38}"     stroke-width="1.5" stroke-linecap="round" opacity="0.45"/>
                    <text class="sv-node-label" x="${mx}" y="${h*0.72}" text-anchor="middle" font-size="10">${_esc(node.label)}</text>
                    <!-- Ground symbol -->
                    <line class="sv-node-deco" x1="${w*0.35}" y1="${h*0.80}" x2="${w*0.65}" y2="${h*0.80}" stroke-width="1.5" opacity="0.6"/>
                    <line class="sv-node-deco" x1="${w*0.42}" y1="${h*0.87}" x2="${w*0.58}" y2="${h*0.87}" stroke-width="1.5" opacity="0.45"/>
                    <line class="sv-node-deco" x1="${w*0.47}" y1="${h*0.93}" x2="${w*0.53}" y2="${h*0.93}" stroke-width="1.5" opacity="0.3"/>
                `;
            },
        },

        // ── Load (Dummy Load / Terminator) ────────────────────────────────────
        'load-terminator': {
            id: 'load-terminator',
            label: 'Load',
            category: 'load',
            width: 90,
            height: 70,
            defaultLabel: 'LOAD',
            ports: [
                { id: 'in', side: 'left', type: 'input', label: 'In', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const feedY = h * 0.5;
                const bx1   = w * 0.32, bx2 = w * 0.80;
                const by1   = h * 0.28, by2 = h * 0.72;
                const bxMid = (bx1 + bx2) / 2;
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <line class="sv-node-deco" x1="0" y1="${feedY}" x2="${bx1}" y2="${feedY}" stroke-width="1.5" opacity="0.7"/>
                    <rect class="sv-node-deco" x="${bx1}" y="${by1}" width="${bx2-bx1}" height="${by2-by1}" fill="none" stroke-width="1.8" opacity="0.85" rx="3"/>
                    <text class="sv-node-label" x="${bxMid}" y="${feedY + 3.5}" text-anchor="middle" font-size="9">${_esc(node.label)}</text>
                    <line class="sv-node-deco" x1="${bxMid}" y1="${by2}" x2="${bxMid}" y2="${h*0.84}" stroke-width="1.5" opacity="0.7"/>
                    <line class="sv-node-deco" x1="${bxMid-8}" y1="${h*0.84}" x2="${bxMid+8}" y2="${h*0.84}" stroke-width="1.5" opacity="0.7"/>
                    <line class="sv-node-deco" x1="${bxMid-5}" y1="${h*0.91}" x2="${bxMid+5}" y2="${h*0.91}" stroke-width="1.3" opacity="0.5"/>
                    <line class="sv-node-deco" x1="${bxMid-2}" y1="${h*0.97}" x2="${bxMid+2}" y2="${h*0.97}" stroke-width="1.1" opacity="0.3"/>
                `;
            },
        },

        // ── Coax Switch (1-in, 2-out) ─────────────────────────────────────────
        'coax-switch': {
            id: 'coax-switch',
            label: 'Coax Switch',
            category: 'switching',
            width: 120,
            height: 90,
            defaultLabel: 'SW',
            ports: [
                { id: 'in',   side: 'left',  type: 'input',  label: 'In',    yRatio: 0.5 },
                { id: 'out1', side: 'right', type: 'output', label: 'Out 1', yRatio: 0.33 },
                { id: 'out2', side: 'right', type: 'output', label: 'Out 2', yRatio: 0.67 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height; // w=120, h=90
                const px = w*0.44, py = h*0.5;
                const ax = w*0.76, ay = h*0.33;
                const bx = w*0.76, by = h*0.67;
                const active = node.props?.activePort ?? 1;
                return `
                    <line class="sv-node-deco" x1="${px}" y1="${py}" x2="${active===1 ? ax : bx}" y2="${active===1 ? ay : by}" stroke-width="2"   stroke-linecap="round" opacity="0.85"/>
                    <line class="sv-node-deco" x1="${px}" y1="${py}" x2="${active===1 ? bx : ax}" y2="${active===1 ? by : ay}" stroke-width="1.5" stroke-dasharray="4,3" stroke-linecap="round" opacity="0.4"/>
                    <path class="sv-node-deco" d="M${ax},${ay+4} A${h*0.22},${h*0.22} 0 0,1 ${bx},${by-4}" fill="none" stroke-width="1" stroke-dasharray="3,3" opacity="0.35"/>
                    <circle class="sv-node-deco" cx="${px}" cy="${py}" r="4.5" opacity="0.85"/>
                    <text class="sv-node-type-icon" x="${w*0.2}" y="${h*0.44}" text-anchor="middle" font-size="14">SW</text>
                    <text class="sv-node-label"     x="${w*0.2}" y="${h*0.64}" text-anchor="middle" font-size="10">${_esc(node.label)}</text>
                `;
            },
        },

        // ── 4-Port Switch (2-in, 2-out): straight-through or cross ───────────
        '4port-switch': {
            id: '4port-switch',
            label: '4-Port Switch',
            category: 'switching',
            width: 120,
            height: 90,
            defaultLabel: '4P-SW',
            ports: [
                { id: 'in1',  side: 'left',  type: 'input',  label: 'In 1',  yRatio: 0.33 },
                { id: 'in2',  side: 'left',  type: 'input',  label: 'In 2',  yRatio: 0.67 },
                { id: 'out1', side: 'right', type: 'output', label: 'Out 1', yRatio: 0.33 },
                { id: 'out2', side: 'right', type: 'output', label: 'Out 2', yRatio: 0.67 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height; // w=120, h=90
                const mode = node.props?.mode || 'through';
                const in1Y = h*0.33, in2Y = h*0.67;
                const out1Y = h*0.33, out2Y = h*0.67;
                const lx1 = w*0.12, lx2 = w*0.88;
                let paths = '';
                if (mode === 'through') {
                    paths = `
                        <line class="sv-node-deco" x1="${lx1}" y1="${in1Y}" x2="${lx2}" y2="${out1Y}" stroke-width="2" opacity="0.85"/>
                        <line class="sv-node-deco" x1="${lx1}" y1="${in2Y}" x2="${lx2}" y2="${out2Y}" stroke-width="2" opacity="0.85"/>`;
                } else {
                    const cx = w*0.5;
                    paths = `
                        <line class="sv-node-deco" x1="${lx1}" y1="${in1Y}" x2="${cx - 4}" y2="${(in1Y+out2Y)/2 - 2}" stroke-width="2" opacity="0.85"/>
                        <line class="sv-node-deco" x1="${cx + 4}" y1="${(in1Y+out2Y)/2 + 2}" x2="${lx2}" y2="${out2Y}" stroke-width="2" opacity="0.85"/>
                        <line class="sv-node-deco" x1="${lx1}" y1="${in2Y}" x2="${lx2}" y2="${out1Y}" stroke-width="2" opacity="0.85"/>`;
                }
                return `
                    ${paths}
                    <text class="sv-node-type-icon" x="${w*0.5}" y="${h*0.30}" text-anchor="middle" font-size="9">4P-SW</text>
                    <text class="sv-node-label"     x="${w*0.5}" y="${h*0.56}" text-anchor="middle" font-size="9">${_esc(node.label)}</text>
                    <text class="sv-node-label"     x="${w*0.5}" y="${h*0.78}" text-anchor="middle" font-size="8">${mode.toUpperCase()}</text>
                `;
            },
        },

        // ── Filter ────────────────────────────────────────────────────────────
        'filter': {
            id: 'filter',
            label: 'Filter',
            category: 'passive',
            width: 110,
            height: 60,
            defaultLabel: 'FILT',
            ports: [
                { id: 'in',  side: 'left',  type: 'input',  label: 'In',  yRatio: 0.5 },
                { id: 'out', side: 'right', type: 'output', label: 'Out', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height; // w=110, h=60
                const ft = node.props?.filterType || 'lowpass';
                const ftLabel = { lowpass: 'LP', highpass: 'HP', bandpass: 'BP', notch: 'NOTCH' }[ft] || ft.toUpperCase();
                let curve = '';
                if (ft === 'lowpass') {
                    curve = `<path class="sv-node-deco" d="M${w*0.2},${h*0.3} L${w*0.48},${h*0.3} C${w*0.58},${h*0.3} ${w*0.62},${h*0.7} ${w*0.8},${h*0.7}" fill="none" stroke-width="1.5" opacity="0.75"/>`;
                } else if (ft === 'highpass') {
                    curve = `<path class="sv-node-deco" d="M${w*0.2},${h*0.7} C${w*0.38},${h*0.7} ${w*0.42},${h*0.3} ${w*0.52},${h*0.3} L${w*0.8},${h*0.3}" fill="none" stroke-width="1.5" opacity="0.75"/>`;
                } else if (ft === 'bandpass') {
                    curve = `<path class="sv-node-deco" d="M${w*0.2},${h*0.7} C${w*0.3},${h*0.7} ${w*0.36},${h*0.26} ${w*0.5},${h*0.26} C${w*0.64},${h*0.26} ${w*0.7},${h*0.7} ${w*0.8},${h*0.7}" fill="none" stroke-width="1.5" opacity="0.75"/>`;
                } else {
                    curve = `<path class="sv-node-deco" d="M${w*0.2},${h*0.3} C${w*0.3},${h*0.3} ${w*0.38},${h*0.74} ${w*0.5},${h*0.74} C${w*0.62},${h*0.74} ${w*0.7},${h*0.3} ${w*0.8},${h*0.3}" fill="none" stroke-width="1.5" opacity="0.75"/>`;
                }
                return `
                    ${curve}
                    <text class="sv-node-type-icon" x="${w*0.5}" y="${h*0.90}" text-anchor="middle" font-size="10">${ftLabel}</text>
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
                const w = this.width, h = this.height; // w=130, h=90
                const cx = w * 0.5;
                return `
                    <line class="sv-node-deco" x1="${w*0.07}" y1="${h*0.5}" x2="${w*0.93}" y2="${h*0.5}" stroke-width="1.5" stroke-dasharray="5,2" opacity="0.3"/>
                    <line class="sv-node-deco" x1="${w*0.38}" y1="${h*0.3}" x2="${w*0.62}" y2="${h*0.3}" stroke-width="2" opacity="0.6"/>
                    <line class="sv-node-deco" x1="${w*0.38}" y1="${h*0.4}" x2="${w*0.62}" y2="${h*0.4}" stroke-width="2" opacity="0.6"/>
                    <line class="sv-node-deco" x1="${cx}" y1="${h*0.5}"   x2="${cx}" y2="${h*0.87}" stroke-width="1.5" opacity="0.75"/>
                    <polygon class="sv-node-deco" points="${cx},${h*0.87} ${cx-5},${h*0.76} ${cx+5},${h*0.76}" opacity="0.75"/>
                    <text class="sv-node-type-icon" x="${cx}" y="${h*0.22}" text-anchor="middle" font-size="12">CPL</text>
                    <text class="sv-node-label"     x="${w*0.26}" y="${h*0.72}" text-anchor="middle" font-size="10">${_esc(node.label)}</text>
                `;
            },
        },

        // ── Return Loss / SWR ─────────────────────────────────────────────────
        'return-loss': {
            id: 'return-loss',
            label: 'Return Loss / SWR',
            category: 'meters',
            width: 150,
            height: 90,
            defaultLabel: 'RL/SWR',
            ports: [
                { id: 'in',  side: 'left',  type: 'input',  label: 'In',  yRatio: 0.5 },
                { id: 'out', side: 'right', type: 'output', label: 'Out', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const mode      = node.props?.displayMode || 'rl';
                const modeLabel = mode === 'swr' ? 'SWR' : 'Return Loss';
                const fwdName   = node.props?.fwdDeviceName || (node.props?.fwdDeviceUid ? '' : 'Unlinked');
                const rflName   = node.props?.rflDeviceName || (node.props?.rflDeviceUid ? '' : 'Unlinked');
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <text class="sv-meter-dir" x="${w*0.5}" y="${h*0.20}" text-anchor="middle" font-size="10">${_esc(modeLabel)}</text>
                    <text class="sv-rl-value sv-meter-fwd" x="${w*0.5}" y="${h*0.56}" text-anchor="middle">-- --</text>
                    <line class="sv-node-deco" x1="${w*0.06}" y1="${h*0.66}" x2="${w*0.94}" y2="${h*0.66}" stroke-width="0.5" opacity="0.3"/>
                    <text class="sv-meter-label" x="${w*0.06}" y="${h*0.82}" text-anchor="start" font-size="8">FWD: ${_esc(fwdName)}</text>
                    <text class="sv-meter-label" x="${w*0.94}" y="${h*0.82}" text-anchor="end"   font-size="8">RFL: ${_esc(rflName)}</text>
                `;
            },
        },

    };

    function createNode(type, x, y) {
        const typeDef = COMPONENT_TYPES[type];
        if (!typeDef) throw new Error(`SiteViewComponents: unknown component type "${type}"`);

        let props = {};
        if (type === 'attenuator')   props = { attenuationDb: 3, gainPowerType: 'avg' };
        if (type === 'dwm-meter')    props = { deviceUid: null, deviceName: null, measureType: 'forward', powerType: 'avg' };
        if (type === 'amplifier')    props = { gainDb: null, gainPowerType: 'avg' };
        if (type === 'transmitter')  props = { powerW: null, freqMHz: null };
        if (type === 'filter')       props = { filterType: 'lowpass', gainPowerType: 'avg' };
        if (type === '4port-switch') props = { mode: 'through', gainPowerType: 'avg' };
        if (type === 'coax-switch')  props = { activePort: 1, gainPowerType: 'avg' };
        if (type === 'hybrid-3db' || type === 'combiner' || type === 'coupler') props = { gainPowerType: 'avg' };
        if (type === 'return-loss')  props = { fwdDeviceUid: null, fwdDeviceName: null, rflDeviceUid: null, rflDeviceName: null, displayMode: 'rl' };

        return {
            id:    'node-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            type,
            x,
            y,
            label: typeDef.defaultLabel,
            flipped: false,
            props,
        };
    }

    function getPortAbsolutePos(node, portId) {
        const typeDef = COMPONENT_TYPES[node.type];
        if (!typeDef) return null;
        const port = typeDef.ports.find(p => p.id === portId);
        if (!port) return null;
        const local = _portLocalPos(typeDef, port);
        const flipped = node.flipped ?? false;
        const absX = flipped
            ? node.x + typeDef.width - local.x
            : node.x + local.x;
        // When flipped, left↔right sides are mirrored so bezier curves exit correctly
        let effectiveSide = port.side;
        if (flipped) {
            if (effectiveSide === 'left')       effectiveSide = 'right';
            else if (effectiveSide === 'right') effectiveSide = 'left';
        }
        return { x: absX, y: node.y + local.y, side: effectiveSide };
    }

    function getPortScreenPos(node, portId, viewport) {
        const abs = getPortAbsolutePos(node, portId);
        if (!abs) return null;
        const s = viewport.scale ?? 1;
        return { x: abs.x * s + (viewport.x ?? 0), y: abs.y * s + (viewport.y ?? 0) };
    }

    function renderNodeSVG(node, gainCtx) {
        const typeDef = COMPONENT_TYPES[node.type];
        if (!typeDef) return `<!-- sv-unknown-type: ${_esc(node.type)} -->`;

        const isGainType = GAIN_TYPES.has(node.type);
        const w = typeDef.width;
        const baseH = typeDef.height;
        const hasFwd = isGainType && (gainCtx?.hasFwd || false);
        const hasRfl = isGainType && (gainCtx?.hasRfl || false);
        const topH = hasFwd ? STRIP_H : 0;
        const botH = hasRfl ? STRIP_H : 0;
        const effectiveH = topH + baseH + botH;
        const nid = _esc(node.id);

        // Background rect covering full area (strips + body). Only for gain types;
        // non-gain types render their own rect inside renderBody.
        const bgRect = isGainType
            ? `<rect class="sv-node-body" x="0" y="${-topH}" width="${w}" height="${effectiveH}" rx="4"/>`
            : '';

        // Top strip: forward gain (expands above body at negative y)
        const topStripHtml = hasFwd ? `
        <text class="sv-comp-gain-fwd" x="${w * 0.5}" y="${-topH + STRIP_H * 0.73}" text-anchor="middle"></text>
        <line class="sv-node-deco" x1="0" y1="0" x2="${w}" y2="0" stroke-width="0.5" opacity="0.4"/>` : '';

        // Bottom strip: reflected gain (expands below body)
        const botStripHtml = hasRfl ? `
        <line class="sv-node-deco" x1="0" y1="${baseH}" x2="${w}" y2="${baseH}" stroke-width="0.5" opacity="0.4"/>
        <text class="sv-comp-gain-rfl" x="${w * 0.5}" y="${baseH + STRIP_H * 0.73}" text-anchor="middle"></text>` : '';

        // Port SVG elements (positions based on baseH — unchanged)
        const nodeFlipped = node.flipped ?? false;
        const portsHtml = typeDef.ports.map(port => {
            const { x: px, y: py } = _portLocalPos(typeDef, port);
            // Mirror port x when flipped
            const flippedPx = nodeFlipped ? w - px : px;
            const lp  = _portLabelPos(port, flippedPx, py, nodeFlipped);
            const pid = _esc(port.id);
            return (
                `<circle class="sv-port-hit" cx="${flippedPx}" cy="${py}" r="12"` +
                    ` data-node-id="${nid}" data-port-id="${pid}"` +
                    ` data-port-type="${port.type}" data-port-side="${port.side}"/>` +
                `<circle class="sv-port sv-port-${port.type}" cx="${flippedPx}" cy="${py}" r="6"` +
                    ` pointer-events="none" data-node-id="${nid}" data-port-id="${pid}"/>` +
                `<text class="sv-port-label" x="${lp.x}" y="${lp.y}"` +
                    ` font-size="9" text-anchor="${lp.anchor}">${_esc(port.label)}</text>`
            );
        }).join('\n        ');

        const rawBody = typeDef.renderBody(node);
        let bodyHtml;
        if (nodeFlipped) {
            // Counter-flip every <text> element inside the body so text stays readable.
            // Inside the outer translate(w,0) scale(-1,1) group a text at cx appears at
            // screen x = w-cx but mirrored. We add a per-text transform that flips it
            // back: translate(cx,0) scale(-1,1) translate(-cx,0) restores normal direction
            // while keeping the visual position unchanged.
            const fixedBody = rawBody.replace(/<text([^>]*?)(\s*\/>|>)/g, (match, attrs) => {
                const xMatch = attrs.match(/\bx="([^"]+)"/);
                const cx = xMatch ? parseFloat(xMatch[1]) : w * 0.5;
                const closing = match.slice(attrs.length + '<text'.length);
                return `<text${attrs} transform="translate(${cx},0) scale(-1,1) translate(${-cx},0)"${closing}`;
            });
            bodyHtml = `<g transform="translate(${w},0) scale(-1,1)">${fixedBody}</g>`;
        } else {
            bodyHtml = rawBody;
        }

        return (
            `<g id="sv-node-${nid}" class="sv-node sv-node-${_esc(node.type)}"` +
            ` transform="translate(${node.x},${node.y})" data-node-id="${nid}">` +
            `\n    ${bgRect}` +
            `\n    ${topStripHtml}` +
            `\n    ${bodyHtml}` +
            `\n    ${botStripHtml}` +
            `\n    <rect class="sv-node-selection" x="-4" y="${-topH - 4}"` +
            ` width="${w + 8}" height="${effectiveH + 8}" rx="8"` +
            ` fill="none" stroke="var(--sv-select-color)" stroke-width="2"` +
            ` stroke-dasharray="6,3" visibility="hidden"/>` +
            `\n        ${portsHtml}` +
            `\n</g>`
        );
    }

    function getComponentCategories() {
        const map = {};
        CATEGORIES.forEach(c => { map[c.id] = { id: c.id, label: c.label, items: [] }; });
        Object.values(COMPONENT_TYPES).forEach(t => {
            if (map[t.category]) map[t.category].items.push({ typeId: t.id, label: t.label });
        });
        return CATEGORIES.map(c => map[c.id]).filter(c => c.items.length > 0);
    }

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
