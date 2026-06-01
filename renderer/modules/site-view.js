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
            settings:       { snapEnabled: true, snapSize: 20, gridVisible: true },
            selectedNodeId: null,
            selectedConnId: null,
            connectingFrom: null,        // { nodeId, portId, portType } while drawing a wire
            panStart:       null,        // { clientX, clientY, vpX, vpY } while panning
            dragNodeId:     null,        // id of node currently being dragged
            dragOffset:     { x: 0, y: 0 },
            dragOrigX:      null,        // position before drag started (for revert)
            dragOrigY:      null,
            dragOverlapId:  null,        // id of node being overlapped during drag
            saveTimer:      null,
            powerTimer:     null,
            isDirty:        false,
            undoStack:      [],
            redoStack:      [],
            isLocked:       false,
        };
        this._svLoadSettings();
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
    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="${document.documentElement.getAttribute('data-theme') === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)'}" stroke-width="0.5"/>
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
        gridBg.setAttribute('visibility', this.sv.settings?.gridVisible !== false ? 'visible' : 'hidden');

        // World transform
        const worldEl = document.getElementById('sv-world');
        if (worldEl) {
            worldEl.setAttribute('transform', `translate(${vp.x},${vp.y}) scale(${vp.scale})`);
        }

        this._svRenderConnections();
        this._svRenderNodes();
        this._svUpdateSelectionVisuals();
        this._svUpdateOverlapVisuals();
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
            const gainCtx = this._svGetNodeGainCtx(node.id);
            html += window.SiteViewComponents.renderNodeSVG(node, gainCtx);
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

    // ─── Undo / Redo ──────────────────────────────────────────────────────────

    DWMControl.prototype._svSnapshot = function () {
        return {
            nodes:       JSON.parse(JSON.stringify([...this.sv.nodes.entries()])),
            connections: JSON.parse(JSON.stringify([...this.sv.connections.entries()])),
        };
    };

    DWMControl.prototype._svPushUndo = function () {
        this.sv.undoStack.push(this._svSnapshot());
        if (this.sv.undoStack.length > 50) this.sv.undoStack.shift();
        this.sv.redoStack = [];
        this._svUpdateUndoRedoBtns();
    };

    DWMControl.prototype._svUndo = function () {
        if (!this.sv.undoStack.length) return;
        this.sv.redoStack.push(this._svSnapshot());
        const state = this.sv.undoStack.pop();
        this.sv.nodes       = new Map(state.nodes);
        this.sv.connections = new Map(state.connections);
        this.sv.selectedNodeId = null;
        this.sv.selectedConnId = null;
        this._svRender();
        this._svRenderProperties();
        this._svMarkDirty();
        this._svUpdateUndoRedoBtns();
    };

    DWMControl.prototype._svRedo = function () {
        if (!this.sv.redoStack.length) return;
        this.sv.undoStack.push(this._svSnapshot());
        const state = this.sv.redoStack.pop();
        this.sv.nodes       = new Map(state.nodes);
        this.sv.connections = new Map(state.connections);
        this.sv.selectedNodeId = null;
        this.sv.selectedConnId = null;
        this._svRender();
        this._svRenderProperties();
        this._svMarkDirty();
        this._svUpdateUndoRedoBtns();
    };

    DWMControl.prototype._svUpdateUndoRedoBtns = function () {
        const undoBtn = document.getElementById('sv-undo-btn');
        const redoBtn = document.getElementById('sv-redo-btn');
        if (undoBtn) undoBtn.disabled = this.sv.undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = this.sv.redoStack.length === 0;
    };

    // ─── Lock ─────────────────────────────────────────────────────────────────

    DWMControl.prototype._svSetLocked = function (locked) {
        this.sv.isLocked = locked;
        const lockBtn    = document.getElementById('sv-lock-btn');
        const deleteBtn  = document.getElementById('sv-delete-selected-btn');
        const clearBtn   = document.getElementById('sv-clear-btn');
        const saveBtn    = document.getElementById('sv-save-file-btn');
        const svgEl      = document.getElementById('sv-canvas-svg');
        if (lockBtn)   lockBtn.textContent = locked ? 'Unlock' : 'Lock';
        if (deleteBtn) deleteBtn.disabled  = locked;
        if (clearBtn)  clearBtn.disabled   = locked;
        if (saveBtn)   saveBtn.disabled    = locked;
        if (svgEl)     svgEl.classList.toggle('sv-canvas-locked', locked);
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
            if (this.sv.isLocked) return;
            const type = e.dataTransfer.getData('text/plain');
            const { COMPONENT_TYPES, createNode } = window.SiteViewComponents;
            if (!type || !COMPONENT_TYPES[type]) return;

            const comp = COMPONENT_TYPES[type];
            const rect = svg.getBoundingClientRect();
            const vp   = this.sv.viewport;
            const wx   = (e.clientX - rect.left - vp.x) / vp.scale;
            const wy   = (e.clientY - rect.top  - vp.y) / vp.scale;

            // Snap center of component to grid
            const snapSize = this.sv.settings.snapEnabled ? this.sv.settings.snapSize : 1;
            const snappedX = Math.round((wx - comp.width  / 2) / snapSize) * snapSize;
            const snappedY = Math.round((wy - comp.height / 2) / snapSize) * snapSize;

            // Reject drop if it would overlap an existing node
            const tempNode = { type, x: snappedX, y: snappedY };
            for (const other of this.sv.nodes.values()) {
                if (this._svNodesOverlap(tempNode, other)) return;
            }

            this._svPushUndo();
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

        // ── Scroll to pan; Ctrl+scroll to zoom ────────────────────────────────
        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) {
                // Zoom toward mouse cursor
                const rect      = svg.getBoundingClientRect();
                const mouseX    = e.clientX - rect.left;
                const mouseY    = e.clientY - rect.top;
                const factor    = e.deltaY < 0 ? 1.1 : 0.9;
                const prevScale = this.sv.viewport.scale;
                const newScale  = Math.min(4, Math.max(0.2, prevScale * factor));
                this.sv.viewport.x     = mouseX - (mouseX - this.sv.viewport.x) * (newScale / prevScale);
                this.sv.viewport.y     = mouseY - (mouseY - this.sv.viewport.y) * (newScale / prevScale);
                this.sv.viewport.scale = newScale;
            } else {
                // Pan — trackpad sends deltaX+deltaY; mouse wheel sends deltaY only
                this.sv.viewport.x -= e.deltaX;
                this.sv.viewport.y -= e.deltaY;
            }
            this._svApplyViewport();
        }, { passive: false });

        // ── Delete key ───────────────────────────────────────────────────────
        document.addEventListener('keydown', (e) => {
            const panel = document.getElementById('siteview-panel');
            if (!panel || !panel.classList.contains('active')) return;
            if ((e.key === 'Delete' || e.key === 'Backspace') &&
                !e.target.matches('input, textarea, select')) {
                if (!this.sv.isLocked) this._svDeleteSelected();
            }
            if (e.ctrlKey && !e.shiftKey && e.key === 'z' &&
                !e.target.matches('input, textarea, select')) {
                e.preventDefault();
                this._svUndo();
            }
            if ((e.ctrlKey && e.key === 'y') ||
                (e.ctrlKey && e.shiftKey && e.key === 'z')) {
                if (!e.target.matches('input, textarea, select')) {
                    e.preventDefault();
                    this._svRedo();
                }
            }
        });

        // ── Toolbar buttons ───────────────────────────────────────────────────
        const clearBtn    = document.getElementById('sv-clear-btn');
        const fitBtn      = document.getElementById('sv-fit-btn');
        const zoomInBtn   = document.getElementById('sv-zoom-in-btn');
        const zoomOutBtn  = document.getElementById('sv-zoom-out-btn');
        const deleteBtn   = document.getElementById('sv-delete-selected-btn');
        const saveFileBtn = document.getElementById('sv-save-file-btn');
        const loadFileBtn = document.getElementById('sv-load-file-btn');
        const undoBtn     = document.getElementById('sv-undo-btn');
        const redoBtn     = document.getElementById('sv-redo-btn');
        const lockBtn     = document.getElementById('sv-lock-btn');
        if (clearBtn)    clearBtn.addEventListener('click',    () => this._svClear());
        if (fitBtn)      fitBtn.addEventListener('click',      () => this._svFitView());
        if (deleteBtn)   deleteBtn.addEventListener('click',   () => this._svDeleteSelected());
        if (saveFileBtn) saveFileBtn.addEventListener('click', () => this._svSaveToFile());
        if (loadFileBtn) loadFileBtn.addEventListener('click', () => this._svLoadFromFile());
        if (undoBtn)     undoBtn.addEventListener('click',     () => this._svUndo());
        if (redoBtn)     redoBtn.addEventListener('click',     () => this._svRedo());
        if (lockBtn)     lockBtn.addEventListener('click',     () => this._svSetLocked(!this.sv.isLocked));
        this._svUpdateUndoRedoBtns();

        const _svDoZoom = (factor) => {
            const container = document.getElementById('sv-canvas-container');
            const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0, width: 800, height: 600 };
            const cx = rect.width  / 2;
            const cy = rect.height / 2;
            const prev = this.sv.viewport.scale;
            const next = Math.min(4, Math.max(0.2, prev * factor));
            this.sv.viewport.x     = cx - (cx - this.sv.viewport.x) * (next / prev);
            this.sv.viewport.y     = cy - (cy - this.sv.viewport.y) * (next / prev);
            this.sv.viewport.scale = next;
            this._svApplyViewport();
        };
        if (zoomInBtn)  zoomInBtn.addEventListener('click',  () => _svDoZoom(1.2));
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => _svDoZoom(1 / 1.2));

        const settingsBtn = document.getElementById('sv-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                // Deselect everything — workspace settings appear in the properties pane
                this.sv.selectedNodeId = null;
                this.sv.selectedConnId = null;
                this._svUpdateSelectionVisuals();
                this._svRenderProperties();
            });
        }
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
        if (this.sv.isLocked) return;
        const node = this.sv.nodes.get(nodeId);
        if (!node) return;

        const svg  = document.getElementById('sv-canvas-svg');
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const vp   = this.sv.viewport;
        const wx   = (e.clientX - rect.left - vp.x) / vp.scale;
        const wy   = (e.clientY - rect.top  - vp.y) / vp.scale;

        this._svPushUndo();
        this.sv.dragNodeId = nodeId;
        this.sv.dragOffset = { x: wx - node.x, y: wy - node.y };
        this.sv.dragOrigX  = node.x;
        this.sv.dragOrigY  = node.y;
        this.sv.dragOverlapId = null;
        this._svSelectNode(nodeId);
    };

    // ─── Connection drawing ───────────────────────────────────────────────────

    DWMControl.prototype._svStartConnecting = function (nodeId, portId, portType, e) {
        if (this.sv.isLocked) return;
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
            const snapSize = this.sv.settings.snapEnabled ? this.sv.settings.snapSize : 1;
            node.x = Math.round((wx - this.sv.dragOffset.x) / snapSize) * snapSize;
            node.y = Math.round((wy - this.sv.dragOffset.y) / snapSize) * snapSize;

            // Check for overlap with any other node
            let overlapId = null;
            for (const other of this.sv.nodes.values()) {
                if (other.id === node.id) continue;
                if (this._svNodesOverlap(node, other)) { overlapId = other.id; break; }
            }
            this.sv.dragOverlapId = overlapId;

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
            const node = this.sv.nodes.get(this.sv.dragNodeId);
            if (node && this.sv.dragOverlapId !== null) {
                // Revert to original position
                node.x = this.sv.dragOrigX;
                node.y = this.sv.dragOrigY;
            }
            this.sv.dragNodeId    = null;
            this.sv.dragOverlapId = null;
            this.sv.dragOrigX     = null;
            this.sv.dragOrigY     = null;
            this._svRender();
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

            // Replace any existing connection on the same port — one connection per port
            for (const [existingId, existing] of this.sv.connections) {
                if ((existing.fromNodeId === fnId && existing.fromPortId === fpId) ||
                    (existing.toNodeId   === tnId && existing.toPortId   === tpId)) {
                    this.sv.connections.delete(existingId);
                }
            }

            const connId = 'conn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
            this._svPushUndo();
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
        if (this.sv.isLocked) return;
        if (!window.confirm('Clear all nodes and connections? This cannot be undone.')) return;
        this._svPushUndo();
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
        if (this.sv.isLocked) return;
        if (this.sv.selectedNodeId) {
            this._svPushUndo();
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
            this._svPushUndo();
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
<div class="sv-props-title">${_esc(window.SiteViewComponents?.COMPONENT_TYPES?.[node.type]?.label || node.type)}</div>

<div class="sv-props-field">
    <label class="sv-props-label">Label</label>
    <input class="sv-props-input" type="text" id="sv-prop-label"
           value="${_esc(node.label)}" placeholder="Label">
</div>
<div class="sv-props-field sv-props-field--action">
    <button class="sv-props-flip-btn" id="sv-prop-flip-btn">&#8644; Flip</button>
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
</div>
<div class="sv-props-field">
    <label class="sv-props-label">Power Type</label>
    <select class="sv-props-select" id="sv-prop-power-type">
        <option value="avg"${(node.props.powerType || 'avg') === 'avg' ? ' selected' : ''}>AVG — Average Power</option>
        <option value="peak"${node.props.powerType === 'peak' ? ' selected' : ''}>PEP — Peak Envelope</option>
        <option value="inst"${node.props.powerType === 'inst' ? ' selected' : ''}>INST — Instantaneous</option>
        <option value="max"${node.props.powerType === 'max' ? ' selected' : ''}>MAX — Running Maximum</option>
        <option value="min"${node.props.powerType === 'min' ? ' selected' : ''}>MIN — Running Minimum</option>
        <option value="dev"${node.props.powerType === 'dev' ? ' selected' : ''}>DEV — Deviation</option>
    </select>
</div>
<div class="sv-props-field sv-props-field--action">
    <button class="sv-props-identify-btn" id="sv-prop-identify-btn"${!node.props.deviceUid ? ' disabled' : ''}>Identify</button>
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

            // ── 4-Port Switch ─────────────────────────────────────────────────
            if (node.type === '4port-switch') {
                html += `
<div class="sv-props-field">
    <label class="sv-props-label">Switch Mode</label>
    <select class="sv-props-select" id="sv-prop-sw-mode">
        <option value="through"${(node.props.mode || 'through') === 'through' ? ' selected' : ''}>Straight Through</option>
        <option value="cross"${node.props.mode === 'cross' ? ' selected' : ''}>Cross</option>
    </select>
</div>`;
            }

            // ── Filter ────────────────────────────────────────────────────────
            if (node.type === 'filter') {
                html += `
<div class="sv-props-field">
    <label class="sv-props-label">Filter Type</label>
    <select class="sv-props-select" id="sv-prop-filter-type">
        <option value="lowpass"${(node.props.filterType || 'lowpass') === 'lowpass'   ? ' selected' : ''}>Low Pass</option>
        <option value="highpass"${node.props.filterType === 'highpass'                ? ' selected' : ''}>High Pass</option>
        <option value="bandpass"${node.props.filterType === 'bandpass'               ? ' selected' : ''}>Band Pass</option>
        <option value="notch"${node.props.filterType === 'notch'                     ? ' selected' : ''}>Notch</option>
    </select>
</div>
<div class="sv-props-field">
    <label class="sv-props-label">Frequency (MHz)</label>
    <input class="sv-props-input" type="number" id="sv-prop-filter-freq"
           value="${_esc(String(node.props.freqMHz ?? ''))}" placeholder="e.g. 98.1" min="0" step="0.001">
</div>
<div class="sv-props-field">
    <label class="sv-props-label">Bandwidth (MHz)</label>
    <input class="sv-props-input" type="number" id="sv-prop-filter-bw"
           value="${_esc(String(node.props.bandwidthMHz ?? ''))}" placeholder="e.g. 0.2" min="0" step="0.001">
</div>`;
            }

            // ── Antenna ───────────────────────────────────────────────────────
            if (node.type === 'antenna') {
                html += `
<div class="sv-props-field">
    <label class="sv-props-label">Frequency (MHz)</label>
    <input class="sv-props-input" type="number" id="sv-prop-antenna-freq"
           value="${_esc(String(node.props.freqMHz ?? ''))}" placeholder="e.g. 98.1" min="0" step="0.001">
</div>`;
            }

            // ── Amplifier ─────────────────────────────────────────────────────
            if (node.type === 'amplifier') {
                html += `
<div class="sv-props-field">
    <label class="sv-props-label">Gain (dB)</label>
    <input class="sv-props-input" type="number" id="sv-prop-gain-db"
           value="${_esc(String(node.props.gainDb ?? ''))}" placeholder="e.g. 20" step="0.5">
</div>`;
            }

            // ── Transmitter ───────────────────────────────────────────────────
            if (node.type === 'transmitter') {
                html += `
<div class="sv-props-field">
    <label class="sv-props-label">Power (W)</label>
    <input class="sv-props-input" type="number" id="sv-prop-tx-power"
           value="${_esc(String(node.props.powerW ?? ''))}" placeholder="e.g. 1000" min="0" step="1">
</div>
<div class="sv-props-field">
    <label class="sv-props-label">Frequency (MHz)</label>
    <input class="sv-props-input" type="number" id="sv-prop-tx-freq"
           value="${_esc(String(node.props.freqMHz ?? ''))}" placeholder="e.g. 98.1" min="0" step="0.001">
</div>`;
            }

            // ── Return Loss / SWR ─────────────────────────────────────────────
            if (node.type === 'return-loss') {
                const rlMeters = [];
                if (window.dwm?.meterRegistry) {
                    for (const [, record] of window.dwm.meterRegistry.entries()) {
                        const uid  = record.apiUid || record.key;
                        const name = record.friendlyName || record.portPath || record.key;
                        rlMeters.push({ uid, name });
                    }
                }
                const fwdOptions = '<option value="">-- None --</option>' +
                    rlMeters.map(m => `<option value="${_esc(m.uid)}"${node.props.fwdDeviceUid === m.uid ? ' selected' : ''}>${_esc(m.name)}</option>`).join('');
                const rflOptions = '<option value="">-- None --</option>' +
                    rlMeters.map(m => `<option value="${_esc(m.uid)}"${node.props.rflDeviceUid === m.uid ? ' selected' : ''}>${_esc(m.name)}</option>`).join('');
                html += `
<div class="sv-props-field">
    <label class="sv-props-label">Forward Power Meter</label>
    <select class="sv-props-select" id="sv-prop-rl-fwd">${fwdOptions}</select>
</div>
<div class="sv-props-field">
    <label class="sv-props-label">Reflected Power Meter</label>
    <select class="sv-props-select" id="sv-prop-rl-rfl">${rflOptions}</select>
</div>
<div class="sv-props-field">
    <label class="sv-props-label">Display Mode</label>
    <select class="sv-props-select" id="sv-prop-rl-mode">
        <option value="rl"${(node.props.displayMode || 'rl') === 'rl' ? ' selected' : ''}>Return Loss (dB)</option>
        <option value="swr"${node.props.displayMode === 'swr' ? ' selected' : ''}>SWR</option>
    </select>
</div>`;
            }

            // ── Gain Readout Power (all GAIN_TYPE components) ─────────────────
            const _GAIN_TYPES_ARR = ['attenuator', 'amplifier', 'filter'];
            if (_GAIN_TYPES_ARR.includes(node.type)) {
                html += `
<div class="sv-props-field">
    <label class="sv-props-label">Gain Readout Power</label>
    <select class="sv-props-select" id="sv-prop-gain-power-type">
        <option value="avg"${(node.props.gainPowerType || 'avg') === 'avg' ? ' selected' : ''}>AVG — Average Power</option>
        <option value="peak"${node.props.gainPowerType === 'peak' ? ' selected' : ''}>PEP — Peak Envelope</option>
        <option value="inst"${node.props.gainPowerType === 'inst' ? ' selected' : ''}>INST — Instantaneous</option>
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

            // Wire up flip button
            const flipBtn = document.getElementById('sv-prop-flip-btn');
            if (flipBtn) {
                flipBtn.addEventListener('click', () => {
                    node.flipped = !node.flipped;
                    this._svRender();
                    this._svMarkDirty();
                });
            }

            // Wire up DWM meter selectors
            if (node.type === 'dwm-meter') {
                const deviceSel  = document.getElementById('sv-prop-device');
                const measureSel = document.getElementById('sv-prop-measure');

                if (deviceSel) {
                    deviceSel.addEventListener('change', () => {
                        this._svPushUndo();
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
                        this._svPushUndo();
                        node.props.measureType = measureSel.value;
                        this._svRender();
                        this._svMarkDirty();
                    });
                }

                const ptSel = document.getElementById('sv-prop-power-type');
                if (ptSel) {
                    ptSel.addEventListener('change', () => {
                        this._svPushUndo();
                        node.props.powerType = ptSel.value;
                        this._svRender();
                        this._svMarkDirty();
                    });
                }

                const identifyBtn = document.getElementById('sv-prop-identify-btn');
                if (identifyBtn) {
                    identifyBtn.addEventListener('click', () => {
                        const uid = node.props.deviceUid;
                        if (uid && typeof this.identifyMeter === 'function' && window.dwm?.meterRegistry) {
                            let mapKey = null;
                            for (const [key, rec] of window.dwm.meterRegistry.entries()) {
                                if ((rec.apiUid || rec.key) === uid || key === uid) {
                                    mapKey = key;
                                    break;
                                }
                            }
                            if (mapKey !== null) this.identifyMeter(mapKey);
                        }
                    });
                }

            }
            if (node.type === 'attenuator') {
                const attInput = document.getElementById('sv-prop-att-db');
                if (attInput) {
                    attInput.addEventListener('change', () => {
                        this._svPushUndo();
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
                        this._svPushUndo();
                        node.props.activePort = parseInt(portSel.value, 10);
                        this._svMarkDirty();
                    });
                }
            }

            // Wire up 4-port switch mode
            if (node.type === '4port-switch') {
                const modeSel = document.getElementById('sv-prop-sw-mode');
                if (modeSel) {
                    modeSel.addEventListener('change', () => {
                        this._svPushUndo();
                        node.props.mode = modeSel.value;
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
            }

            // Wire up filter type + freq + bandwidth
            if (node.type === 'filter') {
                const ftSel  = document.getElementById('sv-prop-filter-type');
                const fFreq  = document.getElementById('sv-prop-filter-freq');
                const fBw    = document.getElementById('sv-prop-filter-bw');
                if (ftSel) {
                    ftSel.addEventListener('change', () => {
                        this._svPushUndo();
                        node.props.filterType = ftSel.value;
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
                if (fFreq) {
                    fFreq.addEventListener('change', () => {
                        this._svPushUndo();
                        const v = fFreq.value.trim();
                        node.props.freqMHz = v === '' ? null : parseFloat(v);
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
                if (fBw) {
                    fBw.addEventListener('change', () => {
                        this._svPushUndo();
                        const v = fBw.value.trim();
                        node.props.bandwidthMHz = v === '' ? null : parseFloat(v);
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
            }

            // Wire up antenna frequency
            if (node.type === 'antenna') {
                const aFreq = document.getElementById('sv-prop-antenna-freq');
                if (aFreq) {
                    aFreq.addEventListener('change', () => {
                        this._svPushUndo();
                        const v = aFreq.value.trim();
                        node.props.freqMHz = v === '' ? null : parseFloat(v);
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
            }

            // Wire up amplifier gain
            if (node.type === 'amplifier') {
                const gainInput = document.getElementById('sv-prop-gain-db');
                if (gainInput) {
                    gainInput.addEventListener('change', () => {
                        this._svPushUndo();
                        const v = gainInput.value.trim();
                        node.props.gainDb = v === '' ? null : parseFloat(v);
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
            }

            // Wire up transmitter power and frequency
            if (node.type === 'transmitter') {
                const txPwr  = document.getElementById('sv-prop-tx-power');
                const txFreq = document.getElementById('sv-prop-tx-freq');
                if (txPwr) {
                    txPwr.addEventListener('change', () => {
                        this._svPushUndo();
                        const v = txPwr.value.trim();
                        node.props.powerW = v === '' ? null : parseFloat(v);
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
                if (txFreq) {
                    txFreq.addEventListener('change', () => {
                        this._svPushUndo();
                        const v = txFreq.value.trim();
                        node.props.freqMHz = v === '' ? null : parseFloat(v);
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
            }

            // Wire up gain readout power type (all GAIN_TYPE components)
            const gainPtSel = document.getElementById('sv-prop-gain-power-type');
            if (gainPtSel) {
                gainPtSel.addEventListener('change', () => {
                    this._svPushUndo();
                    node.props.gainPowerType = gainPtSel.value;
                    this._svMarkDirty();
                });
            }

            // Wire up return-loss props
            if (node.type === 'return-loss') {
                const rlFwdSel  = document.getElementById('sv-prop-rl-fwd');
                const rlRflSel  = document.getElementById('sv-prop-rl-rfl');
                const rlModeSel = document.getElementById('sv-prop-rl-mode');
                const rlMeters  = [];
                if (window.dwm?.meterRegistry) {
                    for (const [, record] of window.dwm.meterRegistry.entries()) {
                        const uid  = record.apiUid || record.key;
                        const name = record.friendlyName || record.portPath || record.key;
                        rlMeters.push({ uid, name });
                    }
                }
                const _findRLMeter = uid => rlMeters.find(m => m.uid === uid);
                if (rlFwdSel) {
                    rlFwdSel.addEventListener('change', () => {
                        this._svPushUndo();
                        const uid = rlFwdSel.value;
                        const m   = _findRLMeter(uid);
                        node.props.fwdDeviceUid  = uid || null;
                        node.props.fwdDeviceName = m ? m.name : null;
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
                if (rlRflSel) {
                    rlRflSel.addEventListener('change', () => {
                        this._svPushUndo();
                        const uid = rlRflSel.value;
                        const m   = _findRLMeter(uid);
                        node.props.rflDeviceUid  = uid || null;
                        node.props.rflDeviceName = m ? m.name : null;
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
                if (rlModeSel) {
                    rlModeSel.addEventListener('change', () => {
                        this._svPushUndo();
                        node.props.displayMode = rlModeSel.value;
                        this._svRender();
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
            // Show workspace settings in the properties pane when nothing is selected
            const s = this.sv.settings;
            content.innerHTML = `
<div class="sv-props-section">
<div class="sv-props-title">Workspace Settings</div>

<div class="sv-props-field sv-settings-row-inline">
    <label class="sv-props-label">
        <input type="checkbox" id="sv-ws-snap-enabled"${s.snapEnabled ? ' checked' : ''}> Grid Snap
    </label>
</div>
<div class="sv-props-field">
    <label class="sv-props-label">Snap Size</label>
    <select class="sv-props-select" id="sv-ws-snap-size">
        <option value="10"${s.snapSize === 10 ? ' selected' : ''}>10 px</option>
        <option value="20"${s.snapSize === 20 ? ' selected' : ''}>20 px</option>
        <option value="40"${s.snapSize === 40 ? ' selected' : ''}>40 px</option>
    </select>
</div>
<div class="sv-props-field sv-settings-row-inline">
    <label class="sv-props-label">
        <input type="checkbox" id="sv-ws-grid-visible"${s.gridVisible ? ' checked' : ''}> Show Grid
    </label>
</div>
</div>

<div class="sv-props-section">
<div class="sv-props-title">Bulk Meter Settings</div>
<div class="sv-props-field">
    <label class="sv-props-label">All Meter Power Type</label>
    <select class="sv-props-select" id="sv-ws-bulk-power-type">
        <option value="avg">AVG — Average Power</option>
        <option value="peak">PEP — Peak Envelope</option>
        <option value="inst">INST — Instantaneous</option>
        <option value="max">MAX — Running Maximum</option>
        <option value="min">MIN — Running Minimum</option>
        <option value="dev">DEV — Deviation</option>
    </select>
</div>
</div>

<div class="sv-props-section">
<div class="sv-props-title">Gain/Loss Display</div>
<div class="sv-props-field">
    <label class="sv-props-label">All Gain Components Use</label>
    <select class="sv-props-select" id="sv-ws-bulk-gain-type">
        <option value="avg">AVG — Average Power</option>
        <option value="peak">PEP — Peak Envelope</option>
        <option value="inst">INST — Instantaneous</option>
    </select>
</div>
</div>`;

            // Wire workspace settings
            const snapEnabledEl = document.getElementById('sv-ws-snap-enabled');
            const snapSizeEl    = document.getElementById('sv-ws-snap-size');
            const gridVisEl     = document.getElementById('sv-ws-grid-visible');

            const applyWsSettings = () => {
                if (snapEnabledEl) this.sv.settings.snapEnabled = snapEnabledEl.checked;
                if (snapSizeEl)   this.sv.settings.snapSize    = parseInt(snapSizeEl.value, 10) || 20;
                if (gridVisEl)    this.sv.settings.gridVisible  = gridVisEl.checked;
                this._svRender();
                this._svSaveSettings();
            };

            [snapEnabledEl, snapSizeEl, gridVisEl].forEach(el => {
                if (el) el.addEventListener('change', applyWsSettings);
            });

            // Bulk meter power type — auto-apply on change
            const bulkPtSel = document.getElementById('sv-ws-bulk-power-type');
            if (bulkPtSel) {
                bulkPtSel.addEventListener('change', () => {
                    const pt = bulkPtSel.value;
                    let changed = false;
                    for (const n of this.sv.nodes.values()) {
                        if (n.type === 'dwm-meter') { n.props.powerType = pt; changed = true; }
                    }
                    if (changed) { this._svRender(); this._svMarkDirty(); }
                });
            }

            // Bulk gain/loss power type — auto-apply on change
            const bulkGainSel = document.getElementById('sv-ws-bulk-gain-type');
            if (bulkGainSel) {
                bulkGainSel.addEventListener('change', () => {
                    const pt = bulkGainSel.value;
                    const GAIN_TYPES_SET = new Set(['attenuator', 'amplifier', 'filter']);
                    let changed = false;
                    for (const n of this.sv.nodes.values()) {
                        if (GAIN_TYPES_SET.has(n.type)) { n.props.gainPowerType = pt; changed = true; }
                    }
                    if (changed) this._svMarkDirty();
                });
            }
        }
    };

    // ─── Live power readouts ──────────────────────────────────────────────────

    // BFS through chains of meters (meters are transparent — they don't affect signal).
    // Returns the closest meter of each type on each side of nodeId.
    DWMControl.prototype._svFindFlankingMeters = function (nodeId) {
        const findMeters = (startId, side) => {
            const result = { forward: null, reverse: null };
            const visited = new Set();
            const queue   = [startId];
            while (queue.length > 0) {
                const curId = queue.shift();
                if (visited.has(curId)) continue;
                visited.add(curId);
                for (const conn of this.sv.connections.values()) {
                    const neighborId = side === 'input'
                        ? (conn.toNodeId   === curId ? conn.fromNodeId : null)
                        : (conn.fromNodeId === curId ? conn.toNodeId   : null);
                    if (!neighborId || visited.has(neighborId)) continue;
                    const neighbor = this.sv.nodes.get(neighborId);
                    if (!neighbor) continue;
                    if (neighbor.type === 'dwm-meter') {
                        const mt = neighbor.props?.measureType === 'reverse' ? 'reverse' : 'forward';
                        if (!result[mt]) result[mt] = neighbor; // keep closest
                        queue.push(neighborId); // continue through the meter
                    }
                    // non-meter nodes are opaque — do not traverse further
                }
            }
            return result;
        };
        return {
            input:  findMeters(nodeId, 'input'),
            output: findMeters(nodeId, 'output'),
        };
    };

    DWMControl.prototype._svGetNodeGainCtx = function (nodeId) {
        const GAIN_TYPES = ['attenuator', 'amplifier', 'filter'];
        const node = this.sv.nodes.get(nodeId);
        if (!node || !GAIN_TYPES.includes(node.type)) return { hasFwd: false, hasRfl: false };

        const { input, output } = this._svFindFlankingMeters(nodeId);
        return {
            hasFwd: !!(input.forward && output.forward),
            hasRfl: !!(input.reverse && output.reverse),
        };
    };

    DWMControl.prototype._svStartPowerUpdates = function () {
        if (this.sv.powerTimer) clearInterval(this.sv.powerTimer);
        this.sv.powerTimer = setInterval(() => this._svUpdatePowerReadouts(), 80);
    };

    DWMControl.prototype._svUpdatePowerReadouts = function () {
        const nodesLayer = document.getElementById('sv-nodes-layer');
        if (!nodesLayer) return;

        for (const node of this.sv.nodes.values()) {
            if (node.type !== 'dwm-meter') continue;

            let powerText = '-- --';
            let powerW    = null;

            const deviceUid = node.props.deviceUid;
            if (deviceUid && window.dwm?.meterRegistry) {
                let record = null;
                for (const rec of window.dwm.meterRegistry.values()) {
                    if (rec.apiUid === deviceUid) { record = rec; break; }
                }

                if (record &&
                    record.connectionState === 'connected' &&
                    record.state?.lastSnapshotRaw) {

                    const snap      = record.state.lastSnapshotRaw;
                    const powerType = node.props.powerType || 'avg';
                    const rawVal    = snap[powerType] ?? snap.avg;
                    const w         = parseFloat(rawVal);

                    if (Number.isFinite(w) && typeof window.dwm.scalePower === 'function') {
                        powerW = w >= 0 ? w : 0;
                        const { scaled, unit } = window.dwm.scalePower(w);
                        powerText = `${scaled.toFixed(2)} ${unit}`;
                    }
                }
            }

            const nodeG = nodesLayer.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
            if (!nodeG) continue;

            const fwdEl = nodeG.querySelector('.sv-meter-fwd');
            if (fwdEl) fwdEl.textContent = powerText;
        }

        // ── Return Loss / SWR nodes ────────────────────────────────────────────
        const getRLPowerW = (deviceUid) => {
            if (!deviceUid || !window.dwm?.meterRegistry) return null;
            for (const rec of window.dwm.meterRegistry.values()) {
                if ((rec.apiUid || rec.key) === deviceUid) {
                    if (rec.connectionState !== 'connected' || !rec.state?.lastSnapshotRaw) return null;
                    const w = parseFloat(rec.state.lastSnapshotRaw.avg);
                    return Number.isFinite(w) && w > 0 ? w : null;
                }
            }
            return null;
        };

        for (const node of this.sv.nodes.values()) {
            if (node.type !== 'return-loss') continue;
            const nodeG = nodesLayer.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
            if (!nodeG) continue;
            const rlEl = nodeG.querySelector('.sv-rl-value');
            if (!rlEl) continue;

            const pfwd = getRLPowerW(node.props?.fwdDeviceUid);
            const prfl = getRLPowerW(node.props?.rflDeviceUid);
            const mode = node.props?.displayMode || 'rl';

            if (pfwd !== null && prfl !== null) {
                const ratio = Math.min(prfl / pfwd, 0.9999);
                if (mode === 'swr') {
                    const gamma = Math.sqrt(ratio);
                    const swr   = (1 + gamma) / (1 - gamma);
                    rlEl.textContent = swr.toFixed(2) + ' : 1';
                } else {
                    const rl = -10 * Math.log10(ratio);
                    rlEl.textContent = rl.toFixed(1) + ' dB';
                }
            } else {
                rlEl.textContent = '-- --';
            }
        }

        // ── Per-component gain/loss computation ────────────────────────────────
        const GAIN_TYPES = ['attenuator', 'amplifier', 'filter'];

        const getPowerW = (meterNode, powerType) => {
            if (!meterNode?.props?.deviceUid) return null;
            if (!window.dwm?.meterRegistry) return null;
            let record = null;
            for (const rec of window.dwm.meterRegistry.values()) {
                if (rec.apiUid === meterNode.props.deviceUid) { record = rec; break; }
            }
            if (!record || record.connectionState !== 'connected') return null;
            if (!record.state?.lastSnapshotRaw) return null;
            const pt = powerType || meterNode.props?.powerType || 'avg';
            const w = parseFloat(record.state.lastSnapshotRaw[pt] ?? record.state.lastSnapshotRaw.avg);
            return Number.isFinite(w) && w > 0 ? w : null;
        };

        for (const node of this.sv.nodes.values()) {
            if (!GAIN_TYPES.includes(node.type)) continue;

            const gainPt = node.props.gainPowerType || 'avg';
            const { input: inputMeters, output: outputMeters } = this._svFindFlankingMeters(node.id);

            let fwdText = '';
            const fwdIn  = getPowerW(inputMeters.forward,  gainPt);
            const fwdOut = getPowerW(outputMeters.forward, gainPt);
            if (fwdIn !== null && fwdOut !== null) {
                const db = 10 * Math.log10(fwdOut / fwdIn);
                fwdText = (db >= 0 ? '+' : '') + db.toFixed(1) + ' dB FWD';
            }

            let rflText = '';
            const rflIn  = getPowerW(inputMeters.reverse,  gainPt);
            const rflOut = getPowerW(outputMeters.reverse, gainPt);
            if (rflIn !== null && rflOut !== null) {
                const db = 10 * Math.log10(rflOut / rflIn);
                rflText = (db >= 0 ? '+' : '') + db.toFixed(1) + ' dB RFL';
            }

            const nodeEl = nodesLayer.querySelector(`#sv-node-${CSS.escape(node.id)}`);
            if (nodeEl) {
                const fwdEl = nodeEl.querySelector('.sv-comp-gain-fwd');
                const rflEl = nodeEl.querySelector('.sv-comp-gain-rfl');
                if (fwdEl) fwdEl.textContent = fwdText;
                if (rflEl) rflEl.textContent = rflText;
            }
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

    // ─── Save / Load to file ──────────────────────────────────────────────────

    DWMControl.prototype._svSaveToFile = function () {
        const data = {
            version:     1,
            nodes:       [...this.sv.nodes.values()],
            connections: [...this.sv.connections.values()],
            viewport:    { ...this.sv.viewport },
        };
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = 'site-schematic.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this._svSetSaveStatus('saved');
    };

    DWMControl.prototype._svLoadFromFile = function () {
        const input = document.createElement('input');
        input.type   = 'file';
        input.accept = '.json,application/json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (!data || data.version !== 1) {
                        alert('Invalid schematic file (version mismatch).');
                        return;
                    }
                    if (!window.confirm('Load this schematic? Current workspace will be replaced.')) return;
                    this.sv.nodes.clear();
                    this.sv.connections.clear();
                    this.sv.selectedNodeId = null;
                    this.sv.selectedConnId = null;
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
                            x:     data.viewport.x ?? 0,
                            y:     data.viewport.y ?? 0,
                            scale: Math.min(4, Math.max(0.2, data.viewport.scale)),
                        };
                    }
                    this._svRender();
                    this._svRenderProperties();
                    this._svMarkDirty();
                } catch (err) {
                    alert('Failed to load schematic: ' + err.message);
                }
            };
            reader.readAsText(file);
        };
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    };

    // ─── Bezier connection path ───────────────────────────────────────────────

    DWMControl.prototype._svNodeBounds = function (node) {
        const typeDef = window.SiteViewComponents.COMPONENT_TYPES[node.type];
        if (!typeDef) return null;
        return { x: node.x, y: node.y, w: typeDef.width, h: typeDef.height };
    };

    DWMControl.prototype._svNodesOverlap = function (a, b) {
        const ba = this._svNodeBounds(a);
        const bb = this._svNodeBounds(b);
        if (!ba || !bb) return false;
        const pad = 4;
        return ba.x < bb.x + bb.w - pad &&
               ba.x + ba.w - pad > bb.x &&
               ba.y < bb.y + bb.h - pad &&
               ba.y + ba.h - pad > bb.y;
    };

    DWMControl.prototype._svUpdateOverlapVisuals = function () {
        const nodesLayer = document.getElementById('sv-nodes-layer');
        if (!nodesLayer) return;
        // Clear any previous overlap class
        nodesLayer.querySelectorAll('.sv-drag-overlap').forEach(el => {
            el.classList.remove('sv-drag-overlap');
        });
        if (this.sv.dragOverlapId) {
            const el = nodesLayer.querySelector(
                `[data-node-id="${CSS.escape(this.sv.dragOverlapId)}"]`
            );
            if (el) el.classList.add('sv-drag-overlap');
        }
    };

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
        const gpt = { gainPowerType: 'avg' };
        if (typeId === 'attenuator')   return { attenuationDb: 3, ...gpt };
        if (typeId === 'dwm-meter')    return { deviceUid: null, deviceName: null, measureType: 'forward', powerType: 'avg' };
        if (typeId === 'amplifier')    return { gainDb: null, ...gpt };
        if (typeId === 'transmitter')  return { powerW: null, freqMHz: null };
        if (typeId === 'filter')       return { filterType: 'lowpass', ...gpt, freqMHz: null, bandwidthMHz: null };
        if (typeId === '4port-switch') return { mode: 'through' };
        if (typeId === 'coax-switch')  return { activePort: 1 };
        if (['hybrid-3db', 'combiner', 'coupler'].includes(typeId)) return {};
        if (typeId === 'antenna')      return { freqMHz: null };
        if (typeId === 'return-loss')  return { fwdDeviceUid: null, fwdDeviceName: null, rflDeviceUid: null, rflDeviceName: null, displayMode: 'rl' };
        return {};
    }

    // ─── Settings ─────────────────────────────────────────────────────────────

    DWMControl.prototype._svOpenSettings = function () {
        const dialog = document.getElementById('sv-settings-dialog');
        if (!dialog) return;

        const snapEnableEl = dialog.querySelector('#sv-setting-snap-enabled');
        const snapSizeEl   = dialog.querySelector('#sv-setting-snap-size');
        const gridVisEl    = dialog.querySelector('#sv-setting-grid-visible');

        if (snapEnableEl) snapEnableEl.checked = this.sv.settings.snapEnabled;
        if (snapSizeEl)   snapSizeEl.value     = String(this.sv.settings.snapSize);
        if (gridVisEl)    gridVisEl.checked    = this.sv.settings.gridVisible;

        dialog.showModal();

        const applyBtn  = dialog.querySelector('#sv-settings-apply');
        const cancelBtn = dialog.querySelector('#sv-settings-cancel');

        const applyFn = () => {
            if (snapEnableEl) this.sv.settings.snapEnabled = snapEnableEl.checked;
            if (snapSizeEl)   this.sv.settings.snapSize    = parseInt(snapSizeEl.value, 10) || 20;
            if (gridVisEl)    this.sv.settings.gridVisible = gridVisEl.checked;
            this._svRender();
            this._svSaveSettings();
            dialog.close();
            applyBtn.removeEventListener('click', applyFn);
            cancelBtn.removeEventListener('click', cancelFn);
        };
        const cancelFn = () => {
            dialog.close();
            applyBtn.removeEventListener('click', applyFn);
            cancelBtn.removeEventListener('click', cancelFn);
        };
        applyBtn.addEventListener('click', applyFn);
        cancelBtn.addEventListener('click', cancelFn);
    };

    DWMControl.prototype._svSaveSettings = function () {
        try {
            localStorage.setItem('dwm-siteview-settings', JSON.stringify(this.sv.settings));
        } catch (_) {}
    };

    DWMControl.prototype._svLoadSettings = function () {
        try {
            const raw = localStorage.getItem('dwm-siteview-settings');
            if (raw) {
                const s = JSON.parse(raw);
                if (typeof s.snapEnabled === 'boolean')  this.sv.settings.snapEnabled = s.snapEnabled;
                if (typeof s.snapSize    === 'number')    this.sv.settings.snapSize    = s.snapSize;
                if (typeof s.gridVisible === 'boolean')   this.sv.settings.gridVisible = s.gridVisible;
            }
        } catch (_) {}
    };

})();
