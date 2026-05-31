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
            height: 90,
            defaultLabel: 'AMP',
            ports: [
                { id: 'in',  side: 'left',  type: 'input',  label: 'In',  yRatio: 0.5 },
                { id: 'out', side: 'right', type: 'output', label: 'Out', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const stripY = h - 24;
                const midY   = stripY * 0.5;
                const triPts = `${w*0.12},${stripY*0.12} ${w*0.12},${stripY*0.88} ${w*0.72},${midY}`;
                const confGain = node.props?.gainDb != null ? `${node.props.gainDb >= 0 ? '+' : ''}${node.props.gainDb} dB` : '';
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <polygon class="sv-node-deco" points="${triPts}" opacity="0.55"/>
                    <text class="sv-node-type-icon" x="${w*0.35}" y="${midY - 4}" text-anchor="middle" font-size="11">▶</text>
                    <text class="sv-node-label" x="${w*0.35}" y="${midY + 9}" text-anchor="middle" font-size="10">${_esc(node.label)}</text>
                    ${confGain ? `<text class="sv-node-label" x="${w*0.35}" y="${midY + 20}" text-anchor="middle" font-size="8">${_esc(confGain)}</text>` : ''}
                    <line class="sv-node-deco" x1="0" y1="${stripY}" x2="${w}" y2="${stripY}" stroke-width="0.5" opacity="0.35"/>
                    <g data-gain-node-id="${_esc(node.id)}">
                        <text class="sv-comp-gain-fwd" x="${w*0.5}" y="${stripY + 10}" text-anchor="middle"></text>
                        <text class="sv-comp-gain-rfl" x="${w*0.5}" y="${stripY + 20}" text-anchor="middle"></text>
                    </g>
                `;
            },
        },

        // ── Attenuator ───────────────────────────────────────────────────────
        'attenuator': {
            id: 'attenuator',
            label: 'Attenuator',
            category: 'passive',
            width: 110,
            height: 84,
            defaultLabel: 'ATT',
            ports: [
                { id: 'in',  side: 'left',  type: 'input',  label: 'In',  yRatio: 0.5 },
                { id: 'out', side: 'right', type: 'output', label: 'Out', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const db = node.props?.attenuationDb != null ? node.props.attenuationDb : '--';
                const bodyH = h - 24;
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <line class="sv-node-deco" x1="${w*0.28}" y1="${bodyH*0.28}" x2="${w*0.28}" y2="${bodyH*0.72}" stroke-width="1.5" opacity="0.5"/>
                    <line class="sv-node-deco" x1="${w*0.72}" y1="${bodyH*0.28}" x2="${w*0.72}" y2="${bodyH*0.72}" stroke-width="1.5" opacity="0.5"/>
                    <line class="sv-node-deco" x1="${w*0.22}" y1="${bodyH*0.5}"  x2="${w*0.78}" y2="${bodyH*0.5}"  stroke-width="1.5" opacity="0.3"/>
                    <text class="sv-node-type-icon" x="${w*0.5}" y="${bodyH*0.43}" text-anchor="middle" font-size="12">ATT</text>
                    <text class="sv-node-label"     x="${w*0.5}" y="${bodyH*0.76}" text-anchor="middle" font-size="10">${_esc(db)} dB</text>
                    <line class="sv-node-deco" x1="0" y1="${bodyH}" x2="${w}" y2="${bodyH}" stroke-width="0.5" opacity="0.35"/>
                    <g data-gain-node-id="${_esc(node.id)}">
                        <text class="sv-comp-gain-fwd" x="${w*0.5}" y="${bodyH + 10}" text-anchor="middle"></text>
                        <text class="sv-comp-gain-rfl" x="${w*0.5}" y="${bodyH + 20}" text-anchor="middle"></text>
                    </g>
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
                const devName   = node.props?.deviceName || (node.props?.deviceUid ? '' : 'Unlinked');
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <text class="sv-meter-dir" x="${w*0.5}" y="${h*0.26}" text-anchor="middle" font-size="10">${_esc(dirLabel)}</text>
                    <g data-node-id="${_esc(node.id)}">
                        <text class="sv-meter-fwd" x="${w*0.5}" y="${h*0.60}" text-anchor="middle">-- --</text>
                    </g>
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
            height: 114,
            defaultLabel: '3dB HYB',
            ports: [
                { id: 'in1',  side: 'left',  type: 'input',  label: 'In 1',  yRatio: 0.26 },
                { id: 'in2',  side: 'left',  type: 'input',  label: 'In 2',  yRatio: 0.529 },
                { id: 'out1', side: 'right', type: 'output', label: 'Out 1', yRatio: 0.26 },
                { id: 'out2', side: 'right', type: 'output', label: 'Out 2', yRatio: 0.529 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const bodyH = h - 24;
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <line class="sv-node-deco" x1="${w*0.35}" y1="${bodyH*0.25}" x2="${w*0.35}" y2="${bodyH*0.75}" stroke-width="1.5" opacity="0.55"/>
                    <line class="sv-node-deco" x1="${w*0.22}" y1="${bodyH*0.5}"  x2="${w*0.48}" y2="${bodyH*0.5}"  stroke-width="1.5" opacity="0.55"/>
                    <circle class="sv-node-deco" cx="${w*0.35}" cy="${bodyH*0.5}" r="3" opacity="0.8"/>
                    <text class="sv-node-type-icon" x="${w*0.72}" y="${bodyH*0.41}" text-anchor="middle">3dB</text>
                    <text class="sv-node-label"     x="${w*0.72}" y="${bodyH*0.61}" text-anchor="middle">90°</text>
                    <text class="sv-node-label"     x="${w*0.5}"  y="${bodyH*0.88}" text-anchor="middle" font-size="9">${_esc(node.label)}</text>
                    <line class="sv-node-deco" x1="0" y1="${bodyH}" x2="${w}" y2="${bodyH}" stroke-width="0.5" opacity="0.35"/>
                    <g data-gain-node-id="${_esc(node.id)}">
                        <text class="sv-comp-gain-fwd" x="${w*0.5}" y="${bodyH + 10}" text-anchor="middle"></text>
                        <text class="sv-comp-gain-rfl" x="${w*0.5}" y="${bodyH + 20}" text-anchor="middle"></text>
                    </g>
                `;
            },
        },

        // ── Combiner / Splitter ───────────────────────────────────────────────
        // Ports: in1 at (0, h*0.26), in2 at (0, h*0.529), out at (w, h*0.395)
        // Shape is a trapezoid with its left vertices at the actual port positions
        'combiner': {
            id: 'combiner',
            label: 'Combiner/Splitter',
            category: 'passive',
            width: 120,
            height: 114,
            defaultLabel: 'COMB',
            ports: [
                { id: 'in1', side: 'left',  type: 'input',  label: 'In 1', yRatio: 0.26 },
                { id: 'in2', side: 'left',  type: 'input',  label: 'In 2', yRatio: 0.529 },
                { id: 'out', side: 'right', type: 'output', label: 'Out',  yRatio: 0.395 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const bodyH = h - 24;
                const pts = `0,${bodyH*0.22} 0,${bodyH*0.78} ${w*0.82},${bodyH*0.62} ${w*0.82},${bodyH*0.38}`;
                return `
                    <polygon class="sv-node-body" points="${pts}"/>
                    <!-- Stub from polygon right to output port -->
                    <line class="sv-node-deco" x1="${w*0.82}" y1="${bodyH*0.5}" x2="${w}" y2="${bodyH*0.5}" stroke-width="2" opacity="0.6"/>
                    <!-- Internal lines from ports to convergence showing signal paths -->
                    <line class="sv-node-deco" x1="0" y1="${bodyH*0.33}" x2="${w*0.55}" y2="${bodyH*0.46}" stroke-width="1.5" opacity="0.5"/>
                    <line class="sv-node-deco" x1="0" y1="${bodyH*0.67}" x2="${w*0.55}" y2="${bodyH*0.54}" stroke-width="1.5" opacity="0.5"/>
                    <line class="sv-node-deco" x1="${w*0.55}" y1="${bodyH*0.46}" x2="${w*0.55}" y2="${bodyH*0.54}" stroke-width="1.5" opacity="0.5"/>
                    <line class="sv-node-deco" x1="${w*0.55}" y1="${bodyH*0.5}" x2="${w*0.82}" y2="${bodyH*0.5}" stroke-width="1.5" opacity="0.5"/>
                    <text class="sv-node-type-icon" x="${w*0.38}" y="${bodyH*0.46}" text-anchor="middle" font-size="9">COMB</text>
                    <text class="sv-node-label"     x="${w*0.38}" y="${bodyH*0.60}" text-anchor="middle" font-size="8">${_esc(node.label)}</text>
                    <line class="sv-node-deco" x1="0" y1="${bodyH}" x2="${w}" y2="${bodyH}" stroke-width="0.5" opacity="0.35"/>
                    <g data-gain-node-id="${_esc(node.id)}">
                        <text class="sv-comp-gain-fwd" x="${w*0.5}" y="${bodyH + 10}" text-anchor="middle"></text>
                        <text class="sv-comp-gain-rfl" x="${w*0.5}" y="${bodyH + 20}" text-anchor="middle"></text>
                    </g>
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

        // ── Coax Switch (1-in, 2-out) ─────────────────────────────────────────
        'coax-switch': {
            id: 'coax-switch',
            label: 'Coax Switch',
            category: 'switching',
            width: 120,
            height: 114,
            defaultLabel: 'SW',
            ports: [
                { id: 'in',   side: 'left',  type: 'input',  label: 'In',   yRatio: 0.395 },
                { id: 'out1', side: 'right', type: 'output', label: 'Out 1', yRatio: 0.26 },
                { id: 'out2', side: 'right', type: 'output', label: 'Out 2', yRatio: 0.529 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const bodyH = h - 24;
                const px = w*0.44, py = bodyH*0.5;
                const ax = w*0.76, ay = bodyH*0.33;
                const bx = w*0.76, by = bodyH*0.67;
                const active = node.props?.activePort ?? 1;
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <line class="sv-node-deco" x1="${px}" y1="${py}" x2="${active===1 ? ax : bx}" y2="${active===1 ? ay : by}" stroke-width="2"   stroke-linecap="round" opacity="0.85"/>
                    <line class="sv-node-deco" x1="${px}" y1="${py}" x2="${active===1 ? bx : ax}" y2="${active===1 ? by : ay}" stroke-width="1.5" stroke-dasharray="4,3" stroke-linecap="round" opacity="0.4"/>
                    <path class="sv-node-deco" d="M${ax},${ay+4} A${bodyH*0.22},${bodyH*0.22} 0 0,1 ${bx},${by-4}" fill="none" stroke-width="1" stroke-dasharray="3,3" opacity="0.35"/>
                    <circle class="sv-node-deco" cx="${px}" cy="${py}" r="4.5" opacity="0.85"/>
                    <text class="sv-node-type-icon" x="${w*0.2}" y="${bodyH*0.44}" text-anchor="middle" font-size="14">SW</text>
                    <text class="sv-node-label"     x="${w*0.2}" y="${bodyH*0.64}" text-anchor="middle" font-size="10">${_esc(node.label)}</text>
                    <line class="sv-node-deco" x1="0" y1="${bodyH}" x2="${w}" y2="${bodyH}" stroke-width="0.5" opacity="0.35"/>
                    <g data-gain-node-id="${_esc(node.id)}">
                        <text class="sv-comp-gain-fwd" x="${w*0.5}" y="${bodyH + 10}" text-anchor="middle"></text>
                        <text class="sv-comp-gain-rfl" x="${w*0.5}" y="${bodyH + 20}" text-anchor="middle"></text>
                    </g>
                `;
            },
        },

        // ── 4-Port Switch (2-in, 2-out): straight-through or cross ───────────
        '4port-switch': {
            id: '4port-switch',
            label: '4-Port Switch',
            category: 'switching',
            width: 120,
            height: 114,
            defaultLabel: '4P-SW',
            ports: [
                { id: 'in1',  side: 'left',  type: 'input',  label: 'In 1',  yRatio: 0.26 },
                { id: 'in2',  side: 'left',  type: 'input',  label: 'In 2',  yRatio: 0.529 },
                { id: 'out1', side: 'right', type: 'output', label: 'Out 1', yRatio: 0.26 },
                { id: 'out2', side: 'right', type: 'output', label: 'Out 2', yRatio: 0.529 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const bodyH = h - 24;
                const mode = node.props?.mode || 'through';
                const in1Y  = bodyH*0.33, in2Y = bodyH*0.67;
                const out1Y = bodyH*0.33, out2Y = bodyH*0.67;
                const lx1 = w*0.12, lx2 = w*0.88;
                let paths = '';
                if (mode === 'through') {
                    paths = `
                        <line class="sv-node-deco" x1="${lx1}" y1="${in1Y}" x2="${lx2}" y2="${out1Y}" stroke-width="2" opacity="0.85"/>
                        <line class="sv-node-deco" x1="${lx1}" y1="${in2Y}" x2="${lx2}" y2="${out2Y}" stroke-width="2" opacity="0.85"/>`;
                } else {
                    // Cross: break at center to show which is on top
                    const cx = w*0.5;
                    paths = `
                        <line class="sv-node-deco" x1="${lx1}" y1="${in1Y}" x2="${cx - 4}" y2="${(in1Y+out2Y)/2 - 2}" stroke-width="2" opacity="0.85"/>
                        <line class="sv-node-deco" x1="${cx + 4}" y1="${(in1Y+out2Y)/2 + 2}" x2="${lx2}" y2="${out2Y}" stroke-width="2" opacity="0.85"/>
                        <line class="sv-node-deco" x1="${lx1}" y1="${in2Y}" x2="${lx2}" y2="${out1Y}" stroke-width="2" opacity="0.85"/>`;
                }
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    ${paths}
                    <text class="sv-node-type-icon" x="${w*0.5}" y="${bodyH*0.30}" text-anchor="middle" font-size="9">4P-SW</text>
                    <text class="sv-node-label"     x="${w*0.5}" y="${bodyH*0.56}" text-anchor="middle" font-size="9">${_esc(node.label)}</text>
                    <text class="sv-node-label"     x="${w*0.5}" y="${bodyH*0.78}" text-anchor="middle" font-size="8">${mode.toUpperCase()}</text>
                    <line class="sv-node-deco" x1="0" y1="${bodyH}" x2="${w}" y2="${bodyH}" stroke-width="0.5" opacity="0.35"/>
                    <g data-gain-node-id="${_esc(node.id)}">
                        <text class="sv-comp-gain-fwd" x="${w*0.5}" y="${bodyH + 10}" text-anchor="middle"></text>
                        <text class="sv-comp-gain-rfl" x="${w*0.5}" y="${bodyH + 20}" text-anchor="middle"></text>
                    </g>
                `;
            },
        },

        // ── Filter ────────────────────────────────────────────────────────────
        'filter': {
            id: 'filter',
            label: 'Filter',
            category: 'passive',
            width: 110,
            height: 84,
            defaultLabel: 'FILT',
            ports: [
                { id: 'in',  side: 'left',  type: 'input',  label: 'In',  yRatio: 0.5 },
                { id: 'out', side: 'right', type: 'output', label: 'Out', yRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const bodyH = h - 24;
                const ft = node.props?.filterType || 'lowpass';
                const ftLabel = { lowpass: 'LP', highpass: 'HP', bandpass: 'BP', notch: 'NOTCH' }[ft] || ft.toUpperCase();
                // Frequency response curve per filter type
                let curve = '';
                if (ft === 'lowpass') {
                    curve = `<path class="sv-node-deco" d="M${w*0.2},${bodyH*0.3} L${w*0.48},${bodyH*0.3} C${w*0.58},${bodyH*0.3} ${w*0.62},${bodyH*0.7} ${w*0.8},${bodyH*0.7}" fill="none" stroke-width="1.5" opacity="0.75"/>`;
                } else if (ft === 'highpass') {
                    curve = `<path class="sv-node-deco" d="M${w*0.2},${bodyH*0.7} C${w*0.38},${bodyH*0.7} ${w*0.42},${bodyH*0.3} ${w*0.52},${bodyH*0.3} L${w*0.8},${bodyH*0.3}" fill="none" stroke-width="1.5" opacity="0.75"/>`;
                } else if (ft === 'bandpass') {
                    curve = `<path class="sv-node-deco" d="M${w*0.2},${bodyH*0.7} C${w*0.3},${bodyH*0.7} ${w*0.36},${bodyH*0.26} ${w*0.5},${bodyH*0.26} C${w*0.64},${bodyH*0.26} ${w*0.7},${bodyH*0.7} ${w*0.8},${bodyH*0.7}" fill="none" stroke-width="1.5" opacity="0.75"/>`;
                } else {
                    // notch
                    curve = `<path class="sv-node-deco" d="M${w*0.2},${bodyH*0.3} C${w*0.3},${bodyH*0.3} ${w*0.38},${bodyH*0.74} ${w*0.5},${bodyH*0.74} C${w*0.62},${bodyH*0.74} ${w*0.7},${bodyH*0.3} ${w*0.8},${bodyH*0.3}" fill="none" stroke-width="1.5" opacity="0.75"/>`;
                }
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    ${curve}
                    <text class="sv-node-type-icon" x="${w*0.5}" y="${bodyH*0.90}" text-anchor="middle" font-size="10">${ftLabel}</text>
                    <line class="sv-node-deco" x1="0" y1="${bodyH}" x2="${w}" y2="${bodyH}" stroke-width="0.5" opacity="0.35"/>
                    <g data-gain-node-id="${_esc(node.id)}">
                        <text class="sv-comp-gain-fwd" x="${w*0.5}" y="${bodyH + 10}" text-anchor="middle"></text>
                        <text class="sv-comp-gain-rfl" x="${w*0.5}" y="${bodyH + 20}" text-anchor="middle"></text>
                    </g>
                `;
            },
        },

        // ── Directional Coupler ───────────────────────────────────────────────
        'coupler': {
            id: 'coupler',
            label: 'Directional Coupler',
            category: 'passive',
            width: 130,
            height: 114,
            defaultLabel: 'CPLR',
            ports: [
                { id: 'in',      side: 'left',   type: 'input',  label: 'In',      yRatio: 0.395 },
                { id: 'out',     side: 'right',  type: 'output', label: 'Out',     yRatio: 0.395 },
                { id: 'coupled', side: 'bottom', type: 'output', label: 'Coupled', xRatio: 0.5 },
            ],
            renderBody(node) {
                const w = this.width, h = this.height;
                const bodyH = h - 24;
                const cx = w * 0.5;
                return `
                    <rect class="sv-node-body" x="0" y="0" width="${w}" height="${h}" rx="4"/>
                    <line class="sv-node-deco" x1="${w*0.07}" y1="${bodyH*0.5}" x2="${w*0.93}" y2="${bodyH*0.5}" stroke-width="1.5" stroke-dasharray="5,2" opacity="0.3"/>
                    <line class="sv-node-deco" x1="${w*0.38}" y1="${bodyH*0.3}" x2="${w*0.62}" y2="${bodyH*0.3}" stroke-width="2" opacity="0.6"/>
                    <line class="sv-node-deco" x1="${w*0.38}" y1="${bodyH*0.4}" x2="${w*0.62}" y2="${bodyH*0.4}" stroke-width="2" opacity="0.6"/>
                    <line class="sv-node-deco" x1="${cx}" y1="${bodyH*0.5}"   x2="${cx}" y2="${bodyH*0.87}" stroke-width="1.5" opacity="0.75"/>
                    <polygon class="sv-node-deco" points="${cx},${bodyH*0.87} ${cx-5},${bodyH*0.76} ${cx+5},${bodyH*0.76}" opacity="0.75"/>
                    <text class="sv-node-type-icon" x="${cx}" y="${bodyH*0.22}" text-anchor="middle" font-size="12">CPL</text>
                    <text class="sv-node-label"     x="${w*0.26}" y="${bodyH*0.72}" text-anchor="middle" font-size="10">${_esc(node.label)}</text>
                    <line class="sv-node-deco" x1="0" y1="${bodyH}" x2="${w}" y2="${bodyH}" stroke-width="0.5" opacity="0.35"/>
                    <g data-gain-node-id="${_esc(node.id)}">
                        <text class="sv-comp-gain-fwd" x="${w*0.5}" y="${bodyH + 10}" text-anchor="middle"></text>
                        <text class="sv-comp-gain-rfl" x="${w*0.5}" y="${bodyH + 20}" text-anchor="middle"></text>
                    </g>
                `;
            },
        },

    };

    function createNode(type, x, y) {
        const typeDef = COMPONENT_TYPES[type];
        if (!typeDef) throw new Error(`SiteViewComponents: unknown component type "${type}"`);

        let props = {};
        if (type === 'attenuator')   props = { attenuationDb: 3 };
        if (type === 'dwm-meter')    props = { deviceUid: null, deviceName: null, measureType: 'forward' };
        if (type === 'amplifier')    props = { gainDb: null };
        if (type === 'transmitter')  props = { powerW: null, freqMHz: null };
        if (type === 'filter')       props = { filterType: 'lowpass' };
        if (type === '4port-switch') props = { mode: 'through' };
        if (type === 'coax-switch')  props = { activePort: 1 };

        return {
            id:    'node-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            type,
            x,
            y,
            label: typeDef.defaultLabel,
            props,
        };
    }

    function getPortAbsolutePos(node, portId) {
        const typeDef = COMPONENT_TYPES[node.type];
        if (!typeDef) return null;
        const port = typeDef.ports.find(p => p.id === portId);
        if (!port) return null;
        const local = _portLocalPos(typeDef, port);
        return { x: node.x + local.x, y: node.y + local.y, side: port.side };
    }

    function getPortScreenPos(node, portId, viewport) {
        const abs = getPortAbsolutePos(node, portId);
        if (!abs) return null;
        const s = viewport.scale ?? 1;
        return { x: abs.x * s + (viewport.x ?? 0), y: abs.y * s + (viewport.y ?? 0) };
    }

    function renderNodeSVG(node) {
        const typeDef = COMPONENT_TYPES[node.type];
        if (!typeDef) return `<!-- sv-unknown-type: ${_esc(node.type)} -->`;

        const w = typeDef.width, h = typeDef.height;
        const nid = _esc(node.id);

        const portsHtml = typeDef.ports.map(port => {
            const { x: px, y: py } = _portLocalPos(typeDef, port);
            const lp  = _portLabelPos(port, px, py);
            const pid = _esc(port.id);
            return (
                `<circle class="sv-port-hit" cx="${px}" cy="${py}" r="12"` +
                    ` data-node-id="${nid}" data-port-id="${pid}"` +
                    ` data-port-type="${port.type}" data-port-side="${port.side}"/>` +
                `<circle class="sv-port sv-port-${port.type}" cx="${px}" cy="${py}" r="6"` +
                    ` pointer-events="none" data-node-id="${nid}" data-port-id="${pid}"/>` +
                `<text class="sv-port-label" x="${lp.x}" y="${lp.y}"` +
                    ` font-size="9" text-anchor="${lp.anchor}">${_esc(port.label)}</text>`
            );
        }).join('\n        ');

        return (
            `<g id="sv-node-${nid}" class="sv-node sv-node-${_esc(node.type)}"` +
            ` transform="translate(${node.x},${node.y})" data-node-id="${nid}">` +
            `\n    ${typeDef.renderBody(node)}` +
            `\n    <rect class="sv-node-selection" x="-4" y="-4"` +
            ` width="${w + 8}" height="${h + 8}" rx="8"` +
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
