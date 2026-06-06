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
            selectedNodeIds: new Set(),  // all currently selected nodes (multi-select)
            selectRect:     null,        // rubber-band state { startX, startY, currentX, currentY }
            connectingFrom: null,        // { nodeId, portId, portType } while drawing a wire
            panStart:       null,        // { clientX, clientY, vpX, vpY } while panning
            dragNodeId:     null,        // id of node currently being dragged
            dragOffset:     { x: 0, y: 0 },
            dragOffsets:    null,        // Map of id -> { offsetX, offsetY, origX, origY } for group drag
            dragOrigX:      null,        // position before drag started (for revert)
            dragOrigY:      null,
            dragOverlapId:  null,        // id of node being overlapped during drag
            saveTimer:      null,
            powerTimer:     null,
            isDirty:        false,
            currentWsId:   null,
            currentWsName: 'Untitled',
            undoStack:      [],
            redoStack:      [],
            isLocked:       false,
            logging:        false,
            logData:        [],          // kept but no longer used for storage; cleared on start
            logFilePath:    null,        // path of the currently open log file
            logColumns:     [],          // ordered list of column nodeIds for the current session
            wasLockedBeforeLogging: false,
            logsDir:        null,        // populated async from main process prefs
        };
        this._svLoadSettings();
        this._svLoadSchematic();
        this._svRenderSidebar();
        this._svRender();
        this._svSetupEvents();
        this._svStartPowerUpdates();
        this._svUpdateWsNameDisplay();
    };

    // ─── Sidebar palette ─────────────────────────────────────────────────────

    DWMControl.prototype._svRenderSidebar = function () {
        // Populate only the palette content area, preserving the header with toggle button.
        const paletteContent = document.getElementById('sv-palette-content');
        if (!paletteContent) return;

        const { getComponentCategories, COMPONENT_TYPES } = window.SiteViewComponents;
        const categories = getComponentCategories();

        let html = '';

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

        paletteContent.innerHTML = html;
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

        const { COMPONENT_TYPES } = window.SiteViewComponents;

        for (const conn of this.sv.connections.values()) {
            const fromNode = this.sv.nodes.get(conn.fromNodeId);
            const toNode   = this.sv.nodes.get(conn.toNodeId);
            if (!fromNode || !toNode) continue;

            const d = this._svConnectionPath(fromNode, conn.fromPortId, toNode, conn.toPortId);
            if (!d) continue;

            // Determine arrow visibility based on port types
            const fromPort = window.SiteViewComponents.getNodePorts(fromNode).find(p => p.id === conn.fromPortId);
            const toPort   = window.SiteViewComponents.getNodePorts(toNode).find(p => p.id === conn.toPortId);
            const fromT = fromPort?.type;
            const toT   = toPort?.type;
            // Show arrow only when signal direction is unambiguous:
            //   output → input, output → bidirectional, bidirectional → input
            const showArrow = (fromT === 'output' && (toT === 'input' || toT === 'bidirectional')) ||
                              (fromT === 'bidirectional' && toT === 'input');

            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('id', `sv-conn-${conn.id}`);
            path.setAttribute('class', 'sv-connection');
            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            if (showArrow) path.setAttribute('marker-end', 'url(#sv-arrow)');
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

        // Apply selected nodes (single or multi)
        const toHighlight = new Set();
        if (this.sv.selectedNodeId) toHighlight.add(this.sv.selectedNodeId);
        if (this.sv.selectedNodeIds) this.sv.selectedNodeIds.forEach(id => toHighlight.add(id));
        for (const id of toHighlight) {
            const nodeEl = nodesLayer.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
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
        // Cannot unlock while logging is active
        if (!locked && this.sv.logging) return;
        this.sv.isLocked = locked;
        const lockBtn    = document.getElementById('sv-lock-btn');
        const deleteBtn  = document.getElementById('sv-delete-selected-btn');
        const clearBtn   = document.getElementById('sv-clear-btn');
        const saveBtn    = document.getElementById('sv-save-file-btn');
        const svgEl      = document.getElementById('sv-canvas-svg');
        if (lockBtn) {
            lockBtn.textContent = locked ? 'Locked' : 'Lock';
            lockBtn.classList.toggle('sv-lock-btn--locked', locked);
        }
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
            // Middle mouse → pan
            if (e.button === 1) {
                e.preventDefault();
                this._svStartPan(e);
                return;
            }
            if (e.button !== 0) return;

            const target  = e.target;
            const isPort  = target.classList.contains('sv-port-hit');
            const nodeEl  = target.closest('[data-node-id]');
            const connEl  = target.closest('[id^="sv-conn-"]');

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
                this._svStartSelectRect(e);
            }
        });

        // Prevent middle-click autoscroll/paste default
        svg.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

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
            const mod = e.ctrlKey || e.metaKey;
            const inInput = e.target.matches('input, textarea, select');
            if (e.key === 'Escape') {
                const overlay = document.getElementById('sv-ws-modal-overlay');
                if (overlay && overlay.style.display !== 'none') {
                    e.stopPropagation();
                    this._svCloseWorkspaceBrowser();
                }
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
                if (!this.sv.isLocked) this._svDeleteSelected();
            }
            if (mod && !e.shiftKey && e.key === 'z' && !inInput) {
                e.preventDefault();
                this._svUndo();
            }
            if ((mod && e.key === 'y') || (mod && e.shiftKey && e.key === 'z')) {
                if (!inInput) { e.preventDefault(); this._svRedo(); }
            }
            if (mod && !e.shiftKey && e.key === 's' && !inInput) {
                e.preventDefault();
                this._svSaveToFile();
            }
            if (mod && e.shiftKey && e.key === 'f' && !inInput) {
                e.preventDefault();
                this._svFitView();
            }
            if (mod && !e.shiftKey && (e.key === '=' || e.key === '+') && !inInput) {
                e.preventDefault();
                if (this._svDoZoom) this._svDoZoom(1.2);
            }
            if (mod && !e.shiftKey && e.key === '-' && !inInput) {
                e.preventDefault();
                if (this._svDoZoom) this._svDoZoom(1 / 1.2);
            }
            if (mod && e.shiftKey && e.key === 'l' && !inInput) {
                e.preventDefault();
                this._svToggleLogging();
            }
        });

        // ── Toolbar buttons ───────────────────────────────────────────────────
        const clearBtn      = document.getElementById('sv-clear-btn');
        const fitBtn        = document.getElementById('sv-fit-btn');
        const zoomInBtn     = document.getElementById('sv-zoom-in-btn');
        const zoomOutBtn    = document.getElementById('sv-zoom-out-btn');
        const deleteBtn     = document.getElementById('sv-delete-selected-btn');
        const saveFileBtn   = document.getElementById('sv-save-file-btn');
        const workspacesBtn = document.getElementById('sv-workspaces-btn');
        const undoBtn       = document.getElementById('sv-undo-btn');
        const redoBtn       = document.getElementById('sv-redo-btn');
        const lockBtn       = document.getElementById('sv-lock-btn');
        if (clearBtn)      clearBtn.addEventListener('click',      () => this._svClear());
        if (fitBtn)        fitBtn.addEventListener('click',        () => this._svFitView());
        if (deleteBtn)     deleteBtn.addEventListener('click',     () => this._svDeleteSelected());
        if (saveFileBtn)   saveFileBtn.addEventListener('click',   () => this._svSaveToFile());
        if (workspacesBtn) workspacesBtn.addEventListener('click', () => this._svOpenWorkspaceBrowser());
        if (undoBtn)       undoBtn.addEventListener('click',       () => this._svUndo());
        if (redoBtn)       redoBtn.addEventListener('click',       () => this._svRedo());
        if (lockBtn)       lockBtn.addEventListener('click',       () => this._svSetLocked(!this.sv.isLocked));
        this._svUpdateUndoRedoBtns();

        // Workspace browser modal
        const wsCloseBtn       = document.getElementById('sv-ws-close-btn');
        const wsNewBtn         = document.getElementById('sv-ws-new-btn');
        const wsOverlay        = document.getElementById('sv-ws-modal-overlay');
        const wsNameForm       = document.getElementById('sv-ws-name-form');
        const wsNameInput      = document.getElementById('sv-ws-name-input');
        const wsNameConfirmBtn = document.getElementById('sv-ws-name-confirm-btn');
        const wsNameCancelBtn  = document.getElementById('sv-ws-name-cancel-btn');
        const wsImportBtn      = document.getElementById('sv-ws-import-btn');
        const wsFolderChangeBtn = document.getElementById('sv-ws-folder-change-btn');

        if (wsCloseBtn) wsCloseBtn.addEventListener('click', () => this._svCloseWorkspaceBrowser());
        if (wsOverlay)  wsOverlay.addEventListener('click', (e) => {
            if (e.target === wsOverlay) this._svCloseWorkspaceBrowser();
        });

        // New Workspace: show inline name form
        if (wsNewBtn) wsNewBtn.addEventListener('click', () => {
            if (!wsNameForm || !wsNameInput) return;
            wsNameConfirmBtn.textContent = 'Create';
            wsNameInput.value = '';
            wsNameInput.placeholder = 'Workspace name…';
            wsNameInput.dataset.mode = 'new';
            wsNameInput.dataset.wsId = '';
            wsNameForm.style.display = 'flex';
            wsNameInput.focus();
        });

        // Name form confirm (Create or Rename)
        if (wsNameConfirmBtn) wsNameConfirmBtn.addEventListener('click', () => {
            this._svWsNameFormSubmit();
        });
        if (wsNameInput) wsNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._svWsNameFormSubmit();
            if (e.key === 'Escape') this._svWsNameFormHide();
        });
        if (wsNameCancelBtn)    wsNameCancelBtn.addEventListener('click',    () => this._svWsNameFormHide());
        if (wsImportBtn)        wsImportBtn.addEventListener('click',        () => this._svWsImportFile());
        if (wsFolderChangeBtn)  wsFolderChangeBtn.addEventListener('click',  () => this._svWsSetFolder());

        this._svDoZoom = (factor) => {
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
        if (zoomInBtn)  zoomInBtn.addEventListener('click',  () => this._svDoZoom(1.2));
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this._svDoZoom(1 / 1.2));

        // Collapsible pane toggles
        const sidebarToggle = document.getElementById('sv-sidebar-toggle');
        const propsToggle   = document.getElementById('sv-props-toggle');
        const propsPane     = document.getElementById('sv-properties');

        if (sidebarToggle && sidebar) {
            sidebarToggle.addEventListener('click', () => {
                const collapsed = sidebar.classList.toggle('sv-pane-collapsed');
                sidebarToggle.textContent = collapsed ? '›' : '‹';
                sidebarToggle.title = collapsed ? 'Expand' : 'Collapse';
            });
        }
        if (propsToggle && propsPane) {
            propsToggle.addEventListener('click', () => {
                const collapsed = propsPane.classList.toggle('sv-pane-collapsed');
                propsToggle.textContent = collapsed ? '‹' : '›';
                propsToggle.title = collapsed ? 'Expand' : 'Collapse';
            });
        }

        // ── Native menu action relay ───────────────────────────────────────────
        if (window.electronAPI?.onMenuAction) {
            const menuHandlers = {
                'menu-sv-save':        () => this._svSaveToFile(),
                'menu-sv-new-ws':      () => {
                    this._svOpenWorkspaceBrowser();
                    // Trigger the inline new-workspace form after the modal opens
                    setTimeout(() => {
                        const wsNewBtn = document.getElementById('sv-ws-new-btn');
                        if (wsNewBtn) wsNewBtn.click();
                    }, 100);
                },
                'menu-sv-workspaces':  () => this._svOpenWorkspaceBrowser(),
                'menu-sv-import-ws':   () => this._svWsImportFile(),
                'menu-sv-export-ws':   () => {
                    if (this.sv.currentWsId) {
                        this._svWsExportFile(this.sv.currentWsId, this.sv.currentWsName);
                    } else {
                        this._svSaveToFile().then?.(() =>
                            this._svWsExportFile(this.sv.currentWsId, this.sv.currentWsName));
                    }
                },
                'menu-sv-undo':        () => this._svUndo(),
                'menu-sv-redo':        () => this._svRedo(),
                'menu-sv-fit':         () => this._svFitView(),
                'menu-sv-zoom-in':     () => this._svDoZoom(1.2),
                'menu-sv-zoom-out':    () => this._svDoZoom(1 / 1.2),
                'menu-sv-delete':      () => { if (!this.sv.isLocked) this._svDeleteSelected(); },
                'menu-sv-clear':       () => this._svClear(),
                'menu-sv-lock':        () => { if (!this.sv.isLogging) this._svSetLocked(!this.sv.isLocked); },
                'menu-sv-log-toggle':  () => this._svToggleLogging(),
                'menu-sv-log-folder':  () => this._svLogSetDir(),
                'menu-check-updates':  () => window.electronAPI?.checkForUpdates?.(),
            };
            for (const [channel, handler] of Object.entries(menuHandlers)) {
                window.electronAPI.onMenuAction(channel, handler);
            }
        }
    };

    // ─── Pan ──────────────────────────────────────────────────────────────────

    DWMControl.prototype._svStartSelectRect = function(e) {
        if (this.sv.isLocked) { this._svStartPan(e); return; }
        const svg   = document.getElementById('sv-canvas-svg');
        const pt    = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
        const wx    = (svgPt.x - this.sv.viewport.x) / this.sv.viewport.scale;
        const wy    = (svgPt.y - this.sv.viewport.y) / this.sv.viewport.scale;

        this.sv.selectRect = { startX: wx, startY: wy, currentX: wx, currentY: wy };
        if (!e.shiftKey) {
            this.sv.selectedNodeIds.clear();
            this.sv.selectedNodeId = null;
            this.sv.selectedConnId = null;
        }
        const rectEl = document.getElementById('sv-select-rect');
        if (rectEl) rectEl.setAttribute('visibility', 'visible');
        this._svUpdateSelectionVisuals();
    };

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

        // If dragged node is part of existing multi-selection, drag all selected
        const isInMulti = this.sv.selectedNodeIds.has(nodeId) && this.sv.selectedNodeIds.size > 1;
        if (isInMulti) {
            const offsets = new Map();
            for (const id of this.sv.selectedNodeIds) {
                const n = this.sv.nodes.get(id);
                if (n) offsets.set(id, { offsetX: wx - n.x, offsetY: wy - n.y, origX: n.x, origY: n.y });
            }
            this.sv.dragOffsets = offsets;
        } else {
            this.sv.dragOffsets = null;
            this.sv.selectedNodeIds.clear();
        }

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

        if (this.sv.selectRect) {
            const svg2 = document.getElementById('sv-canvas-svg');
            const pt2  = svg2.createSVGPoint();
            pt2.x = e.clientX; pt2.y = e.clientY;
            const svgPt2 = pt2.matrixTransform(svg2.getScreenCTM().inverse());
            const wx2 = (svgPt2.x - this.sv.viewport.x) / this.sv.viewport.scale;
            const wy2 = (svgPt2.y - this.sv.viewport.y) / this.sv.viewport.scale;
            this.sv.selectRect.currentX = wx2;
            this.sv.selectRect.currentY = wy2;

            // Update visual rect
            const rx  = Math.min(this.sv.selectRect.startX, wx2);
            const ry  = Math.min(this.sv.selectRect.startY, wy2);
            const rw  = Math.abs(wx2 - this.sv.selectRect.startX);
            const rh  = Math.abs(wy2 - this.sv.selectRect.startY);
            const sel = document.getElementById('sv-select-rect');
            if (sel) {
                sel.setAttribute('x', rx);
                sel.setAttribute('y', ry);
                sel.setAttribute('width', rw);
                sel.setAttribute('height', rh);
            }
            return;
        }

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
            if (node) {
                const wx = (e.clientX - rect.left - vp.x) / vp.scale;
                const wy = (e.clientY - rect.top  - vp.y) / vp.scale;
                const snapSize = this.sv.settings.snapEnabled ? this.sv.settings.snapSize : 1;

                if (this.sv.dragOffsets) {
                    // Group drag
                    for (const [id, off] of this.sv.dragOffsets) {
                        const n = this.sv.nodes.get(id);
                        if (n) {
                            n.x = Math.round((wx - off.offsetX) / snapSize) * snapSize;
                            n.y = Math.round((wy - off.offsetY) / snapSize) * snapSize;
                        }
                    }
                } else {
                    node.x = Math.round((wx - this.sv.dragOffset.x) / snapSize) * snapSize;
                    node.y = Math.round((wy - this.sv.dragOffset.y) / snapSize) * snapSize;
                }

                // Check for overlap with any other node
                let overlapId = null;
                for (const other of this.sv.nodes.values()) {
                    if (other.id === node.id) continue;
                    if (this.sv.dragOffsets && this.sv.dragOffsets.has(other.id)) continue;
                    if (this._svNodesOverlap(node, other)) { overlapId = other.id; break; }
                }
                this.sv.dragOverlapId = overlapId;
            }

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
        if (this.sv.selectRect) {
            const r     = this.sv.selectRect;
            const minX  = Math.min(r.startX, r.currentX);
            const maxX  = Math.max(r.startX, r.currentX);
            const minY  = Math.min(r.startY, r.currentY);
            const maxY  = Math.max(r.startY, r.currentY);
            for (const node of this.sv.nodes.values()) {
                const td  = window.SiteViewComponents.COMPONENT_TYPES[node.type];
                const nw  = td ? td.width  : 80;
                const nh  = window.SiteViewComponents.getNodeHeight(node) || 40;
                // Test centre point overlap with band
                if (node.x + nw >= minX && node.x <= maxX && node.y + nh >= minY && node.y <= maxY) {
                    this.sv.selectedNodeIds.add(node.id);
                    this.sv.selectedNodeId = node.id; // keep last as "primary"
                }
            }
            this.sv.selectRect = null;
            const rectEl = document.getElementById('sv-select-rect');
            if (rectEl) {
                rectEl.setAttribute('visibility', 'hidden');
                rectEl.setAttribute('width', '0');
                rectEl.setAttribute('height', '0');
            }
            this._svUpdateSelectionVisuals();
            this._svRenderProperties();
            return;
        }

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
                if (this.sv.dragOffsets) {
                    for (const [id, off] of this.sv.dragOffsets) {
                        const n = this.sv.nodes.get(id);
                        if (n) { n.x = off.origX; n.y = off.origY; }
                    }
                }
            }
            this.sv.dragNodeId    = null;
            this.sv.dragOffsets   = null;
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
                for (const port of window.SiteViewComponents.getNodePorts(node)) {
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

            // Normalise: ensure "from" is always the output/source side so arrow direction is consistent.
            // Swap when the dragged-from port is an input or bidirectional that should be a destination.
            const fromT = from.portType;
            let fnId = from.nodeId, fpId = from.portId;
            let tnId = toNodeId,    tpId = toPortId;
            if ((fromT === 'input'        && toPortType === 'output')       ||
                (fromT === 'bidirectional' && toPortType === 'output')       ||
                (fromT === 'input'        && toPortType === 'bidirectional')) {
                // Swap so the output/source side is always "from"
                [fnId, fpId, tnId, tpId] = [tnId, tpId, fnId, fpId];
            }

            // Replace any existing connection on the same port (one connection per port)
            // Check both "from" and "to" ends since bidirectional ports can appear on either side.
            for (const [existingId, existing] of this.sv.connections) {
                const usesFromPort = (existing.fromNodeId === fnId && existing.fromPortId === fpId) ||
                                     (existing.toNodeId   === fnId && existing.toPortId   === fpId);
                const usesToPort   = (existing.fromNodeId === tnId && existing.fromPortId === tpId) ||
                                     (existing.toNodeId   === tnId && existing.toPortId   === tpId);
                if (usesFromPort || usesToPort) this.sv.connections.delete(existingId);
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

        // Multi-select deletion (includes the case where selectedNodeIds has exactly 1 entry)
        if (this.sv.selectedNodeIds && this.sv.selectedNodeIds.size > 0) {
            this._svPushUndo();
            for (const nodeId of this.sv.selectedNodeIds) {
                this.sv.nodes.delete(nodeId);
                for (const [connId, conn] of this.sv.connections) {
                    if (conn.fromNodeId === nodeId || conn.toNodeId === nodeId) {
                        this.sv.connections.delete(connId);
                    }
                }
            }
            this.sv.selectedNodeIds.clear();
            this.sv.selectedNodeId = null;
            this._svRender();
            this._svRenderProperties();
            this._svMarkDirty();

        } else if (this.sv.selectedNodeId) {
            this._svPushUndo();
            const nodeId = this.sv.selectedNodeId;
            this.sv.nodes.delete(nodeId);
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
        // Keep multi-selection if this node is already in it; otherwise reset to just this one
        if (!this.sv.selectedNodeIds.has(nodeId)) {
            this.sv.selectedNodeIds.clear();
            this.sv.selectedNodeIds.add(nodeId);
        }
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

        // ── Multi-select header ───────────────────────────────────────────────
        if (this.sv.selectedNodeIds && this.sv.selectedNodeIds.size > 1) {
            content.innerHTML = `<div class="sv-props-section">
<div class="sv-props-title">${this.sv.selectedNodeIds.size} nodes selected</div>
<div class="sv-props-field sv-props-field--action">
    <button class="sv-props-delete-btn" id="sv-prop-delete-multi">&#128465; Delete All</button>
</div>
</div>`;
            const delBtn = content.querySelector('#sv-prop-delete-multi');
            if (delBtn) delBtn.addEventListener('click', () => this._svDeleteSelected());
            return;
        }

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
                const numPorts  = node.props.numPorts  ?? 2;
                const activePrt = node.props.activePort ?? 1;
                let numPortsOpts = '';
                for (let i = 2; i <= 8; i++) {
                    numPortsOpts += `<option value="${i}"${numPorts === i ? ' selected' : ''}>${i}</option>`;
                }
                let activePortOpts = '';
                for (let i = 1; i <= numPorts; i++) {
                    activePortOpts += `<option value="${i}"${activePrt === i ? ' selected' : ''}>Port ${i}</option>`;
                }
                html += `
<div class="sv-props-field">
    <label class="sv-props-label">Selector Ports</label>
    <select class="sv-props-select" id="sv-prop-num-ports">${numPortsOpts}</select>
</div>
<div class="sv-props-field">
    <label class="sv-props-label">Active Port</label>
    <select class="sv-props-select" id="sv-prop-active-port">${activePortOpts}</select>
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

            // ── Transmission Line ─────────────────────────────────────────────
            if (node.type === 'tx-line') {
                const cableTypes = ['RG-8', 'RG-8X', 'RG-213', 'LMR-400', 'LMR-600', 'Heliax 1/2"', 'Heliax 7/8"', 'Custom'];
                const typeOptions = cableTypes.map(ct =>
                    `<option value="${_esc(ct)}"${(node.props.cableType || '') === ct ? ' selected' : ''}>${_esc(ct)}</option>`
                ).join('');
                html += `
<div class="sv-props-field">
    <label class="sv-props-label">Cable Type</label>
    <select class="sv-props-select" id="sv-prop-cable-type">
        <option value="">-- Select --</option>
        ${typeOptions}
    </select>
</div>
<div class="sv-props-field">
    <label class="sv-props-label">Length (ft)</label>
    <input class="sv-props-input" type="number" id="sv-prop-length-ft"
           value="${_esc(String(node.props.lengthFt ?? ''))}" placeholder="e.g. 50" min="0" step="1">
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
</div>
<div class="sv-props-field">
    <label class="sv-props-label">Measurement Power Type</label>
    <select class="sv-props-select" id="sv-prop-rl-power-type">
        <option value="avg"${(node.props.rlPowerType || 'avg') === 'avg' ? ' selected' : ''}>AVG — Average Power</option>
        <option value="peak"${node.props.rlPowerType === 'peak' ? ' selected' : ''}>PEP — Peak Envelope</option>
        <option value="inst"${node.props.rlPowerType === 'inst' ? ' selected' : ''}>INST — Instantaneous</option>
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

            // Wire up coax-switch num ports + active port
            if (node.type === 'coax-switch') {
                const numPortsSel = document.getElementById('sv-prop-num-ports');
                const portSel     = document.getElementById('sv-prop-active-port');
                if (numPortsSel) {
                    numPortsSel.addEventListener('change', () => {
                        this._svPushUndo();
                        const newN = parseInt(numPortsSel.value, 10);
                        node.props.numPorts  = newN;
                        // Clamp activePort to valid range
                        if ((node.props.activePort ?? 1) > newN) node.props.activePort = newN;
                        // Remove connections to ports that no longer exist
                        for (let i = newN + 1; i <= 8; i++) {
                            const portId = `out${i}`;
                            for (const [cid, conn] of this.sv.connections) {
                                if ((conn.fromNode === node.id && conn.fromPort === portId) ||
                                    (conn.toNode   === node.id && conn.toPort   === portId)) {
                                    this.sv.connections.delete(cid);
                                }
                            }
                        }
                        this._svRender();
                        this._svRenderProperties(node.id);
                        this._svMarkDirty();
                    });
                }
                if (portSel) {
                    portSel.addEventListener('change', () => {
                        this._svPushUndo();
                        node.props.activePort = parseInt(portSel.value, 10);
                        this._svRender();
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

            // Wire up transmission line props
            if (node.type === 'tx-line') {
                const cableTypeSel = document.getElementById('sv-prop-cable-type');
                const lengthFtInput = document.getElementById('sv-prop-length-ft');
                if (cableTypeSel) {
                    cableTypeSel.addEventListener('change', () => {
                        this._svPushUndo();
                        node.props.cableType = cableTypeSel.value;
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
                if (lengthFtInput) {
                    lengthFtInput.addEventListener('change', () => {
                        this._svPushUndo();
                        const v = lengthFtInput.value.trim();
                        node.props.lengthFt = v === '' ? null : parseFloat(v);
                        this._svRender();
                        this._svMarkDirty();
                    });
                }
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
                const rlPowerTypeSel = document.getElementById('sv-prop-rl-power-type');
                if (rlPowerTypeSel) {
                    rlPowerTypeSel.addEventListener('change', () => {
                        node.props.rlPowerType = rlPowerTypeSel.value;
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
</div>

<div class="sv-props-section">
<div class="sv-props-title">Data Logging</div>
<div class="sv-props-field">
    <label class="sv-props-label">Logging Rate</label>
    <div class="sv-props-info">${this.config?.globalSampleIntervalMs || 80} ms <span class="sv-props-hint-inline">(set in Control tab)</span></div>
</div>
<div class="sv-props-field sv-log-dir-field">
    <label class="sv-props-label">Save Folder</label>
    <div class="sv-log-dir-row">
        <span class="sv-log-dir-path" id="sv-log-dir-path" title="${_esc(this.sv.logsDir || '')}">${_esc(this.sv.logsDir || 'Loading…')}</span>
        <button class="sv-props-btn sv-props-btn-sm" id="sv-log-dir-btn">Change…</button>
    </div>
</div>
<div class="sv-props-field">
    <div class="sv-log-status" id="sv-log-status">${this.sv.logging ? 'Logging&hellip;' : this.sv.logFilePath ? `Last saved: ${_esc(this.sv.logFilePath.split('/').pop() || this.sv.logFilePath.split('\\').pop() || '')}` : 'Not logging'}</div>
</div>
<div class="sv-props-field sv-props-actions">
    <button class="sv-props-btn${this.sv.logging ? ' sv-props-btn-danger' : ''}" id="sv-ws-log-toggle">${this.sv.logging ? 'Stop Logging' : 'Start Logging'}</button>
</div>
<div class="sv-props-hint">Locks the workspace while active. Writes to CSV in real-time.</div>
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

            // Data logging toggle
            const logToggleBtn = document.getElementById('sv-ws-log-toggle');
            if (logToggleBtn) {
                logToggleBtn.addEventListener('click', () => this._svToggleLogging());
            }

            // Log directory change
            const logDirBtn = document.getElementById('sv-log-dir-btn');
            if (logDirBtn) {
                logDirBtn.addEventListener('click', () => this._svLogSetDir());
            }

            // Populate log dir path label (async)
            if (window.electronAPI?.svLogGetDir) {
                window.electronAPI.svLogGetDir().then(r => {
                    if (r?.logsDir) {
                        this.sv.logsDir = r.logsDir;
                        const el = document.getElementById('sv-log-dir-path');
                        if (el) { el.textContent = r.logsDir; el.title = r.logsDir; }
                    }
                }).catch(() => {});
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
        if (this.sv.powerTimer) clearTimeout(this.sv.powerTimer);
        const tick = () => {
            this._svUpdatePowerReadouts();
            const ms = this.config?.globalSampleIntervalMs || 80;
            this.sv.powerTimer = setTimeout(tick, ms);
        };
        const ms = this.config?.globalSampleIntervalMs || 80;
        this.sv.powerTimer = setTimeout(tick, ms);
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
        const getRLPowerW = (deviceUid, powerType) => {
            if (!deviceUid || !window.dwm?.meterRegistry) return null;
            for (const rec of window.dwm.meterRegistry.values()) {
                if ((rec.apiUid || rec.key) === deviceUid) {
                    if (rec.connectionState !== 'connected' || !rec.state?.lastSnapshotRaw) return null;
                    const pt = powerType || 'avg';
                    const w = parseFloat(rec.state.lastSnapshotRaw[pt] ?? rec.state.lastSnapshotRaw.avg);
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

            const rlPt = node.props?.rlPowerType || 'avg';
            const pfwd = getRLPowerW(node.props?.fwdDeviceUid, rlPt);
            const prfl = getRLPowerW(node.props?.rflDeviceUid, rlPt);
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

        // ── Data logging capture ───────────────────────────────────────────────
        if (this.sv.logging && window.electronAPI?.svLogRow) {
            const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
            const ts = new Date().toISOString();
            const vals = [];

            // Ensure column order matches header (built at start)
            for (const nodeId of this.sv.logColumns) {
                const node = this.sv.nodes.get(nodeId);
                if (!node) { vals.push(''); continue; }

                if (node.type === 'dwm-meter') {
                    let text = '';
                    const deviceUid = node.props.deviceUid;
                    if (deviceUid && window.dwm?.meterRegistry) {
                        for (const rec of window.dwm.meterRegistry.values()) {
                            if (rec.apiUid === deviceUid &&
                                rec.connectionState === 'connected' &&
                                rec.state?.lastSnapshotRaw) {
                                const pt = node.props.powerType || 'avg';
                                const w  = parseFloat(rec.state.lastSnapshotRaw[pt] ?? rec.state.lastSnapshotRaw.avg);
                                if (Number.isFinite(w) && w >= 0 && typeof window.dwm.scalePower === 'function') {
                                    const scaled = window.dwm.scalePower(w);
                                    text = scaled.scaled.toFixed(4) + ' ' + scaled.unit;
                                }
                                break;
                            }
                        }
                    }
                    vals.push(text);
                } else if (node.type === 'return-loss') {
                    const pfwd = getRLPowerW(node.props?.fwdDeviceUid);
                    const prfl = getRLPowerW(node.props?.rflDeviceUid);
                    let displayText = '';
                    const mode = node.props?.displayMode || 'rl';
                    if (pfwd !== null && prfl !== null) {
                        const ratio = Math.min(prfl / pfwd, 0.9999);
                        if (mode === 'swr') {
                            const gamma = Math.sqrt(ratio);
                            const swr   = (1 + gamma) / (1 - gamma);
                            displayText = swr.toFixed(4) + ':1';
                        } else {
                            displayText = (-10 * Math.log10(ratio)).toFixed(2) + ' dB';
                        }
                    }
                    vals.push(displayText);
                } else {
                    vals.push('');
                }
            }

            const csvRow = [q(ts), ...vals.map(q)].join(',');
            window.electronAPI.svLogRow({ row: csvRow }).catch(() => {});
        }
    };

    // ─── Data logging ─────────────────────────────────────────────────────────

    DWMControl.prototype._svToggleLogging = function () {
        if (this.sv.logging) {
            // ── Stop logging ──────────────────────────────────────────────────
            this.sv.logging = false;
            this.sv.logColumns = [];

            // Close the stream in main process
            if (window.electronAPI?.svLogClose) {
                window.electronAPI.svLogClose().then(result => {
                    if (result?.success && result.filePath) {
                        this.sv.logFilePath = result.filePath;
                    }
                }).catch(err => console.error('Log close error:', err));
            }

            // Restore pre-logging lock state
            if (!this.sv.wasLockedBeforeLogging) {
                this.sv.isLocked = false;
                const lockBtn   = document.getElementById('sv-lock-btn');
                const deleteBtn = document.getElementById('sv-delete-selected-btn');
                const clearBtn  = document.getElementById('sv-clear-btn');
                const saveBtn   = document.getElementById('sv-save-file-btn');
                const svgEl     = document.getElementById('sv-canvas-svg');
                if (lockBtn)   { lockBtn.textContent = 'Lock'; lockBtn.classList.remove('sv-lock-btn--locked'); }
                if (deleteBtn) deleteBtn.disabled = false;
                if (clearBtn)  clearBtn.disabled  = false;
                if (saveBtn)   saveBtn.disabled   = false;
                if (svgEl)     svgEl.classList.remove('sv-canvas-locked');
            }
        } else {
            // ── Start logging ─────────────────────────────────────────────────
            this.sv.wasLockedBeforeLogging = this.sv.isLocked;
            this.sv.logData    = [];
            this.sv.logColumns = [];
            this.sv.logFilePath = null;
            this.sv.logging    = true;
            this._svSetLocked(true);

            // Build header row from current meter nodes
            const colIds   = [];
            const colNames = [];
            for (const node of this.sv.nodes.values()) {
                if (node.type === 'dwm-meter' || node.type === 'return-loss') {
                    colIds.push(node.id);
                    const label = node.label || node.id;
                    const suffix = node.type === 'dwm-meter'
                        ? ` (${node.props?.measureType || 'fwd'} ${(node.props?.powerType || 'avg').toUpperCase()})`
                        : ` (${node.props?.displayMode === 'swr' ? 'SWR' : 'Return Loss'})`;
                    colNames.push(label + suffix);
                }
            }
            this.sv.logColumns = colIds;

            const header = ['Timestamp', ...colNames].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
            const ts     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const wsName = (this.sv.currentWsName || 'log').replace(/[^a-zA-Z0-9_-]/g, '_');
            const filename = `${wsName}-${ts}`;

            if (window.electronAPI?.svLogOpen) {
                window.electronAPI.svLogOpen({ header, filename }).then(result => {
                    if (result?.success) {
                        this.sv.logFilePath = result.filePath;
                    } else {
                        console.error('Failed to open log file:', result?.error);
                        this.sv.logging = false;
                    }
                }).catch(err => {
                    console.error('Log open error:', err);
                    this.sv.logging = false;
                });
            }
        }
        // Re-render properties pane to update button/status
        const wasSelected = this.sv.selectedNodeId;
        this.sv.selectedNodeId = null;
        this.sv.selectedConnId = null;
        this._svUpdateSelectionVisuals();
        this._svRenderProperties();
        this.sv.selectedNodeId = wasSelected;
    };

    DWMControl.prototype._svLogSetDir = function () {
        if (!window.electronAPI?.svLogSetDir) return;
        window.electronAPI.svLogSetDir().then(result => {
            if (result?.canceled) return;
            if (result?.success && result.logsDir) {
                this.sv.logsDir = result.logsDir;
                // Update the displayed path if properties pane is showing workspace settings
                const el = document.getElementById('sv-log-dir-path');
                if (el) { el.textContent = result.logsDir; el.title = result.logsDir; }
            }
        }).catch(err => console.error('Set log dir failed:', err));
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
        this._svUpdateWsNameDisplay();
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
        if (this.sv?.powerTimer) clearTimeout(this.sv.powerTimer);
        if (this.sv?.saveTimer)  clearTimeout(this.sv.saveTimer);
    };

    // ─── Save / Load to file ──────────────────────────────────────────────────

    DWMControl.prototype._svSaveToFile = function () {
        const schematic = {
            version:     1,
            nodes:       [...this.sv.nodes.values()],
            connections: [...this.sv.connections.values()],
            viewport:    { ...this.sv.viewport },
        };
        const thumbnail      = this._svGenerateThumbnail();
        const componentCount = this.sv.nodes.size;
        const name           = this.sv.currentWsName || 'Untitled';
        const id             = this.sv.currentWsId   || null;

        window.electronAPI.svWsSave({ id, name, schematic, thumbnail, componentCount })
            .then(result => {
                if (!result?.success) return;
                this.sv.currentWsId = result.id;
                this.sv.isDirty = false;
                this._svUpdateWsNameDisplay();
                this._svSetSaveStatus('saved');
            })
            .catch(err => console.error('Workspace save failed:', err));
    };

    DWMControl.prototype._svLoadFromFile = function () {
        window.electronAPI.svLoadFile({ filterName: 'Site Schematic', ext: 'json' })
            .then(result => {
                if (!result?.success) return;
                let data;
                try { data = JSON.parse(result.content); } catch (e) {
                    alert('Failed to parse schematic file: ' + e.message); return;
                }
                if (!data || data.version !== 1) {
                    alert('Invalid schematic file (version mismatch).'); return;
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
            })
            .catch(err => console.error('Load failed:', err));
    };

    // ─── Workspace name display ───────────────────────────────────────────────

    DWMControl.prototype._svUpdateWsNameDisplay = function () {
        const el = document.getElementById('sv-current-ws-name');
        if (!el) return;
        const name = this.sv.currentWsName || 'Untitled';
        el.textContent = this.sv.isDirty ? name + ' *' : name;
        el.title = name;
    };

    // ─── Thumbnail generation ─────────────────────────────────────────────────

    DWMControl.prototype._svGenerateThumbnail = function () {
        if (this.sv.nodes.size === 0) return null;

        const { COMPONENT_TYPES } = window.SiteViewComponents;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const node of this.sv.nodes.values()) {
        const td = COMPONENT_TYPES[node.type];
        if (!td) continue;
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + td.width);
            maxY = Math.max(maxY, node.y + window.SiteViewComponents.getNodeHeight(node));
        }
        if (!isFinite(minX)) return null;

        const pad = 20;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const bw = maxX - minX, bh = maxY - minY;
        const TW = 240, TH = 140;
        const sc = Math.min(TW / bw, TH / bh);
        const tx = (TW - bw * sc) / 2 - minX * sc;
        const ty = (TH - bh * sc) / 2 - minY * sc;

        const nodesEl = document.getElementById('sv-nodes-layer');
        const connsEl = document.getElementById('sv-connections-layer');
        if (!nodesEl) return null;

        const nodesHtml = (nodesEl.innerHTML || '')
            .replace(/stroke-dasharray="[^"]*"/g, '')
            .replace(/class="sv-node-selection"[^/]*/g, 'visibility="hidden"')
            .replace(/class="sv-port-hit[^"]*"[^/]*/g, '');
        const connsHtml = connsEl ? connsEl.innerHTML || '' : '';

        return `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}">` +
            `<rect width="${TW}" height="${TH}" fill="#1e2a3a" rx="6"/>` +
            `<g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${sc.toFixed(4)})">` +
            `<g>${connsHtml}</g><g>${nodesHtml}</g>` +
            `</g></svg>`;
    };

    // ─── Workspace Browser ────────────────────────────────────────────────────

    DWMControl.prototype._svOpenWorkspaceBrowser = function () {
        const overlay = document.getElementById('sv-ws-modal-overlay');
        if (!overlay) return;
        overlay.style.display = 'flex';
        this._svRefreshWorkspaceBrowser();
    };

    DWMControl.prototype._svCloseWorkspaceBrowser = function () {
        const overlay = document.getElementById('sv-ws-modal-overlay');
        if (overlay) overlay.style.display = 'none';
    };

    DWMControl.prototype._svRefreshWorkspaceBrowser = function () {
        if (!window.electronAPI?.svWsList) return;
        window.electronAPI.svWsList().then(result => {
            const workspaces = result?.workspaces || [];
            // Update folder display in footer
            const folderEl = document.getElementById('sv-ws-folder-path');
            if (folderEl && result?.workspacesDir) {
                folderEl.textContent = result.workspacesDir;
                folderEl.title       = result.workspacesDir;
            }
            this._svRenderWorkspaceBrowserCards(workspaces);
        }).catch(err => console.error('Failed to list workspaces:', err));
    };

    DWMControl.prototype._svRenderWorkspaceBrowserCards = function (workspaces) {
        const grid     = document.getElementById('sv-ws-grid');
        const empty    = document.getElementById('sv-ws-empty');
        const subtitle = document.getElementById('sv-ws-modal-subtitle');
        if (!grid) return;

        if (subtitle) subtitle.textContent = workspaces.length > 0
            ? `${workspaces.length} workspace${workspaces.length !== 1 ? 's' : ''}`
            : '';

        if (workspaces.length === 0) {
            grid.style.display = 'none';
            if (empty) empty.style.display = 'flex';
            return;
        }
        grid.style.display = 'grid';
        if (empty) empty.style.display = 'none';

        grid.innerHTML = workspaces.map(ws => {
            const isCurrent = ws.id === this.sv.currentWsId;
            const modDate   = ws.modifiedAt ? _svRelativeDate(ws.modifiedAt) : 'Never saved';
            const compStr   = ws.componentCount === 1 ? '1 component' : `${ws.componentCount || 0} components`;
            // Use inline SVG to avoid CSP data: URI restriction on img-src
            const thumbHtml = ws.thumbnail
                ? ws.thumbnail
                : `<div class="sv-ws-card-thumb-placeholder"><span>No Preview</span></div>`;

            return `<div class="sv-ws-card${isCurrent ? ' sv-ws-card--current' : ''}" data-ws-id="${_esc(ws.id)}">
            <div class="sv-ws-card-thumb">${thumbHtml}</div>
            <div class="sv-ws-card-body">
                <div class="sv-ws-card-name-row">
                    <span class="sv-ws-card-name" data-ws-name="${_esc(ws.name)}">${_esc(ws.name)}</span>
                    ${isCurrent ? '<span class="sv-ws-card-badge">Open</span>' : ''}
                </div>
                <div class="sv-ws-card-meta">${_esc(compStr)} &middot; ${_esc(modDate)}</div>
                <div class="sv-ws-card-actions">
                    <button class="sv-ws-card-btn sv-ws-card-btn--open"   data-action="open"      data-ws-id="${_esc(ws.id)}">${isCurrent ? 'Reload' : 'Open'}</button>
                    <button class="sv-ws-card-btn sv-ws-card-btn--rename" data-action="rename"    data-ws-id="${_esc(ws.id)}" data-ws-name="${_esc(ws.name)}">Rename</button>
                    <button class="sv-ws-card-btn sv-ws-card-btn--dupe"   data-action="duplicate" data-ws-id="${_esc(ws.id)}">Duplicate</button>
                    <button class="sv-ws-card-btn sv-ws-card-btn--export" data-action="export"    data-ws-id="${_esc(ws.id)}" data-ws-name="${_esc(ws.name)}">Export…</button>
                    <button class="sv-ws-card-btn sv-ws-card-btn--del"    data-action="delete"    data-ws-id="${_esc(ws.id)}">Delete</button>
                </div>
            </div>
        </div>`;
        }).join('');

        grid.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                const wsId   = btn.getAttribute('data-ws-id');
                const wsName = btn.getAttribute('data-ws-name');
                if (action === 'open')      this._svWsOpen(wsId);
                if (action === 'rename')    this._svWsRename(wsId, wsName);
                if (action === 'duplicate') this._svWsDuplicate(wsId);
                if (action === 'export')    this._svWsExportFile(wsId, wsName);
                if (action === 'delete')    this._svWsDelete(wsId);
            });
        });
    };

    DWMControl.prototype._svWsOpen = function (wsId) {
        const doLoad = () => {
            window.electronAPI.svWsLoad({ id: wsId }).then(result => {
                if (!result?.success) { console.error('Load workspace failed:', result?.error); return; }
                const data = result.schematic;
                if (!data || data.version !== 1) { console.error('Invalid workspace data'); return; }
                this.sv.nodes.clear();
                this.sv.connections.clear();
                this.sv.selectedNodeId  = null;
                this.sv.selectedConnId  = null;
                this.sv.selectedNodeIds.clear();
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
                this.sv.currentWsId   = wsId;
                this.sv.currentWsName = result.name || 'Untitled';
                this.sv.isDirty       = false;
                this._svRender();
                this._svRenderProperties();
                this._svUpdateWsNameDisplay();
                this._svSetSaveStatus('Loaded');
                this._svCloseWorkspaceBrowser();
            }).catch(err => console.error('Open workspace error:', err));
        };

        if (this.sv.isDirty) {
            this._svWsConfirm('Unsaved changes will be lost. Open workspace anyway?', doLoad);
        } else {
            doLoad();
        }
    };

    DWMControl.prototype._svWsRename = function (wsId, currentName) {
        const wsNameForm       = document.getElementById('sv-ws-name-form');
        const wsNameInput      = document.getElementById('sv-ws-name-input');
        const wsNameConfirmBtn = document.getElementById('sv-ws-name-confirm-btn');
        if (!wsNameForm || !wsNameInput) return;
        wsNameConfirmBtn.textContent = 'Rename';
        wsNameInput.value = currentName || 'Untitled';
        wsNameInput.placeholder = 'Workspace name…';
        wsNameInput.dataset.mode = 'rename';
        wsNameInput.dataset.wsId = wsId;
        wsNameForm.style.display = 'flex';
        wsNameInput.focus();
        wsNameInput.select();
    };

    DWMControl.prototype._svWsDuplicate = function (wsId) {
        window.electronAPI.svWsDuplicate({ id: wsId }).then(result => {
            if (!result?.success) return;
            this._svRefreshWorkspaceBrowser();
        }).catch(err => console.error('Duplicate failed:', err));
    };

    DWMControl.prototype._svWsDelete = function (wsId) {
        this._svWsConfirm('Delete this workspace? This cannot be undone.', () => {
            window.electronAPI.svWsDelete({ id: wsId }).then(result => {
                if (!result?.success) return;
                if (wsId === this.sv.currentWsId) {
                    this.sv.currentWsId   = null;
                    this.sv.currentWsName = 'Untitled';
                    this._svUpdateWsNameDisplay();
                }
                this._svRefreshWorkspaceBrowser();
            }).catch(err => console.error('Delete failed:', err));
        });
    };

    DWMControl.prototype._svWsNew = function () {
        // Handled via inline form — this is now a no-op stub kept for compat
    };

    DWMControl.prototype._svWsExportFile = function (wsId, wsName) {
        window.electronAPI.svWsExportFile({ id: wsId, name: wsName || 'workspace' })
            .then(result => {
                if (result?.success) this._svSetSaveStatus('Exported');
            })
            .catch(err => console.error('Export failed:', err));
    };

    DWMControl.prototype._svWsImportFile = function () {
        window.electronAPI.svWsImportFile()
            .then(result => {
                if (result?.canceled) return;
                if (!result?.success) { console.error('Import failed:', result?.error); return; }
                this._svRefreshWorkspaceBrowser();
            })
            .catch(err => console.error('Import failed:', err));
    };

    DWMControl.prototype._svWsSetFolder = function () {
        window.electronAPI.svWsSetFolder()
            .then(result => {
                if (result?.canceled) return;
                if (!result?.success) return;
                // Refresh — new folder may have different workspaces
                this._svRefreshWorkspaceBrowser();
            })
            .catch(err => console.error('Set folder failed:', err));
    };

    // ─── Inline name form helpers ─────────────────────────────────────────────

    DWMControl.prototype._svWsNameFormHide = function () {
        const form = document.getElementById('sv-ws-name-form');
        if (form) form.style.display = 'none';
    };

    DWMControl.prototype._svWsNameFormSubmit = function () {
        const wsNameInput = document.getElementById('sv-ws-name-input');
        if (!wsNameInput) return;
        const name  = wsNameInput.value.trim() || 'Untitled';
        const mode  = wsNameInput.dataset.mode;
        const wsId  = wsNameInput.dataset.wsId;
        this._svWsNameFormHide();
        if (mode === 'rename' && wsId) {
            window.electronAPI.svWsRename({ id: wsId, name }).then(result => {
                if (!result?.success) return;
                if (wsId === this.sv.currentWsId) {
                    this.sv.currentWsName = name;
                    this._svUpdateWsNameDisplay();
                }
                this._svRefreshWorkspaceBrowser();
            }).catch(err => console.error('Rename failed:', err));
        } else {
            // mode === 'new'
            if (this.sv.isDirty) this._svSaveToFile();
            this._svWsNewBlank(name);
        }
    };

    // ─── Inline confirm helper (no native dialogs) ────────────────────────────

    DWMControl.prototype._svWsConfirm = function (message, onConfirm) {
        const modal = document.getElementById('sv-ws-modal');
        if (!modal) { if (onConfirm) onConfirm(); return; }

        // Remove any existing confirm banner
        const old = modal.querySelector('.sv-ws-confirm-bar');
        if (old) old.remove();

        const bar = document.createElement('div');
        bar.className = 'sv-ws-confirm-bar';
        bar.innerHTML =
            `<span class="sv-ws-confirm-msg">${_esc(message)}</span>` +
            `<button class="sv-ws-btn-danger sv-ws-confirm-yes">Confirm</button>` +
            `<button class="sv-ws-name-cancel-btn sv-ws-confirm-no">Cancel</button>`;

        modal.querySelector('.sv-ws-modal-header').insertAdjacentElement('afterend', bar);

        bar.querySelector('.sv-ws-confirm-yes').addEventListener('click', () => {
            bar.remove();
            if (onConfirm) onConfirm();
        });
        bar.querySelector('.sv-ws-confirm-no').addEventListener('click', () => bar.remove());
    };

    DWMControl.prototype._svWsNewBlank = function (name) {
        this.sv.nodes.clear();
        this.sv.connections.clear();
        this.sv.undoStack   = [];
        this.sv.redoStack   = [];
        this.sv.selectedNodeId  = null;
        this.sv.selectedConnId  = null;
        this.sv.selectedNodeIds.clear();
        this.sv.viewport    = { x: 0, y: 0, scale: 1.0 };
        this.sv.currentWsId   = null;
        this.sv.currentWsName = name;
        this.sv.isDirty       = false;
        this._svRender();
        this._svRenderProperties();
        this._svUpdateWsNameDisplay();
        this._svUpdateUndoRedoBtns();
        this._svCloseWorkspaceBrowser();
    };

    // ─── Bezier connection path ───────────────────────────────────────────────

    DWMControl.prototype._svNodeBounds = function (node) {
        const typeDef = window.SiteViewComponents.COMPONENT_TYPES[node.type];
        if (!typeDef) return null;
        return { x: node.x, y: node.y, w: typeDef.width, h: window.SiteViewComponents.getNodeHeight(node) };
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

    function _svRelativeDate(isoStr) {
        const d   = new Date(isoStr);
        const now = Date.now();
        const s   = Math.round((now - d.getTime()) / 1000);
        if (s < 60)        return 'just now';
        if (s < 3600)      return `${Math.floor(s / 60)}m ago`;
        if (s < 86400)     return `${Math.floor(s / 3600)}h ago`;
        if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
        return d.toLocaleDateString();
    }

    function _defaultProps(typeId) {
        const gpt = { gainPowerType: 'avg' };
        if (typeId === 'attenuator')   return { attenuationDb: 3, ...gpt };
        if (typeId === 'dwm-meter')    return { deviceUid: null, deviceName: null, measureType: 'forward', powerType: 'avg' };
        if (typeId === 'amplifier')    return { gainDb: null, ...gpt };
        if (typeId === 'transmitter')  return { powerW: null, freqMHz: null };
        if (typeId === 'filter')       return { filterType: 'lowpass', ...gpt, freqMHz: null, bandwidthMHz: null };
        if (typeId === '4port-switch') return { mode: 'through' };
        if (typeId === 'coax-switch')  return { activePort: 1, numPorts: 2 };
        if (['hybrid-3db', 'combiner', 'coupler'].includes(typeId)) return {};
        if (typeId === 'antenna')      return { freqMHz: null };
        if (typeId === 'return-loss')  return { fwdDeviceUid: null, fwdDeviceName: null, rflDeviceUid: null, rflDeviceName: null, displayMode: 'rl' };
        if (typeId === 'tx-line')      return { lengthFt: null, cableType: '' };
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
