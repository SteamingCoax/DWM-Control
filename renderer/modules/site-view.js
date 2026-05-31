/**
 * site-view.js
 * Site View schematic editor — attaches prototype methods to DWMControl.
 * Loaded after site-view-components.js; depends on window.SiteViewComponents.
 */
(function attachSiteViewModule() {
    'use strict';

    if (typeof DWMControl === 'undefined') {
        console.error('DWMControl class must be loaded before site-view.js');
        return;
    }

    // ─── SVG namespace constant ───────────────────────────────────────────────

    const SVG_NS = 'http://www.w3.org/2000/svg';

    // ─── Setup ───────────────────────────────────────────────────────────────

    DWMControl.prototype.setupSiteView = function () {
        this.sv = {
            nodes:          new Map(),   // id -> node object
            connections:    new Map(),   // id -> connection object
            viewport:       { x: 0, y: 0, scale: 1.0 },
            selectedNodeId: null,
            selectedConnId: null,
            connectingFrom: null,        // { nodeId, portId, portType } while drawing a wire
            panStart:       null,        // { clientX, clientY, vpX, vpY } while panning
            dragNodeId:     null,        // id of node currently being dragged
            dragOffset:     { x: 0, y: 0 },
            saveTimer:      null,
            powerTimer:     null,
            isDirty:        false,
        };
        this._svLoadSchematic();
        this._svRenderSidebar();
        this._svRender();
        this._svSetupEvents();
        this._svStartPowerUpdates();
    };

    // ─── Sidebar palette ─────────────────────────────────────────────────────

    DWMControl.prototype._svRenderSidebar = function () {
        const sidebar = document.getElementById('sv-sidebar');
        if (!sidebar) return;

        const { getComponentCategories, COMPONENT_TYPES } = window.SiteViewComponents;
        const categories = getComponentCategories();

        let html = '<div class="sv-sidebar-header">Components</div>';

        for (const cat of categories) {
            if (!cat.items.length) continue;
            html += `<div class="sv-category-header">${_esc(cat.label)}</div>`;

            for (const item of cat.items) {
                const typeDef = COMPONENT_TYPES[item.typeId];
                if (!typeDef) continue;

                // Minimal node stub used solely for rendering the body preview SVG
                const previewNode = {
                    id: 'preview',
                    type: item.typeId,
                    x: 0, y: 0,
                    label: typeDef.defaultLabel,
                    props: _defaultProps(item.typeId),
                };
                const bodyHtml = typeDef.renderBody(previewNode);

                html += `
<div class="sv-palette-item" draggable="true" data-component-type="${_esc(item.typeId)}" title="${_esc(item.label)}">
    <svg width="36" height="24" viewBox="0 0 ${typeDef.width} ${typeDef.height}"
         preserveAspectRatio="xMidYMid meet" xmlns="${SVG_NS}">
        ${bodyHtml}
    </svg>
    <span>${_esc(item.label)}</span>
</div>`;
            }
        }

        sidebar.innerHTML = html;
    };

    // ─── Full SVG re-render ───────────────────────────────────────────────────

    DWMControl.prototype._svRender = function () {
        const svgEl = document.getElementById('sv-canvas-svg');
        if (!svgEl) return;

        const vp = this.sv.viewport;

        // Ensure <defs> exists and contains arrow marker + grid pattern
        let defs = svgEl.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS(SVG_NS, 'defs');
            svgEl.prepend(defs);
        }
        defs.innerHTML = `
<marker id="sv-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" fill="#64748b"/>
</marker>
<pattern id="sv-grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse"
    patternTransform="translate(${vp.x},${vp.y}) scale(${vp.scale})">
    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>
</pattern>`;

        // Grid background rect (behind #sv-world)
        let gridBg = document.getElementById('sv-grid-bg');
        if (!gridBg) {
            gridBg = document.createElementNS(SVG_NS, 'rect');
            gridBg.id = 'sv-grid-bg';
            gridBg.setAttribute('fill', 'url(#sv-grid-pattern)');
            const worldEl = document.getElementById('sv-world');
            if (worldEl) svgEl.insertBefore(gridBg, worldEl);
            else svgEl.appendChild(gridBg);
        }
        gridBg.setAttribute('width', svgEl.clientWidth || 2000);
        gridBg.setAttribute('height', svgEl.clientHeight || 1500);

        // World transform
        const worldEl = document.getElementById('sv-world');
        if (worldEl) {
            worldEl.setAttribute('transform', `translate(${vp.x},${vp.y}) scale(${vp.scale})`);
        }

        this._svRenderConnections();
        this._svRenderNodes();
        this._svUpdateSelectionVisuals();
    };

    DWMControl.prototype._svRenderConnections = function () {
        const layer = document.getElementById('sv-connections-layer');
        if (!layer) return;
        layer.innerHTML = '';

        for (const conn of this.sv.connections.values()) {
            const fromNode = this.sv.nodes.get(conn.fromNodeId);
            const toNode   = this.sv.nodes.get(conn.toNodeId);
            if (!fromNode || !toNode) continue;

            const d = this._svConnectionPath(fromNode, conn.fromPortId, toNode, conn.toPortId);
            if (!d) continue;

            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('id', `sv-conn-${conn.id}`);
            path.setAttribute('class', 'sv-connection');
            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', 'url(#sv-arrow)');
            path.setAttribute('data-conn-id', conn.id);
            layer.appendChild(path);
        }
    };

    DWMControl.prototype._svRenderNodes = function () {
        const layer = document.getElementById('sv-nodes-layer');
        if (!layer) return;

        let html = '';
        for (const node of this.sv.nodes.values()) {
            html += window.SiteViewComponents.renderNodeSVG(node);
        }
        layer.innerHTML = html;
    };

    // ─── Selection visuals (no full re-render) ────────────────────────────────

    DWMControl.prototype._svUpdateSelectionVisuals = function () {
        const nodesLayer = document.getElementById('sv-nodes-layer');
        const connsLayer = document.getElementById('sv-connections-layer');
        if (!nodesLayer || !connsLayer) return;

        // Clear all node selections
        nodesLayer.querySelectorAll('.sv-node.sv-selected').forEach(el => {
            el.classList.remove('sv-selected');
            const selRect = el.querySelector('.sv-node-selection');
            if (selRect) selRect.setAttribute('visibility', 'hidden');
        });

        // Clear all connection selections
        connsLayer.querySelectorAll('.sv-connection-selected').forEach(el => {
            el.classList.remove('sv-connection-selected');
        });

        // Apply selected node
        if (this.sv.selectedNodeId) {
            const nodeEl = nodesLayer.querySelector(
                `[data-node-id="${CSS.escape(this.sv.selectedNodeId)}"]`
            );
            if (nodeEl && nodeEl.classList.contains('sv-node')) {
                nodeEl.classList.add('sv-selected');
                const selRect = nodeEl.querySelector('.sv-node-selection');
                if (selRect) selRect.setAttribute('visibility', 'visible');
            }
        }

        // Apply selected connection
        if (this.sv.selectedConnId) {
            const connEl = connsLayer.querySelector(
                `[data-conn-id="${CSS.escape(this.sv.selectedConnId)}"]`
            );
            if (connEl) connEl.classList.add('sv-connection-selected');
        }
    };

    // ─── Event wiring ─────────────────────────────────────────────────────────

    DWMControl.prototype._svSetupEvents = function () {
        if (this._svEventsAttached) return;
        this._svEventsAttached = true;

        const svg     = document.getElementById('sv-canvas-svg');
        const sidebar = document.getElementById('sv-sidebar');
        if (!svg || !sidebar) return;

        // ── Sidebar drag-start (delegated) ────────────────────────────────────
        sidebar.addEventListener('dragstart', (e) => {
            const item = e.target.closest('[data-component-type]');
            if (!item) return;
            e.dataTransfer.setData('text/plain', item.getAttribute('data-component-type'));
            e.dataTransfer.effectAllowed = 'copy';
        });

        // ── Canvas drag-over / drop ───────────────────────────────────────────
        svg.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        svg.addEventListener('drop', (e) => {
            e.preventDefault();
            const type = e.dataTransfer.getData('text/plain');
            const { COMPONENT_TYPES, createNode } = window.SiteViewComponents;
            if (!type || !COMPONENT_TYPES[type]) return;

            const comp = COMPONENT_TYPES[type];
            const rect = svg.getBoundingClientRect();
            const vp   = this.sv.viewport;
            const wx   = (e.clientX - rect.left - vp.x) / vp.scale;
            const wy   = (e.clientY - rect.top  - vp.y) / vp.scale;

            // Snap center of component to 20-px grid
            const snappedX = Math.round((wx - comp.width  / 2) / 20) * 20;
            const snappedY = Math.round((wy - comp.height / 2) / 20) * 20;

            const node = createNode(type, snappedX, snappedY);
            this.sv.nodes.set(node.id, node);
            this._svRender();
            this._svSelectNode(node.id);
            this._svMarkDirty();
        });

        // ── Mousedown — route to pan / drag / connect / select ────────────────
        svg.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;

            const target   = e.target;
            const isPort   = target.classList.contains('sv-port-hit');
            const nodeEl   = target.closest('[data-node-id]');
            const connEl   = target.closest('[id^="sv-conn-"]');

            if (isPort) {
                const nodeId   = target.getAttribute('data-node-id');
                const portId   = target.getAttribute('data-port-id');
                const portType = target.getAttribute('data-port-type');
                this._svStartConnecting(nodeId, portId, portType, e);

            } else if (nodeEl && nodeEl.id && nodeEl.id.startsWith('sv-node-')) {
                const nodeId = nodeEl.getAttribute('data-node-id');
                this._svStartDragNode(nodeId, e);

            } else if (connEl) {
                const connId = connEl.getAttribute('data-conn-id');
                this._svSelectConnection(connId);

            } else {
                this._svStartPan(e);
            }
        });

        // ── Global mouse move / up ────────────────────────────────────────────
        document.addEventListener('mousemove', (e) => this._svOnMouseMove(e));
        document.addEventListener('mouseup',   (e) => this._svOnMouseUp(e));

        // ── Scroll-to-zoom ────────────────────────────────────────────────────
        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect     = svg.getBoundingClientRect();
            const mouseX   = e.clientX - rect.left;
            const mouseY   = e.clientY - rect.top;
            const factor   = e.deltaY < 0 ? 1.1 : 0.9;
            const prevScale = this.sv.viewport.scale;
            const newScale  = Math.min(4, Math.max(0.2, prevScale * factor));

            this.sv.viewport.x = mouseX - (mouseX - this.sv.viewport.x) * (newScale / prevScale);
            this.sv.viewport.y = mouseY - (mouseY - this.sv.viewport.y) * (newScale / prevScale);
            this.sv.viewport.scale = newScale;
            this._svApplyViewport();
        }, { passive: false });

        // ── Delete key ───────────────────────────────────────────────────────
        document.addEventListener('keydown', (e) => {
            const panel = document.getElementById('siteview-panel');
            if (!panel || !panel.classList.contains('active')) return;
            if ((e.key === 'Delete' || e.key === 'Backspace') &&
                !e.target.matches('input, textarea, select')) {
                this._svDeleteSelected();
            }
        });

        // ── Toolbar buttons ───────────────────────────────────────────────────
        const clearBtn  = document.getElementById('sv-clear-btn');
        const fitBtn    = document.getElementById('sv-fit-btn');
        const deleteBtn = document.getElementById('sv-delete-selected-btn');
        if (clearBtn)  clearBtn.addEventListener('click',  () => this._svClear());
        if (fitBtn)    fitBtn.addEventListener('click',    () => this._svFitView());
        if (deleteBtn) deleteBtn.addEventListener('click', () => this._svDeleteSelected());
    };

    // ─── Pan ──────────────────────────────────────────────────────────────────

    DWMControl.prototype._svStartPan = function (e) {
        this.sv.panStart = {
            clientX: e.clientX,
            clientY: e.clientY,
            vpX: this.sv.viewport.x,
            vpY: this.sv.viewport.y,
        };
        // Deselect everything when panning empty canvas
        this.sv.selectedNodeId = null;
        this.sv.selectedConnId = null;
        this._svUpdateSelectionVisuals();
        this._svRenderProperties();
    };

    // ─── Node drag ────────────────────────────────────────────────────────────

    DWMControl.prototype._svStartDragNode = function (nodeId, e) {
        const node = this.sv.nodes.get(nodeId);
        if (!node) return;

        const svg  = document.getElementById('sv-canvas-svg');
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const vp   = this.sv.viewport;
        const wx   = (e.clientX - rect.left - vp.x) / vp.scale;
        const wy   = (e.clientY - rect.top  - vp.y) / vp.scale;

        this.sv.dragNodeId = nodeId;
        this.sv.dragOffset = { x: wx - node.x, y: wy - node.y };
        this._svSelectNode(nodeId);
    };

    // ─── Connection drawing ───────────────────────────────────────────────────

    DWMControl.prototype._svStartConnecting = function (nodeId, portId, portType, e) {
        const node = this.sv.nodes.get(nodeId);
        if (!node) return;

        const pos  = window.SiteViewComponents.getPortAbsolutePos(node, portId);
        if (!pos) return;

        this.sv.connectingFrom = { nodeId, portId, portType };

        const wire = document.getElementById('sv-temp-wire');
        if (wire) {
            wire.setAttribute('x1', pos.x);
            wire.setAttribute('y1', pos.y);
            wire.setAttribute('x2', pos.x);
            wire.setAttribute('y2', pos.y);
            wire.setAttribute('visibility', 'visible');
        }
    };

    // ─── Mouse move ───────────────────────────────────────────────────────────

    DWMControl.prototype._svOnMouseMove = function (e) {
        const svg = document.getElementById('sv-canvas-svg');
        if (!svg) return;

        const vp   = this.sv.viewport;
        const rect = svg.getBoundingClientRect();

        if (this.sv.panStart) {
            const dx = e.clientX - this.sv.panStart.clientX;
            const dy = e.clientY - this.sv.panStart.clientY;
            this.sv.viewport.x = this.sv.panStart.vpX + dx;
            this.sv.viewport.y = this.sv.panStart.vpY + dy;
            this._svApplyViewport();
            return;
        }

        if (this.sv.dragNodeId) {
            const node = this.sv.nodes.get(this.sv.dragNodeId);
            if (!node) return;
            const wx = (e.clientX - rect.left - vp.x) / vp.scale;
            const wy = (e.clientY - rect.top  - vp.y) / vp.scale;
            node.x = Math.round((wx - this.sv.dragOffset.x) / 20) * 20;
            node.y = Math.round((wy - this.sv.dragOffset.y) / 20) * 20;
            this._svRender();
            return;
        }

        if (this.sv.connectingFrom) {
            const wx = (e.clientX - rect.left - vp.x) / vp.scale;
            const wy = (e.clientY - rect.top  - vp.y) / vp.scale;
            const wire = document.getElementById('sv-temp-wire');
            if (wire) {
                wire.setAttribute('x2', wx);
                wire.setAttribute('y2', wy);
            }
        }
    };

    // ─── Mouse up ─────────────────────────────────────────────────────────────

    DWMControl.prototype._svOnMouseUp = function (e) {
        if (this.sv.panStart) {
            this.sv.panStart = null;
            return;
        }

        if (this.sv.dragNodeId) {
            this.sv.dragNodeId = null;
            this._svMarkDirty();
            return;
        }

        if (this.sv.connectingFrom) {
            const from = this.sv.connectingFrom;
            this.sv.connectingFrom = null;

            const wire = document.getElementById('sv-temp-wire');
            if (wire) wire.setAttribute('visibility', 'hidden');

            // Convert mouse position to world coordinates
            const svg  = document.getElementById('sv-canvas-svg');
            if (!svg) return;
            const rect = svg.getBoundingClientRect();
            const vp   = this.sv.viewport;
            const wx   = (e.clientX - rect.left - vp.x) / vp.scale;
            const wy   = (e.clientY - rect.top  - vp.y) / vp.scale;

            // Find the closest compatible port within 15 world-units
            let bestDist  = 15;
            let toNodeId  = null;
            let toPortId  = null;
            let toPortType = null;

            const { COMPONENT_TYPES, getPortAbsolutePos } = window.SiteViewComponents;

            for (const node of this.sv.nodes.values()) {
                if (node.id === from.nodeId) continue;
                const typeDef = COMPONENT_TYPES[node.type];
                if (!typeDef) continue;
                for (const port of typeDef.ports) {
                    const pos  = getPortAbsolutePos(node, port.id);
                    if (!pos) continue;
                    const dist = Math.hypot(pos.x - wx, pos.y - wy);
                    if (dist < bestDist) {
                        bestDist   = dist;
                        toNodeId   = node.id;
                        toPortId   = port.id;
                        toPortType = port.type;
                    }
                }
            }

            if (!toNodeId) return;

            // Validate direction: one side must be output (or bidirectional) and the other input
            const fromOut = from.portType === 'output'       || from.portType === 'bidirectional';
            const fromIn  = from.portType === 'input'        || from.portType === 'bidirectional';
            const toIn    = toPortType    === 'input'        || toPortType    === 'bidirectional';
            const toOut   = toPortType    === 'output'       || toPortType    === 'bidirectional';

            if (!(fromOut && toIn) && !(fromIn && toOut)) return;

            // Normalise so the "from" side is always the output port
            let fnId = from.nodeId, fpId = from.portId;
            let tnId = toNodeId,    tpId = toPortId;
            if (fromIn && toOut) {
                [fnId, fpId, tnId, tpId] = [tnId, tpId, fnId, fpId];
            }

            // Reject duplicates
            for (const conn of this.sv.connections.values()) {
                if (conn.fromNodeId === fnId && conn.fromPortId === fpId &&
                    conn.toNodeId   === tnId && conn.toPortId   === tpId) {
                    return;
                }
            }

            const connId = 'conn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
            this.sv.connections.set(connId, {
                id: connId,
                fromNodeId: fnId, fromPortId: fpId,
                toNodeId:   tnId, toPortId:   tpId,
            });
            this._svRender();
            this._svMarkDirty();
        }
    };

    // ─── Viewport (fast path — no full re-render) ─────────────────────────────

    DWMControl.prototype._svApplyViewport = function () {
        const vp     = this.sv.viewport;
        const worldEl = document.getElementById('sv-world');
        if (worldEl) {
            worldEl.setAttribute('transform', `translate(${vp.x},${vp.y}) scale(${vp.scale})`);
        }

        // Shift grid pattern to follow the viewport
        const svgEl = document.getElementById('sv-canvas-svg');
        if (!svgEl) return;

        const pattern = svgEl.querySelector('#sv-grid-pattern');
        if (pattern) {
            pattern.setAttribute('patternTransform',
                `translate(${vp.x},${vp.y}) scale(${vp.scale})`);
        }

        const gridBg = document.getElementById('sv-grid-bg');
        if (gridBg) {
            gridBg.setAttribute('width',  svgEl.clientWidth  || 2000);
            gridBg.setAttribute('height', svgEl.clientHeight || 1500);
        }
    };

    // ─── Fit view ─────────────────────────────────────────────────────────────

    DWMControl.prototype._svFitView = function () {
        if (this.sv.nodes.size === 0) {
            this.sv.viewport = { x: 0, y: 0, scale: 1.0 };
            this._svApplyViewport();
            return;
        }

        const COMP_TYPES = window.SiteViewComponents.COMPONENT_TYPES;
        let minX =  Infinity, minY =  Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const node of this.sv.nodes.values()) {
            const td = COMP_TYPES[node.type];
            const w  = td ? td.width  : 120;
            const h  = td ? td.height : 80;
            if (node.x       < minX) minX = node.x;
            if (node.y       < minY) minY = node.y;
            if (node.x + w   > maxX) maxX = node.x + w;
            if (node.y + h   > maxY) maxY = node.y + h;
        }

        const PAD   = 40;
        const svgEl = document.getElementById('sv-canvas-svg');
        const svgW  = svgEl ? (svgEl.clientWidth  || 800) : 800;
        const svgH  = svgEl ? (svgEl.clientHeight || 600) : 600;

        const worldW = maxX - minX || 1;
        const worldH = maxY - minY || 1;
        const scale  = Math.min(4, Math.max(0.2,
            Math.min((svgW - PAD * 2) / worldW, (svgH - PAD * 2) / worldH)
        ));

        this.sv.viewport.scale = scale;
        this.sv.viewport.x = (svgW - worldW * scale) / 2 - minX * scale;
        this.sv.viewport.y = (svgH - worldH * scale) / 2 - minY * scale;
        this._svApplyViewport();
    };

    // ─── Clear ────────────────────────────────────────────────────────────────

    DWMControl.prototype._svClear = function () {
        if (!window.confirm('Clear all nodes and connections? This cannot be undone.')) return;
        this.sv.nodes.clear();
        this.sv.connections.clear();
        this.sv.selectedNodeId = null;
        this.sv.selectedConnId = null;
        this._svRender();
        this._svRenderProperties();
        try { localStorage.removeItem('dwm-siteview-schematic'); } catch (_) {}
        this._svSetSaveStatus('ready');
    };

    // ─── Delete selected ──────────────────────────────────────────────────────

    DWMControl.prototype._svDeleteSelected = function () {
        if (this.sv.selectedNodeId) {
            const nodeId = this.sv.selectedNodeId;
            this.sv.nodes.delete(nodeId);

            // Remove every connection that references this node
            for (const [connId, conn] of this.sv.connections) {
                if (conn.fromNodeId === nodeId || conn.toNodeId === nodeId) {
                    this.sv.connections.delete(connId);
                }
            }

            this.sv.selectedNodeId = null;
            this._svRender();
            this._svRenderProperties();
            this._svMarkDirty();

        } else if (this.sv.selectedConnId) {
            this.sv.connections.delete(this.sv.selectedConnId);
            this.sv.selectedConnId = null;
            this._svRender();
            this._svRenderProperties();
            this._svMarkDirty();
        }
    };

    // ─── Selection ───────────────────────────────────────────────────────────

    DWMControl.prototype._svSelectNode = function (nodeId) {
        this.sv.selectedNodeId = nodeId;
        this.sv.selectedConnId = null;
        this._svUpdateSelectionVisuals();
        this._svRenderProperties();
    };

    DWMControl.prototype._svSelectConnection = function (connId) {
        this.sv.selectedConnId = connId;
        this.sv.selectedNodeId = null;
        this._svUpdateSelectionVisuals();
        this._svRenderProperties();
    };

    // ─── Properties panel ─────────────────────────────────────────────────────

    DWMControl.prototype._svRenderProperties = function () {
        const content = document.getElementById('sv-props-content');
        if (!content) return;

        if (this.sv.selectedNodeId) {
            const node = this.sv.nodes.get(this.sv.selectedNodeId);
            if (!node) { content.innerHTML = ''; return; }

            let html = `<div class="sv-props-section">
<div class="sv-props-title">${_esc(node.type)}</div>

<div class="sv-props-field">
    <label class="sv-props-label">Label</label>
    <input class="sv-props-input" type="text" id="sv-prop-label"
           value="${_esc(node.label)}" placeholder="Label">
</div>`;

            // ── DWM Power Meter ───────────────────────────────────────────────
            if (node.type === 'dwm-meter') {
                let deviceOptions = '<option value="">-- Unlinked --</option>';
                if (window.dwm?.meterRegistry) {
                    for (const [, record] of window.dwm.meterRegistry.entries()) {
                        const uid      = record.apiUid || record.key;
                        const name     = record.friendlyName || record.portPath || record.key;
                        const selected = uid === node.props.deviceUid ? ' selected' : '';
                        deviceOptions += `<option value="${_esc(uid)}"${selected}>${_esc(name)}</option>`;
                    }
                }

                html += `
<div class="sv-props-field">
    <label class="sv-props-label">Device</label>
    <select class="sv-props-select" id="sv-prop-device">${deviceOptions}</select>
</div>
<div class="sv-props-field">
    <label class="sv-props-label">Measure Type</label>
    <select class="sv-props-select" id="sv-prop-measure">
        <option value="forward"${node.props.measureType === 'forward'  ? ' selected' : ''}>Forward</option>
        <option value="reverse"${node.props.measureType === 'reverse'  ? ' selected' : ''}>Reflect</option>
    </select>
</div>`;
            }

            // ── Attenuator ────────────────────────────────────────────────────
            if (node.type === 'attenuator') {
                html += `
<div class="sv-props-field">
    <label class="sv-props-label">Attenuation (dB)</label>
    <input class="sv-props-input" type="number" id="sv-prop-att-db"
           value="${_esc(String(node.props.attenuationDb ?? 3))}" min="0" step="0.5">
</div>`;
            }

            // ── Coax Switch ───────────────────────────────────────────────────
            if (node.type === 'coax-switch') {
                html += `
<div class="sv-props-field">
    <label class="sv-props-label">Active Port</label>
    <select class="sv-props-select" id="sv-prop-active-port">
        <option value="1"${node.props.activePort === 1 ? ' selected' : ''}>Port 1</option>
        <option value="2"${node.props.activePort === 2 ? ' selected' : ''}>Port 2</option>
    </select>
</div>`;
            }

            html += `
<button class="sv-props-delete-btn" id="sv-prop-delete-btn">Delete Node</button>
</div>`;

            content.innerHTML = html;

            // Wire up label input
            const labelInput = document.getElementById('sv-prop-label');
            if (labelInput) {
                labelInput.addEventListener('input', () => {
                    node.label = labelInput.value;
                    // Patch the label text in the live SVG without a full re-render
                    const nodesLayer = document.getElementById('sv-nodes-layer');
                    if (nodesLayer) {
                        const nodeG = nodesLayer.querySelector(
                            `[data-node-id="${CSS.escape(node.id)}"]`
                        );
                        if (nodeG) {
                            const labelEl = nodeG.querySelector('.sv-node-label');
                            if (labelEl) labelEl.textContent = node.label;
                        }
                    }
                    this._svMarkDirty();
                });
            }

            // Wire up DWM meter selectors
            if (node.type === 'dwm-meter') {
                const deviceSel  = document.getElementById('sv-prop-device');
                const measureSel = document.getElementById('sv-prop-measure');

                if (deviceSel) {
                    deviceSel.addEventListener('change', () => {
                        const uid = deviceSel.value;
                        if (!uid) {
                            node.props.deviceUid  = null;
                            node.props.deviceName = null;
                        } else {
                            node.props.deviceUid = uid;
                            node.props.deviceName = uid; // fallback
                            if (window.dwm?.meterRegistry) {
                                for (const record of window.dwm.meterRegistry.values()) {
                                    if ((record.apiUid || record.key) === uid) {
                                        node.props.deviceName = record.friendlyName || record.portPath || uid;
                                        break;
                                    }
                                }
                            }
                        }
                        this._svRender();
                        this._svMarkDirty();
                    });
                }

                if (measureSel) {
                    measureSel.addEventListener('change', () => {
                        node.props.measureType = measureSel.value;
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
            }

            // Wire up attenuator dB input
            if (node.type === 'attenuator') {
                const attInput = document.getElementById('sv-prop-att-db');
                if (attInput) {
                    attInput.addEventListener('change', () => {
                        node.props.attenuationDb = parseFloat(attInput.value) || 0;
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
            }

            // Wire up coax-switch active port
            if (node.type === 'coax-switch') {
                const portSel = document.getElementById('sv-prop-active-port');
                if (portSel) {
                    portSel.addEventListener('change', () => {
                        node.props.activePort = parseInt(portSel.value, 10);
                        this._svMarkDirty();
                    });
                }
            }

            // Delete button
            const delBtn = document.getElementById('sv-prop-delete-btn');
            if (delBtn) delBtn.addEventListener('click', () => this._svDeleteSelected());

        } else if (this.sv.selectedConnId) {
            const conn = this.sv.connections.get(this.sv.selectedConnId);
            if (!conn) { content.innerHTML = ''; return; }

            const fromNode = this.sv.nodes.get(conn.fromNodeId);
            const toNode   = this.sv.nodes.get(conn.toNodeId);

            content.innerHTML = `
<div class="sv-props-section">
    <div class="sv-props-title">Connection</div>
    <div class="sv-props-info">From: <strong>${_esc(fromNode?.label || conn.fromNodeId)}</strong> / ${_esc(conn.fromPortId)}</div>
    <div class="sv-props-info">To: <strong>${_esc(toNode?.label || conn.toNodeId)}</strong> / ${_esc(conn.toPortId)}</div>
    <button class="sv-props-delete-btn" id="sv-prop-delete-conn-btn">Delete Connection</button>
</div>`;

            const delBtn = document.getElementById('sv-prop-delete-conn-btn');
            if (delBtn) delBtn.addEventListener('click', () => this._svDeleteSelected());

        } else {
            content.innerHTML =
                '<div class="sv-props-empty">Select a component or connection to edit its properties.</div>';
        }
    };

    // ─── Live power readouts ──────────────────────────────────────────────────

    DWMControl.prototype._svStartPowerUpdates = function () {
        if (this.sv.powerTimer) clearInterval(this.sv.powerTimer);
        this.sv.powerTimer = setInterval(() => this._svUpdatePowerReadouts(), 500);
    };

    DWMControl.prototype._svUpdatePowerReadouts = function () {
        const nodesLayer = document.getElementById('sv-nodes-layer');
        if (!nodesLayer) return;

        for (const node of this.sv.nodes.values()) {
            if (node.type !== 'dwm-meter') continue;

            let fwdText = '-- --';
            let rflText = '-- --';

            const deviceUid = node.props.deviceUid;
            if (deviceUid && window.dwm?.meterRegistry) {
                // Look up the record by its apiUid
                let record = null;
                for (const rec of window.dwm.meterRegistry.values()) {
                    if (rec.apiUid === deviceUid) { record = rec; break; }
                }

                if (record &&
                    record.connectionState === 'connected' &&
                    record.state?.lastSnapshotRaw) {

                    const snap = record.state.lastSnapshotRaw;
                    const avgW = parseFloat(snap.avg);

                    if (Number.isFinite(avgW) && typeof window.dwm.scalePower === 'function') {
                        const { scaled, unit } = window.dwm.scalePower(avgW);
                        fwdText = `${scaled.toFixed(2)} ${unit}`;
                    }
                    // DWM meters only measure one direction per element; rfl stays '--'
                }
            }

            // Patch text nodes directly — no full re-render
            const nodeG  = nodesLayer.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
            if (!nodeG) continue;
            const fwdEl  = nodeG.querySelector('.sv-meter-fwd');
            const rflEl  = nodeG.querySelector('.sv-meter-rfl');
            if (fwdEl) fwdEl.textContent = fwdText;
            if (rflEl) rflEl.textContent = rflText;
        }
    };

    // ─── Persistence ──────────────────────────────────────────────────────────

    DWMControl.prototype._svSaveSchematic = function () {
        const data = {
            version:     1,
            nodes:       [...this.sv.nodes.values()],
            connections: [...this.sv.connections.values()],
            viewport:    { ...this.sv.viewport },
        };
        try {
            localStorage.setItem('dwm-siteview-schematic', JSON.stringify(data));
            this._svSetSaveStatus('saved');
        } catch (e) {
            console.warn('Site view save failed:', e);
        }
    };

    DWMControl.prototype._svMarkDirty = function () {
        this.sv.isDirty = true;
        this._svSetSaveStatus('saving');
        if (this.sv.saveTimer) clearTimeout(this.sv.saveTimer);
        this.sv.saveTimer = setTimeout(() => {
            this._svSaveSchematic();
            this.sv.isDirty = false;
        }, 1000);
    };

    DWMControl.prototype._svLoadSchematic = function () {
        try {
            const raw = localStorage.getItem('dwm-siteview-schematic');
            if (!raw) return;

            const data = JSON.parse(raw);
            if (!data || data.version !== 1) return;

            if (Array.isArray(data.nodes)) {
                for (const node of data.nodes) {
                    if (node?.id && node.type) this.sv.nodes.set(node.id, node);
                }
            }

            if (Array.isArray(data.connections)) {
                for (const conn of data.connections) {
                    if (conn?.id) this.sv.connections.set(conn.id, conn);
                }
            }

            if (data.viewport && typeof data.viewport.scale === 'number') {
                this.sv.viewport = {
                    x:     data.viewport.x     ?? 0,
                    y:     data.viewport.y     ?? 0,
                    scale: Math.min(4, Math.max(0.2, data.viewport.scale)),
                };
            }
        } catch (e) {
            console.warn('Site view load failed:', e);
        }
    };

    // ─── Save status indicator ────────────────────────────────────────────────

    DWMControl.prototype._svSetSaveStatus = function (status) {
        const el = document.getElementById('sv-save-status');
        if (!el) return;
        el.className = 'sv-save-status';

        if (status === 'saving') {
            el.textContent = 'Saving...';
            el.classList.add('sv-saving');
        } else if (status === 'saved') {
            el.textContent = 'Saved ✓';
            el.classList.add('sv-saved');
            if (this._svSaveStatusTimer) clearTimeout(this._svSaveStatusTimer);
            this._svSaveStatusTimer = setTimeout(() => {
                const el2 = document.getElementById('sv-save-status');
                if (el2) { el2.textContent = 'Ready'; el2.className = 'sv-save-status'; }
            }, 2000);
        } else {
            el.textContent = 'Ready';
        }
    };

    // ─── Destroy (clean up timers) ────────────────────────────────────────────

    DWMControl.prototype._svDestroy = function () {
        if (this.sv?.powerTimer) clearInterval(this.sv.powerTimer);
        if (this.sv?.saveTimer)  clearTimeout(this.sv.saveTimer);
    };

    // ─── Bezier connection path ───────────────────────────────────────────────

    DWMControl.prototype._svConnectionPath = function (fromNode, fromPortId, toNode, toPortId) {
        const fp = window.SiteViewComponents.getPortAbsolutePos(fromNode, fromPortId);
        const tp = window.SiteViewComponents.getPortAbsolutePos(toNode,   toPortId);
        if (!fp || !tp) return null;

        const dx = Math.max(60, Math.abs(tp.x - fp.x) * 0.5);
        let fcx = fp.x, fcy = fp.y;
        let tcx = tp.x, tcy = tp.y;

        if      (fp.side === 'right')  fcx = fp.x + dx;
        else if (fp.side === 'left')   fcx = fp.x - dx;
        else if (fp.side === 'bottom') fcy = fp.y + dx;
        else if (fp.side === 'top')    fcy = fp.y - dx;

        if      (tp.side === 'left')   tcx = tp.x - dx;
        else if (tp.side === 'right')  tcx = tp.x + dx;
        else if (tp.side === 'top')    tcy = tp.y - dx;
        else if (tp.side === 'bottom') tcy = tp.y + dx;

        return `M ${fp.x} ${fp.y} C ${fcx} ${fcy} ${tcx} ${tcy} ${tp.x} ${tp.y}`;
    };

    // ─── Module-private helpers ───────────────────────────────────────────────

    function _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _defaultProps(typeId) {
        if (typeId === 'attenuator') return { attenuationDb: 3 };
        if (typeId === 'dwm-meter')  return { deviceUid: null, deviceName: null, measureType: 'forward' };
        return {};
    }

})();
