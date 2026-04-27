// Control tab methods — meter board layout
// Each discovered meter gets its own full-featured card.

(function attachControlModule() {
    if (typeof DWMControl === 'undefined') {
        console.error('DWMControl not defined before control module loaded');
        return;
    }

    // ─── Per-meter state factory ──────────────────────────────────────────────

    DWMControl.prototype.createMeterState = function() {
        return {
            nextRequestId: 1,
            pendingRequests: new Map(),
            serialBuffer: '',
            pollIntervalMs: Number.parseInt(this.config.globalSampleIntervalMs || 250, 10),
            monitorTimer: null,
            monitorBusy: false,
            snapshotScaleMax: 1,
            consecutiveFailures: 0,
            lastSuccessfulPoll: 0,
            debugLines: [],
            debugMaxLines: 400,
            history: [],
            historyWindowMs: 30000,
            historyLines: ['avg', 'peak'],
            maxPowerW: 0,           // Range * Element Rating max
            elementRating: 0,
            rangeMultiplier: 1,
            lastSnapshotResponse: null,
            lastSnapshotRaw: null,
            pepHeldPeakW: 0,
            pepHoldUntilTs: 0,
            lastKnownBrightness: null,
            identifyInProgress: false,
            elementProfileMenuOpen: false,
            resumePollingAfterElementProfile: false,
            apiCommandQueue: Promise.resolve(),
            topControlEditingId: null,
            cfgDraftEval: null,
            cfgDraftEtype: null,
            gaugeAnim: null,
            cardLayout: 'dual',
        };
    };

    DWMControl.prototype._renderPollIntervalOptions = function(selectedValue) {
        const baseOptions = [50, 100, 125, 200, 250, 333, 500, 750, 1000, 1500, 2000];
        const selectedMs = Number.parseInt(selectedValue, 10);
        const options = baseOptions.includes(selectedMs) ? baseOptions : [selectedMs, ...baseOptions].filter(Number.isFinite);

        return options.map(ms => {
            const label = ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} s`;
            const selected = ms === selectedMs ? ' selected' : '';
            return `<option value="${ms}"${selected}>${label}</option>`;
        }).join('');
    };

    DWMControl.prototype._renderElementOptions = function(selectedValue) {
        const selected = Math.max(1, Math.min(8, Number.parseInt(selectedValue, 10) || 1));
        const options = [];
        for (let i = 1; i <= 8; i += 1) {
            options.push(`<option value="${i}"${i === selected ? ' selected' : ''}>Element ${i}</option>`);
        }
        return options.join('');
    };

    DWMControl.prototype._renderElementTypeOptions = function(selectedType) {
        const active = String(selectedType || '30ua').toLowerCase();
        const options = ['30ua', '100ua'];
        return options.map(t => `<option value="${t}"${active === t ? ' selected' : ''}>${t}</option>`).join('');
    };

    DWMControl.prototype._renderElementProfileOptions = function(record, selectedValue) {
        const selected = Math.max(1, Math.min(8, Number.parseInt(selectedValue, 10) || 1));
        const profiles = Array.isArray(record?.elementProfiles) ? record.elementProfiles : [];
        if (!profiles.length) {
            return this._renderElementOptions(selected);
        }

        return profiles.map(profile => {
            const elem = Number.parseInt(profile.elem, 10);
            const rating = Number.parseFloat(profile.eval);
            const type = String(profile.etype || '--').toLowerCase();
            const elemSafe = Number.isFinite(elem) ? elem : 1;
            const { scaled, unit } = this.scalePower(rating);
            const digits = Math.abs(scaled) >= 100 ? 0 : (Math.abs(scaled) >= 10 ? 1 : 2);
            const ratingStr = Number.isFinite(rating) ? `${scaled.toFixed(digits)} ${unit}` : '--';
            const label = `Element ${elemSafe} - ${ratingStr} - ${type}`;
            const isSel = elemSafe === selected;
            return `<option value="${elemSafe}"${isSel ? ' selected' : ''}>${label}</option>`;
        }).join('');
    };

    DWMControl.prototype._delayMs = function(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    };

    DWMControl.prototype._getGlobalTimingMs = function() {
        const cfg = this.config || {};
        const candidates = [cfg.globalTimingMs, cfg.globalSampleIntervalMs, cfg.globalApiPacingMs, 250];
        for (const candidate of candidates) {
            const ms = Number.parseInt(candidate, 10);
            if (Number.isFinite(ms) && ms >= 50 && ms <= 2000) return ms;
        }
        return 250;
    };

    // Returns a palette object that adapts to the current light/dark theme.
    DWMControl.prototype._getCanvasPalette = function() {
        const dark = document.documentElement.getAttribute('data-theme') !== 'light';
        return dark ? {
            bg:           '#0b0f18',
            bgGrad1:      '#0b0f18',
            bgGrad2:      '#111827',
            plotBg:       'rgba(0,0,0,0.18)',
            border:       'rgba(255,255,255,0.12)',
            needle:       '#f1f5f9',
            pivotOuter:   '#cbd5e1',
            pivotMid:     '#1e293b',
            pivotInner:   '#94a3b8',
            digBg:        'rgba(0,0,0,0.45)',
            digSep:       'rgba(255,255,255,0.05)',
            readout:      '#f8fafc',
            tickMaj:      'rgba(255,255,255,0.95)',
            tickMin:      'rgba(255,255,255,0.45)',
            tickFine:     'rgba(255,255,255,0.22)',
            divider:      'rgba(255,255,255,0.7)',
            gridLine:     'rgba(255,255,255,0.08)',
            gridLineFaint:'rgba(255,255,255,0.06)',
            axisLabel:    'rgba(255,255,255,0.7)',
            axisLabelFaint:'rgba(255,255,255,0.65)',
            noData:       'rgba(255,255,255,0.35)',
            plotBorder:   'rgba(255,255,255,0.18)',
            zones: [
                { from: 0,    to: 0.60, dim: '#14532d', bright: '#16a34a' },
                { from: 0.60, to: 0.80, dim: '#78350f', bright: '#d97706' },
                { from: 0.80, to: 1.00, dim: '#7f1d1d', bright: '#ef4444' },
            ],
            zoneLabel: p => p >= 0.80 ? '#fca5a5' : p >= 0.60 ? '#fde68a' : '#86efac',
            zoneColor:  p => p >= 0.80 ? '#f87171' : p >= 0.60 ? '#fbbf24' : '#4ade80',
            histColors: { inst:'#a78bfa', avg:'#4a9eff', peak:'#f08030', max:'#f43f5e', min:'#34d399', dev:'#fbbf24' },
        } : {
            bg:           '#f0f4f8',
            bgGrad1:      '#e8edf2',
            bgGrad2:      '#dde3ea',
            plotBg:       '#e5e7eb',
            border:       'rgba(0,0,0,0.12)',
            needle:       '#1e293b',
            pivotOuter:   '#475569',
            pivotMid:     '#f1f5f9',
            pivotInner:   '#64748b',
            digBg:        'rgba(0,0,0,0.06)',
            digSep:       'rgba(0,0,0,0.08)',
            readout:      '#0f172a',
            tickMaj:      'rgba(0,0,0,0.80)',
            tickMin:      'rgba(0,0,0,0.35)',
            tickFine:     'rgba(0,0,0,0.18)',
            divider:      'rgba(0,0,0,0.45)',
            gridLine:     'rgba(0,0,0,0.20)',
            gridLineFaint:'rgba(0,0,0,0.13)',
            axisLabel:    'rgba(0,0,0,0.65)',
            axisLabelFaint:'rgba(0,0,0,0.55)',
            noData:       'rgba(0,0,0,0.30)',
            plotBorder:   'rgba(0,0,0,0.18)',
            zones: [
                { from: 0,    to: 0.60, dim: '#bbf7d0', bright: '#16a34a' },
                { from: 0.60, to: 0.80, dim: '#fef08a', bright: '#ca8a04' },
                { from: 0.80, to: 1.00, dim: '#fecaca', bright: '#dc2626' },
            ],
            zoneLabel: p => p >= 0.80 ? '#b91c1c' : p >= 0.60 ? '#92400e' : '#166534',
            zoneColor:  p => p >= 0.80 ? '#dc2626' : p >= 0.60 ? '#d97706' : '#16a34a',
            histColors: { inst:'#7c3aed', avg:'#2563eb', peak:'#ea580c', max:'#e11d48', min:'#059669', dev:'#d97706' },
        };
    };

    DWMControl.prototype._getGlobalGaugeSmoothing = function() {
        const raw = Number.parseInt(this.config?.globalGaugeSmoothingPct, 10);
        if (!Number.isFinite(raw)) return 70;
        return Math.max(0, Math.min(95, raw));
    };

    DWMControl.prototype._applyGlobalTimingMs = function(ms, options = {}) {
        if (!Number.isFinite(ms) || ms < 10 || ms > 2000) return;

        const persist = options.persist !== false;
        const restartTimers = options.restartTimers !== false;
        this.config.globalTimingMs = ms;
        this.config.globalSampleIntervalMs = ms;
        this.config.globalApiPacingMs = ms;

        for (const [key, record] of this.meterRegistry) {
            if (!record?.state) continue;
            record.state.pollIntervalMs = ms;
            if (restartTimers && record.state.monitorTimer) {
                clearInterval(record.state.monitorTimer);
                record.state.monitorTimer = window.setInterval(() => {
                    this.pollMeterSnapshot(key);
                }, ms);
                this.setMeterStatus(key, `${ms}ms polling active. Snapshot data is updating live.`, 'active');
            }
        }

        if (persist) this.saveConfig();
    };

    DWMControl.prototype._setGlobalSettingsPanelVisible = function(visible) {
        const shell = document.getElementById('meter-page-shell');
        if (!shell) return;

        shell.classList.toggle('settings-open', visible);
        const toggle = document.getElementById('meter-settings-toggle');
        if (toggle) {
            toggle.setAttribute('aria-expanded', visible ? 'true' : 'false');
            toggle.title = visible ? 'Hide settings' : 'Show settings';
        }
        this.config.globalSettingsPanelVisible = visible;
        this.saveConfig();
    };

    DWMControl.prototype._parseElementProfiles = function(response) {
        const profiles = [];
        for (let i = 1; i <= 8; i += 1) {
            const evalW = Number.parseFloat(response?.[`e${i}v`]);
            const etype = String(response?.[`e${i}t`] || '30ua').toLowerCase();
            profiles.push({
                elem: i,
                eval: Number.isFinite(evalW) ? evalW : 0,
                etype: etype || '30ua',
            });
        }
        return profiles;
    };

    DWMControl.prototype._getAllowedElementRatings = function() {
        const ratings = [];
        const seeds = [1, 2.5, 5];
        for (let exp = -2; exp <= 5; exp += 1) {
            const mult = Math.pow(10, exp);
            seeds.forEach(seed => {
                const value = Number.parseFloat((seed * mult).toPrecision(10));
                if (value >= 0.01 && value <= 500000) ratings.push(value);
            });
        }
        return [...new Set(ratings)].sort((a, b) => a - b);
    };

    DWMControl.prototype._renderElementRatingOptions = function(selectedValue) {
        const selected = Number.parseFloat(selectedValue);
        const ratings = this._getAllowedElementRatings();
        return ratings.map(value => {
            const isSel = Number.isFinite(selected) && Math.abs(value - selected) <= Math.max(1e-9, value * 1e-9);
            const { scaled, unit } = this.scalePower(value);
            const digits = Math.abs(scaled) >= 100 ? 0 : (Math.abs(scaled) >= 10 ? 1 : 2);
            return `<option value="${value}"${isSel ? ' selected' : ''}>${scaled.toFixed(digits)} ${unit}</option>`;
        }).join('');
    };

    DWMControl.prototype._renderPepHoldOptions = function(selectedMs) {
        const selected = Number.isFinite(selectedMs) ? Math.max(0, Math.min(2000, selectedMs)) : 1000;
        const options = [];
        for (let ms = 0; ms <= 2000; ms += 100) {
            const sec = (ms / 1000).toFixed(1);
            const label = `${sec} s`;
            options.push(`<option value="${ms}"${ms === selected ? ' selected' : ''}>${label}</option>`);
        }
        return options.join('');
    };

    // Convert a meter key to a safe DOM ID segment (e.g. "usbmodem:1234" → "usbmodem-1234")
    DWMControl.prototype.meterSafeId = function(key) {
        return key.replace(/[^a-zA-Z0-9]/g, '-');
    };

    // Get a scoped DOM element for a specific meter card
    DWMControl.prototype.getMeterEl = function(key, suffix) {
        return document.getElementById(`meter-${this.meterSafeId(key)}-${suffix}`);
    };

    // ─── Board rendering ──────────────────────────────────────────────────────

    DWMControl.prototype.renderDeviceControlUI = function() {
        const panel = document.getElementById('control-panel');
        if (!panel) return;
        const timingMs = this._getGlobalTimingMs();
        const smoothingPct = this._getGlobalGaugeSmoothing();
        const panelVisible = Boolean(this.config.globalSettingsPanelVisible);
        const autoStartPolling = this.config.globalAutoStartPolling !== false;
        panel.innerHTML = `
            <div class="meter-page-shell${panelVisible ? ' settings-open' : ''}" id="meter-page-shell">
                <div class="meter-page-main">
                    <div class="meter-board" id="meter-board">
                        <div class="meter-board-empty" id="meter-board-empty">
                            <p>No DWM meters detected.</p>
                            <p class="muted">Connect a DWM V2 via USB — the board will populate automatically.</p>
                        </div>
                    </div>
                </div>
                <div class="meter-settings-rail" id="meter-settings-rail">
                    <button class="meter-settings-rail-btn" id="meter-settings-toggle"
                        aria-expanded="${panelVisible ? 'true' : 'false'}"
                        title="${panelVisible ? 'Hide settings' : 'Show settings'}">&#x276F;</button>
                </div>
                <aside class="meter-settings-panel" id="meter-settings-panel" aria-label="Global settings">
                    <div class="meter-settings-panel-header">Global Settings</div>
                    <div class="meter-settings-group">
                        <label class="meter-global-toolbar-label" for="global-timing-ms">Refresh Rate (ms)</label>
                        <input type="number" id="global-timing-ms" class="form-control form-control-sm"
                            min="10" max="2000" step="10" value="${timingMs}">
                    </div>
                    <div class="meter-settings-group">
                        <label class="meter-global-toolbar-label" for="global-gauge-smoothing">Gauge Smoothing (%)</label>
                        <input type="range" id="global-gauge-smoothing" min="0" max="95" step="5" value="${smoothingPct}">
                        <span id="global-gauge-smoothing-value" class="meter-settings-value">${smoothingPct}%</span>
                    </div>
                    <div class="meter-settings-group">
                        <label class="meter-settings-checkbox">
                            <input type="checkbox" id="global-auto-start-poll" ${autoStartPolling ? 'checked' : ''}>
                            Auto-start polling when a meter connects
                        </label>
                    </div>
                </aside>
            </div>
        `;

        const settingsToggle = document.getElementById('meter-settings-toggle');
        if (settingsToggle) {
            settingsToggle.addEventListener('click', () => {
                const visible = !document.getElementById('meter-page-shell')?.classList.contains('settings-open');
                this._setGlobalSettingsPanelVisible(Boolean(visible));
            });
        }

        const timingInput = document.getElementById('global-timing-ms');
        if (timingInput) {
            timingInput.addEventListener('change', () => {
                const ms = Number.parseInt(timingInput.value, 10);
                if (!Number.isFinite(ms) || ms < 10 || ms > 2000) {
                    timingInput.value = String(this._getGlobalTimingMs());
                    return;
                }
                this._applyGlobalTimingMs(ms, { persist: true, restartTimers: true });
            });
        }

        const smoothingInput = document.getElementById('global-gauge-smoothing');
        const smoothingValue = document.getElementById('global-gauge-smoothing-value');
        if (smoothingInput && smoothingValue) {
            const updateSmoothing = () => {
                const pct = Math.max(0, Math.min(95, Number.parseInt(smoothingInput.value, 10) || 0));
                this.config.globalGaugeSmoothingPct = pct;
                smoothingValue.textContent = `${pct}%`;
                this.saveConfig();
            };
            smoothingInput.addEventListener('input', updateSmoothing);
            smoothingInput.addEventListener('change', updateSmoothing);
        }

        const autoStartInput = document.getElementById('global-auto-start-poll');
        if (autoStartInput) {
            autoStartInput.addEventListener('change', () => {
                this.config.globalAutoStartPolling = Boolean(autoStartInput.checked);
                this.saveConfig();
            });
        }

        this._applyGlobalTimingMs(timingMs, { persist: false, restartTimers: false });
        this._initDragDrop();
    };

    // ─── Drag-and-drop card ordering ──────────────────────────────────────────

    DWMControl.prototype._initDragDrop = function() {
        const board = document.getElementById('meter-board');
        if (!board) return;

        let dragSrcKey = null;
        let dragSrcEl  = null;

        board.addEventListener('dragstart', (e) => {
            const card = e.target.closest('.meter-card');
            if (!card) return;
            // Only start drag when the handle is the origin
            if (!e.target.closest('.meter-drag-handle')) { e.preventDefault(); return; }
            dragSrcKey = card.dataset.meterKey;
            dragSrcEl  = card;
            card.classList.add('meter-card-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', dragSrcKey);
        });

        board.addEventListener('dragend', () => {
            if (dragSrcEl) dragSrcEl.classList.remove('meter-card-dragging');
            board.querySelectorAll('.meter-card-drag-over').forEach(el =>
                el.classList.remove('meter-card-drag-over')
            );
            dragSrcKey = null;
            dragSrcEl  = null;
        });

        board.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const target = e.target.closest('.meter-card');
            board.querySelectorAll('.meter-card-drag-over').forEach(el =>
                el.classList.remove('meter-card-drag-over')
            );
            if (target && target.dataset.meterKey !== dragSrcKey) {
                target.classList.add('meter-card-drag-over');
            }
        });

        board.addEventListener('dragleave', (e) => {
            if (!board.contains(e.relatedTarget)) {
                board.querySelectorAll('.meter-card-drag-over').forEach(el =>
                    el.classList.remove('meter-card-drag-over')
                );
            }
        });

        board.addEventListener('drop', (e) => {
            e.preventDefault();
            const target = e.target.closest('.meter-card');
            if (!target || !dragSrcKey) return;
            const destKey = target.dataset.meterKey;
            if (destKey === dragSrcKey) return;

            // Reorder the DOM
            const cards = [...board.querySelectorAll('.meter-card')];
            const srcIndex  = cards.findIndex(c => c.dataset.meterKey === dragSrcKey);
            const destIndex = cards.findIndex(c => c.dataset.meterKey === destKey);
            if (srcIndex < 0 || destIndex < 0) return;

            if (srcIndex < destIndex) {
                board.insertBefore(dragSrcEl, target.nextSibling);
            } else {
                board.insertBefore(dragSrcEl, target);
            }

            // Persist new order
            const newOrder = [...board.querySelectorAll('.meter-card')].map(c => c.dataset.meterKey);
            this.config.meterCardOrder = newOrder;
            this.saveConfig();
        });
    };

    DWMControl.prototype.refreshMeterBoard = function() {
        const board = document.getElementById('meter-board');
        if (!board) return;

        const order = Array.isArray(this.config.meterCardOrder) ? this.config.meterCardOrder : [];
        const emptyEl = document.getElementById('meter-board-empty');

        if (order.length === 0) {
            if (emptyEl) emptyEl.style.display = '';
            // Remove any stale cards
            board.querySelectorAll('.meter-card').forEach(el => el.remove());
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';

        const existingKeys = new Set(
            [...board.querySelectorAll('.meter-card')].map(el => el.dataset.meterKey)
        );

        // Remove cards for meters no longer in the registry
        existingKeys.forEach(key => {
            if (!this.meterRegistry.has(key)) {
                const el = document.querySelector(`.meter-card[data-meter-key="${CSS.escape(key)}"]`);
                if (el) el.remove();
            }
        });

        // Add or update cards in order
        order.forEach((key, index) => {
            const record = this.meterRegistry.get(key);
            if (!record) return;

            let cardEl = document.querySelector(`.meter-card[data-meter-key="${CSS.escape(key)}"]`);
            if (!cardEl) {
                // Insert new card
                const html = this.renderMeterCard(record);
                const wrapper = document.createElement('div');
                wrapper.innerHTML = html;
                cardEl = wrapper.firstElementChild;
                board.insertBefore(cardEl, board.children[index] || null);
                // Apply initial layout panel visibility (handles non-default stored layouts)
                if (record.state?.cardLayout && record.state.cardLayout !== 'dual') {
                    this._setMeterCardLayout(record.key, record.state.cardLayout);
                }
            } else {
                // Update dynamic fields only (don't re-render — avoid losing input state)
                this.updateMeterCardUI(key);
            }
        });
    };

    DWMControl.prototype.renderMeterCard = function(record) {
        const sid = this.meterSafeId(record.key);
        const isConnected = record.connectionState === 'connected';
        const badgeClass = isConnected ? 'connected' : (record.connectionState === 'disconnected' ? 'disconnected' : 'available');
        const badgeText = isConnected ? 'Connected' : (record.connectionState === 'disconnected' ? 'Disconnected' : 'Available');
        const portLabel = record.portPath || '-';
        const nameLabel = record.friendlyName || 'DWM V2';
        const uidLabel = record.apiUid || record.fallbackUid || '-';
        const gaugeMetricL = record.gaugeMetricL || 'avg';
        const gaugeMetricR = record.gaugeMetricR || 'peak';
        const gaugeDisplayL = record.gaugeDisplayL || 'gauge';
        const gaugeDisplayR = record.gaugeDisplayR || 'gauge';
        const pepHoldMs = Number.isFinite(record.pepHoldMs) ? Math.max(0, record.pepHoldMs) : 1000;
        const selectedElem = Number.parseInt(record.elementId, 10) || 1;
        const selectedEval = Number.isFinite(record.elementRating) && record.elementRating > 0 ? record.elementRating : 100;
        const selectedRangeCfg = Number.parseInt(record.rangeCfg, 10) === 1 || Number.parseInt(record.rangeMultiplier, 10) === 4 ? 1 : 0;
        const selectedEtype = String(record.elementType || '30ua').toLowerCase();
        const histWindowMs = record.state?.historyWindowMs || 30000;
        const histLines    = record.state?.historyLines || ['avg', 'peak'];
        const cardLayout   = record.state?.cardLayout || 'dual';
        const HIST_META = [
            { key: 'inst', label: 'INST' },
            { key: 'avg',  label: 'AVG'  },
            { key: 'peak', label: 'PEP'  },
            { key: 'max',  label: 'MAX'  },
            { key: 'min',  label: 'MIN'  },
            { key: 'dev',  label: 'DEV'  },
        ];

        return `
<div class="meter-card" data-meter-key="${record.key}" id="meter-card-${sid}" draggable="true">
  <div class="meter-card-header">
    <span class="meter-drag-handle" title="Drag to reorder">&#8942;</span>
    <div class="meter-card-identity">
      <span class="meter-card-name meter-name-editable" id="meter-${sid}-header-name" title="Click to rename">${nameLabel}</span>
      <span class="meter-chip meter-chip-uid" id="meter-${sid}-header-uid">${uidLabel}</span>
      <span class="meter-chip meter-chip-port">${portLabel}</span>
    </div>
    <div class="meter-card-header-right">
      <span class="meter-badge meter-badge-${badgeClass}" id="meter-${sid}-badge">${badgeText}</span>
      <button class="btn btn-primary btn-small" data-meter-action="connect" ${isConnected ? 'disabled' : ''}>Connect</button>
      <button class="btn btn-secondary btn-small" data-meter-action="disconnect" ${!isConnected ? 'disabled' : ''}>Disconnect</button>
            <button class="btn btn-secondary btn-small" data-meter-action="identify-meter" ${!isConnected ? 'disabled' : ''}>Identify</button>
    </div>
  </div>

  <div class="meter-live-section" id="meter-${sid}-readings-bar" style="${isConnected ? '' : 'display:none'}">
    <div class="meter-live-toolbar">
      <div class="meter-live-toolbar-left">
        <div class="meter-view-toggle">
          <button class="meter-view-btn active" data-meter-action="view-meters">Meters</button>
          <button class="meter-view-btn" data-meter-action="view-history">History</button>
        </div>
        <div class="meter-layout-picker" id="meter-${sid}-layout-picker">
          <button class="meter-layout-btn${cardLayout === 'dual'       ? ' active' : ''}" data-meter-action="layout-dual"       title="Dual gauges">⊞</button>
          <button class="meter-layout-btn${cardLayout === 'single-L'   ? ' active' : ''}" data-meter-action="layout-single-L"   title="Left gauge only">⬜</button>
          <button class="meter-layout-btn${cardLayout === 'single-R'   ? ' active' : ''}" data-meter-action="layout-single-R"   title="Right gauge only">⬜</button>
          <button class="meter-layout-btn${cardLayout === 'wide-left'  ? ' active' : ''}" data-meter-action="layout-wide-left"  title="Wide left gauge">⬛</button>
          <button class="meter-layout-btn${cardLayout === 'wide-right' ? ' active' : ''}" data-meter-action="layout-wide-right" title="Wide right gauge">⬛</button>
          <button class="meter-layout-btn${cardLayout === 'stacked'    ? ' active' : ''}" data-meter-action="layout-stacked"    title="Stacked gauges">⏥</button>
        </div>
        <div class="meter-chart-actions">
                    <button class="btn btn-secondary btn-small" data-meter-action="export-history">Export Data</button>
        </div>
      </div>
      <div class="meter-poll-controls">
        <button class="btn btn-primary btn-small" data-meter-action="start-poll" ${!isConnected ? 'disabled' : ''}>Start Poll</button>
        <button class="btn btn-text btn-small" data-meter-action="stop-poll" disabled>Stop</button>
      </div>
    </div>
    <div class="meter-elem-info-bar" id="meter-${sid}-elem-info-bar">
            <div class="meter-elem-inline-group meter-elem-profile-group">
                <span class="meter-elem-inline-label">Element Profile</span>
                <select id="meter-${sid}-cfg-elem" class="form-select form-select-sm">${this._renderElementProfileOptions(record, selectedElem)}</select>
                <button class="btn btn-secondary btn-small" data-meter-action="refresh-element-profiles" ${!isConnected ? 'disabled' : ''}>Refresh Elements</button>
            </div>
            <div class="meter-elem-inline-group">
                <span class="meter-elem-inline-label">Current Rating</span>
                <select id="meter-${sid}-cfg-eval" class="form-select form-select-sm">${this._renderElementRatingOptions(selectedEval)}</select>
            </div>
            <div class="meter-elem-inline-group">
                <span class="meter-elem-inline-label">Current Type</span>
                <select id="meter-${sid}-cfg-etype" class="form-select form-select-sm">${this._renderElementTypeOptions(selectedEtype)}</select>
            </div>
            <div class="meter-elem-inline-group">
                <span class="meter-elem-inline-label">Max Range</span>
                <select id="meter-${sid}-cfg-range" class="form-select form-select-sm">
                    <option value="0"${selectedRangeCfg === 0 ? ' selected' : ''}>2x</option>
                    <option value="1"${selectedRangeCfg === 1 ? ' selected' : ''}>4x</option>
                </select>
            </div>
    </div>
    <div class="meter-gauges-view" id="meter-${sid}-gauges-view" data-layout="${cardLayout}">
      <div class="meter-gauge-radial-pair">
        <div class="meter-gauge-radial-panel">
                    <div class="meter-gauge-panel-controls">
                        <select class="gauge-metric-select" id="meter-${sid}-gauge-metric-L">
                            <option value="avg"${gaugeMetricL === 'avg' ? ' selected' : ''}>AVG — Average Power</option>
                            <option value="peak"${gaugeMetricL === 'peak' ? ' selected' : ''}>PEP — Peak Envelope</option>
                            <option value="inst"${gaugeMetricL === 'inst' ? ' selected' : ''}>INST — Instantaneous</option>
                            <option value="max"${gaugeMetricL === 'max' ? ' selected' : ''}>MAX — Running Maximum</option>
                            <option value="min"${gaugeMetricL === 'min' ? ' selected' : ''}>MIN — Running Minimum</option>
                            <option value="dev"${gaugeMetricL === 'dev' ? ' selected' : ''}>DEV — Deviation</option>
                        </select>
                        <select class="gauge-display-select" id="meter-${sid}-gauge-display-L">
                            <option value="gauge"${gaugeDisplayL === 'gauge' ? ' selected' : ''}>Gauge + Readout</option>
                            <option value="numeric"${gaugeDisplayL === 'numeric' ? ' selected' : ''}>Large Numeric</option>
                        </select>
                    </div>
          <canvas id="meter-${sid}-gauge-canvas-L" class="meter-gauge-radial-canvas"></canvas>
        </div>
        <div class="meter-gauge-radial-panel">
                    <div class="meter-gauge-panel-controls">
                        <select class="gauge-metric-select" id="meter-${sid}-gauge-metric-R">
                            <option value="avg"${gaugeMetricR === 'avg' ? ' selected' : ''}>AVG — Average Power</option>
                            <option value="peak"${gaugeMetricR === 'peak' ? ' selected' : ''}>PEP — Peak Envelope</option>
                            <option value="inst"${gaugeMetricR === 'inst' ? ' selected' : ''}>INST — Instantaneous</option>
                            <option value="max"${gaugeMetricR === 'max' ? ' selected' : ''}>MAX — Running Maximum</option>
                            <option value="min"${gaugeMetricR === 'min' ? ' selected' : ''}>MIN — Running Minimum</option>
                            <option value="dev"${gaugeMetricR === 'dev' ? ' selected' : ''}>DEV — Deviation</option>
                        </select>
                        <select class="gauge-display-select" id="meter-${sid}-gauge-display-R">
                            <option value="gauge"${gaugeDisplayR === 'gauge' ? ' selected' : ''}>Gauge + Readout</option>
                            <option value="numeric"${gaugeDisplayR === 'numeric' ? ' selected' : ''}>Large Numeric</option>
                        </select>
                    </div>
          <canvas id="meter-${sid}-gauge-canvas-R" class="meter-gauge-radial-canvas"></canvas>
        </div>
      </div>
    </div>
    <div class="meter-history-view" id="meter-${sid}-history-view" style="display:none">
      <div class="meter-history-toolbar">
        <div class="meter-history-legend" id="meter-${sid}-history-legend">
          ${HIST_META.map(({ key, label }) => {
              const checked  = histLines.includes(key);
              const atMax    = histLines.length >= 4;
              const disabled = !checked && atMax;
              return `<label class="meter-hist-line-toggle meter-hist-${key}${checked ? ' active' : ''}${disabled ? ' disabled' : ''}" data-metric="${key}">` +
                     `<input type="checkbox" class="meter-history-line-check" id="meter-${sid}-history-line-${key}" data-metric="${key}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}> ${label}` +
                     `</label>`;
          }).join('')}
        </div>
        <div class="meter-range-frame">
          <span class="meter-range-label">Time</span>
          <select class="meter-history-range-select" id="meter-${sid}-history-range">
          <option value="2000">2 s</option>
          <option value="5000">5 s</option>
          <option value="10000">10 s</option>
          <option value="30000"${histWindowMs === 30000 ? ' selected' : ''}>30 s</option>
          <option value="60000"${histWindowMs === 60000 ? ' selected' : ''}>1 min</option>
          <option value="300000"${histWindowMs === 300000 ? ' selected' : ''}>5 min</option>
          <option value="600000"${histWindowMs === 600000 ? ' selected' : ''}>10 min</option>
          <option value="1800000"${histWindowMs === 1800000 ? ' selected' : ''}>30 min</option>
          <option value="3600000"${histWindowMs === 3600000 ? ' selected' : ''}>1 hr</option>
          <option value="21600000"${histWindowMs === 21600000 ? ' selected' : ''}>6 hr</option>
          <option value="43200000"${histWindowMs === 43200000 ? ' selected' : ''}>12 hr</option>
          <option value="86400000"${histWindowMs === 86400000 ? ' selected' : ''}>24 hr</option>
          <option value="172800000"${histWindowMs === 172800000 ? ' selected' : ''}>48 hr</option>
        </select>
        </div>
      </div>
      <canvas id="meter-${sid}-history-canvas" class="meter-history-canvas"></canvas>
    </div>
    <span id="meter-${sid}-inst" style="display:none"></span>
  </div>

  <div class="meter-card-expand-row">
    <button class="btn btn-text btn-small meter-expand-btn" data-meter-action="toggle-expand">
      <span class="meter-expand-label">Show Details</span>
    </button>
  </div>

  <div class="meter-card-detail" id="meter-${sid}-detail" style="display:none">

    <div id="meter-${sid}-status" class="control-status-banner warning">
      ${isConnected ? 'Connected. Use Refresh All or individual actions to query the device.' : 'Connect to this meter to use the control API.'}
    </div>

    <div class="meter-detail-toolbar">
      <button class="btn btn-primary btn-small" data-meter-action="refresh-all" ${!isConnected ? 'disabled' : ''}>Refresh All</button>
    </div>

    <div class="meter-detail-section">
      <h4 class="meter-detail-heading">Identity</h4>
      <div class="control-info-grid compact">
        <div class="control-info-item"><span class="control-info-label">UID</span><span id="meter-${sid}-uid" class="control-info-value control-mono">-</span></div>
        <div class="control-info-item"><span class="control-info-label">Device Name</span><span id="meter-${sid}-dname" class="control-info-value">-</span></div>
        <div class="control-info-item"><span class="control-info-label">Last API Frame</span><span id="meter-${sid}-last-frame" class="control-info-value">No frames yet</span></div>
      </div>
    </div>

    <div class="meter-detail-section">
      <h4 class="meter-detail-heading">Device Name</h4>
      <div class="form-group">
        <div class="input-group">
          <input id="meter-${sid}-name-input" class="form-input" type="text" placeholder="bench_meter_a" maxlength="64">
          <button class="btn btn-secondary btn-small" data-meter-action="load-name" ${!isConnected ? 'disabled' : ''}>Load</button>
          <button class="btn btn-primary btn-small" data-meter-action="save-name" ${!isConnected ? 'disabled' : ''}>Save</button>
        </div>
        <p class="control-helper-text">No whitespace — USB API uses space-delimited tokens.</p>
      </div>
    </div>

    <div class="meter-detail-section">
      <h4 class="meter-detail-heading">Supported Commands</h4>
      <button class="btn btn-secondary btn-small" data-meter-action="refresh-commands" ${!isConnected ? 'disabled' : ''}>
        <span class="btn-icon">&#8635;</span> Read Commands
      </button>
      <div id="meter-${sid}-commands" class="control-chip-list">
        <span class="control-chip muted">No command list loaded</span>
      </div>
    </div>

    <div class="meter-detail-section">
      <h4 class="meter-detail-heading">Power Configuration</h4>
      <button class="btn btn-secondary btn-small" data-meter-action="refresh-power-info" style="margin-bottom:8px" ${!isConnected ? 'disabled' : ''}>Refresh</button>
      <div class="control-info-grid compact">
        <div class="control-info-item"><span class="control-info-label">Element</span><span id="meter-${sid}-pinfo-elem" class="control-info-value">-</span></div>
        <div class="control-info-item"><span class="control-info-label">Type</span><span id="meter-${sid}-pinfo-etype" class="control-info-value">-</span></div>
        <div class="control-info-item"><span class="control-info-label">Element Value</span><span id="meter-${sid}-pinfo-eval" class="control-info-value">-</span></div>
        <div class="control-info-item"><span class="control-info-label">Range</span><span id="meter-${sid}-pinfo-range" class="control-info-value">-</span></div>
        <div class="control-info-item"><span class="control-info-label">Averaging</span><span id="meter-${sid}-pinfo-avgw" class="control-info-value">-</span></div>
      </div>
    </div>

    <div class="meter-detail-section">
      <h4 class="meter-detail-heading">Metric Probe</h4>
      <div class="input-group" style="margin-bottom:8px">
        <select id="meter-${sid}-metric-select" class="form-select">
          <option value="inst">instantaneous</option>
          <option value="avg">average</option>
          <option value="peak">peak</option>
          <option value="max">maximum</option>
          <option value="min">minimum</option>
          <option value="dev">deviation</option>
        </select>
                <span id="meter-${sid}-metric-loading" class="control-helper-text" style="display:none; align-self:center; margin-left:8px;">Reading...</span>
      </div>
      <div class="control-metric-readout">
        <span id="meter-${sid}-metric-name" class="control-metric-name">-</span>
        <span id="meter-${sid}-metric-value" class="control-metric-value control-mono">-</span>
      </div>
    </div>

    <div class="meter-detail-section">
      <h4 class="meter-detail-heading">Power Snapshot</h4>
      <div class="meter-snapshot-toolbar">
        <button class="btn btn-secondary btn-small" data-meter-action="refresh-snapshot" ${!isConnected ? 'disabled' : ''}>Refresh</button>
        <button class="btn btn-primary btn-small" data-meter-action="start-monitor" id="meter-${sid}-start-monitor" ${!isConnected ? 'disabled' : ''}>Start Poll</button>
        <button class="btn btn-text btn-small" data-meter-action="stop-monitor" id="meter-${sid}-stop-monitor" disabled>Stop</button>
      </div>
            <div class="meter-snapshot-settings">
                <label class="control-helper-text" for="meter-${sid}-pep-hold-select">PEP Hold Time</label>
                <select id="meter-${sid}-pep-hold-select" class="form-select form-select-sm">
                    ${this._renderPepHoldOptions(pepHoldMs)}
                </select>
            </div>
      <div class="power-dashboard compact">
        <div class="power-meters-grid">
          ${['inst','avg','peak','max','min','dev'].map(m => `
          <div class="power-meter">
            <div class="power-meter-header">
              <span class="power-meter-label">${m.toUpperCase()}</span>
              <span class="power-meter-unit">W</span>
            </div>
            <div class="power-bar-container">
              <div class="power-bar">
                <div id="meter-${sid}-fill-${m}" class="power-bar-fill low-power" style="width:0%"></div>
                <div class="power-bar-gradient"></div>
              </div>
              <span id="meter-${sid}-snap-${m}" class="power-value">0.000000</span>
            </div>
          </div>`).join('')}
        </div>
        <div class="control-snapshot-meta">
          <div class="control-info-item"><span class="control-info-label">Power Voltage</span><span id="meter-${sid}-pvolt" class="control-info-value control-mono">-</span></div>
          <div class="control-info-item"><span class="control-info-label">Supply Voltage</span><span id="meter-${sid}-svolt" class="control-info-value control-mono">-</span></div>
          <div class="control-info-item"><span class="control-info-label">Element</span><span id="meter-${sid}-snap-elem" class="control-info-value control-mono">-</span></div>
          <div class="control-info-item"><span class="control-info-label">Element Type</span><span id="meter-${sid}-snap-etype" class="control-info-value control-mono">-</span></div>
          <div class="control-info-item"><span class="control-info-label">Element Value</span><span id="meter-${sid}-snap-eval" class="control-info-value control-mono">-</span></div>
          <div class="control-info-item"><span class="control-info-label">Range</span><span id="meter-${sid}-snap-range" class="control-info-value control-mono">-</span></div>
          <div class="control-info-item"><span class="control-info-label">Scale</span><span id="meter-${sid}-snap-scale" class="control-info-value control-mono">0.000000 W</span></div>
          <div class="control-info-item"><span class="control-info-label">Updated</span><span id="meter-${sid}-snap-updated" class="control-info-value">Never</span></div>
        </div>
      </div>
    </div>

    <div class="meter-detail-section">
      <h4 class="meter-detail-heading">Configuration (cfg.set)</h4>
      <div class="control-info-grid compact">
        <div class="control-info-item"><span class="control-info-label">Backlight (0-10)</span></div>
        <div class="control-info-item"><div class="input-group"><input id="meter-${sid}-cfg-bright" class="form-input" type="number" min="0" max="10" step="1" placeholder="0-10"><button class="btn btn-secondary btn-small" data-meter-action="cfg-bright" ${!isConnected ? 'disabled' : ''}>Set</button></div></div>
                <div class="control-info-item"><span class="control-info-label">Max Range</span></div>
                <div class="control-info-item"><div class="input-group"><select id="meter-${sid}-cfg-range-readonly" class="form-select" disabled><option value="0"${selectedRangeCfg === 0 ? ' selected' : ''}>2x</option><option value="1"${selectedRangeCfg === 1 ? ' selected' : ''}>4x</option></select><span class="control-helper-text">Set from the top bar.</span></div></div>
        <div class="control-info-item"><span class="control-info-label">Averaging (0.5-10 s)</span></div>
        <div class="control-info-item"><div class="input-group"><input id="meter-${sid}-cfg-avgw" class="form-input" type="number" min="0.5" max="10" step="0.5" placeholder="0.5-10"><button class="btn btn-secondary btn-small" data-meter-action="cfg-avgw" ${!isConnected ? 'disabled' : ''}>Set</button></div></div>
      </div>
      <p id="meter-${sid}-cfg-status" class="control-helper-text"></p>
    </div>

    <div class="meter-detail-section">
      <h4 class="meter-detail-heading">System Actions</h4>
      <div class="meter-sys-actions">
        <div class="meter-sys-action-row">
          <button class="btn btn-secondary btn-small" data-meter-action="sys-save" ${!isConnected ? 'disabled' : ''}>Save Config</button>
          <span class="control-helper-text">Persist current in-memory configuration to non-volatile storage (sys.save).</span>
        </div>
        <div class="meter-sys-action-row">
          <button class="btn btn-danger btn-small" data-meter-action="sys-rst" ${!isConnected ? 'disabled' : ''}>Reboot</button>
          <span class="control-helper-text">Reboot the meter immediately (sys.rst). The app will auto-reconnect.</span>
        </div>
        <div class="meter-sys-action-row">
          <button class="btn btn-danger btn-small" data-meter-action="sys-dfu" ${!isConnected ? 'disabled' : ''}>Enter DFU Mode</button>
          <span class="control-helper-text">Reboot into firmware update (DFU) mode (sys.dfu). Switch to the Firmware tab to upload.</span>
        </div>
      </div>
      <p id="meter-${sid}-sys-status" class="control-helper-text"></p>
    </div>

    <div class="meter-detail-section">
      <h4 class="meter-detail-heading">USB Debug Console</h4>
            <div class="meter-raw-debug-toolbar">
                <textarea id="meter-${sid}-raw-command" class="control-debug-input" spellcheck="false" placeholder="Paste a raw command here, e.g. proto=1 type=req cmd=sys.flt\r\n"></textarea>
                <div class="meter-raw-debug-actions">
                    <button class="btn btn-secondary btn-small" data-meter-action="send-raw" ${!isConnected ? 'disabled' : ''}>Send Raw</button>
                    <span class="control-helper-text">Escapes like \r, \n, \t and \\ are decoded before send. RX appears below.</span>
                </div>
            </div>
      <button class="btn btn-text btn-small" data-meter-action="debug-clear" style="margin-bottom:4px">Clear</button>
      <textarea id="meter-${sid}-debug" class="control-debug-console" readonly></textarea>
    </div>

  </div>
</div>`;
    };

    // ─── Event setup ──────────────────────────────────────────────────────────

    DWMControl.prototype.setupDeviceControlEvents = function() {
        const board = document.getElementById('control-panel');
        if (!board) return;

        // Event delegation: all actions bubble up to the panel
        board.addEventListener('click', (e) => {
            // Inline name editing — click on the name label
            const nameEl = e.target.closest('.meter-name-editable');
            if (nameEl && !nameEl.querySelector('input')) {
                const cardEl = nameEl.closest('[data-meter-key]');
                if (cardEl) this._startInlineNameEdit(cardEl.dataset.meterKey, nameEl);
                return;
            }
            const btn = e.target.closest('[data-meter-action]');
            if (!btn) return;
            const cardEl = btn.closest('[data-meter-key]');
            if (!cardEl) return;
            const key = cardEl.dataset.meterKey;
            const action = btn.dataset.meterAction;
            this._handleMeterCardAction(key, action, btn);
        });

        board.addEventListener('focusin', (e) => {
            const el = e.target;
            if (!(el instanceof HTMLSelectElement) || !el.id) return;

            const topControlMatch = el.id.match(/^meter-(.+)-cfg-(elem|eval|etype|range)$/);
            if (topControlMatch) {
                const key = this._keyFromSafeId(topControlMatch[1]);
                const record = key ? this.meterRegistry.get(key) : null;
                if (record?.state) record.state.topControlEditingId = el.id;
            }

            const cfgElemMatch = el.id.match(/^meter-(.+)-cfg-elem$/);
            if (!cfgElemMatch) return;

            const key = this._keyFromSafeId(cfgElemMatch[1]);
            const record = key ? this.meterRegistry.get(key) : null;
            if (!key || !record || record.connectionState !== 'connected') return;

            this._pausePollingForElementProfile(key);
        });

        board.addEventListener('focusout', (e) => {
            const el = e.target;
            if (!(el instanceof HTMLSelectElement) || !el.id) return;

            const topControlMatch = el.id.match(/^meter-(.+)-cfg-(elem|eval|etype|range)$/);
            if (topControlMatch) {
                const key = this._keyFromSafeId(topControlMatch[1]);
                const record = key ? this.meterRegistry.get(key) : null;
                if (record?.state && record.state.topControlEditingId === el.id) {
                    record.state.topControlEditingId = null;
                }
            }

            const cfgElemMatch = el.id.match(/^meter-(.+)-cfg-elem$/);
            if (!cfgElemMatch) return;

            const key = this._keyFromSafeId(cfgElemMatch[1]);
            if (key) this._resumePollingForElementProfile(key);
        });

        board.addEventListener('change', async (e) => {
            const sel = e.target;
            if (!sel.id) return;

            // History line metric toggle checkboxes
            if (sel.classList.contains('meter-history-line-check')) {
                const lineMatch = sel.id.match(/^meter-(.+)-history-line-(.+)$/);
                if (lineMatch) {
                    const key    = this._keyFromSafeId(lineMatch[1]);
                    const metric = lineMatch[2];
                    const record = key ? this.meterRegistry.get(key) : null;
                    if (record?.state) {
                        const lines = record.state.historyLines;
                        if (sel.checked) {
                            if (lines.length >= 4) { sel.checked = false; return; }
                            if (!lines.includes(metric)) lines.push(metric);
                        } else {
                            if (lines.length <= 1) { sel.checked = true; return; }
                            const idx = lines.indexOf(metric);
                            if (idx !== -1) lines.splice(idx, 1);
                        }
                        this._updateHistoryLineLegend(key);
                        this._drawMeterHistory(key);
                    }
                }
                return;
            }

            const evalMatch = sel.id.match(/^meter-(.+)-cfg-eval$/);
            if (evalMatch) {
                const key = this._keyFromSafeId(evalMatch[1]);
                const record = key ? this.meterRegistry.get(key) : null;
                if (record?.state) record.state.cfgDraftEval = sel.value;
                if (key && record && record.connectionState === 'connected') {
                    await this.setCfgValue(key, 'eval', sel.id);
                }
            }

            const etypeMatch = sel.id.match(/^meter-(.+)-cfg-etype$/);
            if (etypeMatch) {
                const key = this._keyFromSafeId(etypeMatch[1]);
                const record = key ? this.meterRegistry.get(key) : null;
                if (record?.state) record.state.cfgDraftEtype = sel.value;
                if (key && record && record.connectionState === 'connected') {
                    await this.setCfgValue(key, 'etype', sel.id);
                }
            }
            // Metric probe selector auto-reads selected metric
            const metricProbeMatch = sel.id.match(/^meter-(.+)-metric-select$/);
            if (metricProbeMatch) {
                const key = this._keyFromSafeId(metricProbeMatch[1]);
                const record = key ? this.meterRegistry.get(key) : null;
                if (key && record && record.connectionState === 'connected') {
                    await this.readSinglePowerMetric(key);
                }
            }

            // Gauge metric selectors
            const metricMatch = sel.id.match(/^meter-(.+)-gauge-metric-(L|R)$/);
            if (metricMatch) {
                const key = this._keyFromSafeId(metricMatch[1]);
                const side = metricMatch[2];
                if (key) {
                    const record = this.meterRegistry.get(key);
                    if (record) {
                        if (side === 'L') record.gaugeMetricL = sel.value;
                        else             record.gaugeMetricR = sel.value;
                        if (record.state && record.state.lastSnapshotResponse) {
                            this._updateMeterGauges(key, record.state.lastSnapshotResponse);
                        }
                    }
                }
            }

            // Gauge display mode selectors
            const displayMatch = sel.id.match(/^meter-(.+)-gauge-display-(L|R)$/);
            if (displayMatch) {
                const key = this._keyFromSafeId(displayMatch[1]);
                const side = displayMatch[2];
                if (key) {
                    const record = this.meterRegistry.get(key);
                    if (record) {
                        const mode = sel.value === 'numeric' ? 'numeric' : 'gauge';
                        if (side === 'L') record.gaugeDisplayL = mode;
                        else             record.gaugeDisplayR = mode;
                        if (record.state && record.state.lastSnapshotResponse) {
                            this._updateMeterGauges(key, record.state.lastSnapshotResponse);
                        }
                    }
                }
            }

            // History time-window selector
            const histRangeMatch = sel.id.match(/^meter-(.+)-history-range$/);
            if (histRangeMatch) {
                const key = this._keyFromSafeId(histRangeMatch[1]);
                if (key) {
                    const record = this.meterRegistry.get(key);
                    if (record?.state) {
                        const ms = Number.parseInt(sel.value, 10);
                        if (Number.isFinite(ms) && ms > 0) {
                            record.state.historyWindowMs = ms;
                            this._drawMeterHistory(key);
                        }
                    }
                }
            }

            // PEP hold selector in hidden details
            const pepHoldMatch = sel.id.match(/^meter-(.+)-pep-hold-select$/);
            if (pepHoldMatch) {
                const key = this._keyFromSafeId(pepHoldMatch[1]);
                if (key) {
                    const record = this.meterRegistry.get(key);
                    const holdMs = Number.parseInt(sel.value, 10);
                    if (record) {
                        record.pepHoldMs = Number.isFinite(holdMs) && holdMs >= 0 ? holdMs : 1000;
                        if (record.state) {
                            record.state.pepHeldPeakW = 0;
                            record.state.pepHoldUntilTs = 0;

                            if (record.state.lastSnapshotRaw) {
                                const raw = record.state.lastSnapshotRaw;
                                const displayPeak = this._applyPepHoldValue(key, Number.parseFloat(raw.peak) || 0);
                                const displayResponse = { ...raw, peak: displayPeak };

                                this._updateMeterGauges(key, displayResponse);

                                const scaleMax = record.state.snapshotScaleMax || 1;
                                this.updateSnapshotMeterEl(key, 'peak', displayPeak, scaleMax);
                                const sid = this.meterSafeId(key);
                                const peakEl = document.getElementById(`meter-${sid}-peak`);
                                if (peakEl) {
                                    const displayStr = this.formatPowerWithClip(displayPeak, record?.state?.maxPowerW || 0);
                                    peakEl.textContent = displayStr.split(' ')[0];
                                    const unitEl = document.getElementById(`meter-${sid}-peak-unit`);
                                    if (unitEl) unitEl.textContent = displayStr.split(' ')[1] || 'W';
                                }
                            }
                        }
                    }
                }
            }

            // Auto-apply Element selection changes immediately
            const cfgElemMatch = sel.id.match(/^meter-(.+)-cfg-elem$/);
            if (cfgElemMatch) {
                const key = this._keyFromSafeId(cfgElemMatch[1]);
                const record = key ? this.meterRegistry.get(key) : null;
                if (key && record && record.connectionState === 'connected') {
                    this._pausePollingForElementProfile(key);
                    try {
                        await this.setCfgValue(key, 'elem', sel.id);
                        await this.refreshPowerInfo(key, { quiet: true });
                    } finally {
                        this._resumePollingForElementProfile(key);
                    }
                }
            }

            // Auto-apply Max Range changes immediately
            const cfgRangeMatch = sel.id.match(/^meter-(.+)-cfg-range$/);
            if (cfgRangeMatch) {
                const key = this._keyFromSafeId(cfgRangeMatch[1]);
                const record = key ? this.meterRegistry.get(key) : null;
                if (key && record && record.connectionState === 'connected') {
                    this.setCfgValue(key, 'range', sel.id);
                }
            }
        });

        board.addEventListener('keydown', (e) => {
            const input = e.target;
            if (!(input instanceof HTMLTextAreaElement) || !input.id) return;

            const rawMatch = input.id.match(/^meter-(.+)-raw-command$/);
            if (!rawMatch) return;

            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                const key = this._keyFromSafeId(rawMatch[1]);
                if (key) this.sendRawMeterCommand(key);
            }
        });
    };

    // Reverse lookup: safeId → key (by scanning registry)
    DWMControl.prototype._keyFromSafeId = function(safeId) {
        for (const key of this.meterRegistry.keys()) {
            if (this.meterSafeId(key) === safeId) return key;
        }
        return null;
    };

    DWMControl.prototype._handleMeterCardAction = function(key, action, btn) {
        const record = this.meterRegistry.get(key);
        if (!record) return;

        switch (action) {
            case 'connect': this.connectMeter(key); break;
            case 'disconnect': this.disconnectMeter(key); break;
            case 'identify-meter': this.identifyMeter(key); break;
            case 'toggle-expand': this._toggleMeterExpand(key); break;
            case 'view-meters': this._setMeterView(key, 'meters'); break;
            case 'view-history': this._setMeterView(key, 'history'); break;
            case 'layout-dual':       this._setMeterCardLayout(key, 'dual');       break;
            case 'layout-single-L':   this._setMeterCardLayout(key, 'single-L');   break;
            case 'layout-single-R':   this._setMeterCardLayout(key, 'single-R');   break;
            case 'layout-wide-left':  this._setMeterCardLayout(key, 'wide-left');  break;
            case 'layout-wide-right': this._setMeterCardLayout(key, 'wide-right'); break;
            case 'layout-stacked':    this._setMeterCardLayout(key, 'stacked');    break;
            case 'export-history': this.exportMeterHistory(key); break;
            case 'refresh-all': this.refreshAllMeterData(key); break;
            case 'load-name': this.loadDeviceName(key); break;
            case 'save-name': this.saveDeviceName(key); break;
            case 'refresh-commands': this.refreshSupportedCommands(key); break;
            case 'refresh-element-profiles': this.refreshElementProfiles(key); break;
            case 'refresh-power-info': this.refreshPowerInfo(key); break;
            case 'read-metric': this.readSinglePowerMetric(key); break;
            case 'refresh-snapshot': this.refreshPowerSnapshot(key); break;
            case 'start-poll': this.startMeterMonitoring(key); break;
            case 'stop-poll': // fall-through
            case 'stop-monitor': this.stopMeterMonitoring(key); break;
            case 'start-monitor': this.startMeterMonitoring(key); break;
            case 'send-raw': this.sendRawMeterCommand(key); break;
            case 'sys-save': this.systemSave(key); break;
            case 'sys-rst':  this.systemReset(key); break;
            case 'sys-dfu':  this.systemDfu(key); break;
            case 'debug-clear': this.clearMeterDebug(key); break;
            case 'cfg-bright': this.setCfgValue(key, 'bright', `meter-${this.meterSafeId(key)}-cfg-bright`); break;
            case 'cfg-elem':  this.setCfgValue(key, 'elem',  `meter-${this.meterSafeId(key)}-cfg-elem`);  break;
            case 'cfg-eval':  this.setCfgValue(key, 'eval',  `meter-${this.meterSafeId(key)}-cfg-eval`);  break;
            case 'cfg-etype': this.setCfgValue(key, 'etype', `meter-${this.meterSafeId(key)}-cfg-etype`); break;
            case 'cfg-range': this.setCfgValue(key, 'range', `meter-${this.meterSafeId(key)}-cfg-range`); break;
            case 'cfg-avgw':  this.setCfgValue(key, 'avgw',  `meter-${this.meterSafeId(key)}-cfg-avgw`);  break;
        }
    };

    DWMControl.prototype._startInlineNameEdit = function(key, spanEl) {
        const record = this.meterRegistry.get(key);
        if (!record) return;

        const originalName = record.friendlyName || 'DWM V2';
        let done = false;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalName;
        input.maxLength = 20;
        input.className = 'meter-name-inline-input';

        spanEl.textContent = '';
        spanEl.appendChild(input);
        input.focus();
        input.select();

        const commit = async () => {
            if (done) return;
            done = true;
            const raw = input.value.trim();
            const newName = raw.replace(/\s+/g, '_').slice(0, 20) || originalName;
            spanEl.textContent = newName;

            if (newName !== originalName) {
                record.friendlyName = newName;
                const sid = this.meterSafeId(key);
                const detailInput = document.getElementById(`meter-${sid}-name-input`);
                if (detailInput) detailInput.value = newName;
                if (record.connectionState === 'connected') {
                    try {
                        const resp = await this.sendApiCommand(key, 'sys.nset', { name: newName });
                        const saved = resp.dname || newName;
                        spanEl.textContent = saved;
                        record.friendlyName = saved;
                        if (detailInput) detailInput.value = saved;
                        this.setMeterStatus(key, `Device name saved: ${saved}`, 'ready');
                    } catch (err) {
                        this.setMeterStatus(key, `Name save failed: ${err.message}`, 'error');
                    }
                }
            }
        };

        const cancel = () => {
            if (done) return;
            done = true;
            spanEl.textContent = originalName;
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')  { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        });

        // Delay blur attachment — prevents the same click event that created
        // the input from immediately triggering commit via blur.
        setTimeout(() => {
            if (!done) input.addEventListener('blur', commit);
        }, 200);
    };

    DWMControl.prototype._toggleMeterExpand = function(key) {
        const sid = this.meterSafeId(key);
        const detail = document.getElementById(`meter-${sid}-detail`);
        const label = document.querySelector(`#meter-card-${sid} .meter-expand-label`);
        if (!detail) return;
        const expanded = detail.style.display !== 'none';
        detail.style.display = expanded ? 'none' : '';
        if (label) label.textContent = expanded ? 'Show Details' : 'Hide Details';
    };

    DWMControl.prototype._updateMeterPollInterval = function(key, value) {
        const ms = Number.parseInt(value, 10);
        if (!Number.isFinite(ms) || ms < 50) return;
        this._applyGlobalTimingMs(ms, { persist: true, restartTimers: true });
    };

    // ─── Connection lifecycle ─────────────────────────────────────────────────

    DWMControl.prototype.connectMeter = async function(key, options = {}) {
        const record = this.meterRegistry.get(key);
        if (!record) return;

        try {
            const result = await window.electronAPI.openSerialPort(record.portPath, 115200);
            if (result.success) {
                if (!record.state) record.state = this.createMeterState();
                record.connectionState = 'connected';
                record.lastSeenAt = Date.now();
                this.activeMeterKey = key;
                this.isConnected = true;
                this.appendOutput(`Connected to ${record.portPath}`);
                this.updateMeterCardUI(key);
                this._autoQueryMeterOnConnect(key);
                // Start live polling immediately after connect unless globally disabled.
                if (this.config.globalAutoStartPolling !== false) {
                    this.startMeterMonitoring(key);
                }
            } else {
                if (!options.autoConnect) {
                    this.appendOutput(`Failed to connect to ${record.portPath}: ${result.error}`);
                }
            }
        } catch (error) {
            if (!options.autoConnect) {
                this.appendOutput(`Error connecting to ${record.portPath}: ${error.message}`);
            }
        }
    };

    DWMControl.prototype.disconnectMeter = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record) return;

        this.stopMeterMonitoring(key, true);

        try {
            await window.electronAPI.closeSerialPort(record.portPath);
        } catch (error) {
            this.appendOutput(`Error disconnecting ${record.portPath}: ${error.message}`);
        }

        record.connectionState = 'disconnected';
        if (this.activeMeterKey === key) {
            // Switch activeMeterKey to another connected meter if any
            this.activeMeterKey = null;
            for (const [k, r] of this.meterRegistry) {
                if (r.connectionState === 'connected') { this.activeMeterKey = k; break; }
            }
        }
        this.isConnected = [...this.meterRegistry.values()].some(r => r.connectionState === 'connected');
        this.resetMeterReadings(key);
        this.updateMeterCardUI(key);
        this.appendOutput(`Disconnected from ${record.portPath}`);
    };

    DWMControl.prototype.updateMeterCardUI = function(key) {
        const record = this.meterRegistry.get(key);
        if (!record) return;

        const sid = this.meterSafeId(key);
        const isConn = record.connectionState === 'connected';
        const state = record.state;
        const isMonitoring = Boolean(state && state.monitorTimer);

        // Badge
        const badge = document.getElementById(`meter-${sid}-badge`);
        if (badge) {
            badge.className = `meter-badge meter-badge-${record.connectionState}`;
            badge.textContent = isConn ? 'Connected' : (record.connectionState === 'disconnected' ? 'Disconnected' : 'Available');
        }

        // Readings bar visibility
        const readingsBar = document.getElementById(`meter-${sid}-readings-bar`);
        if (readingsBar) readingsBar.style.display = isConn ? '' : 'none';

        // Header name / UID
        const headerName = document.getElementById(`meter-${sid}-header-name`);
        if (headerName && !headerName.querySelector('.meter-name-inline-input')) {
            headerName.textContent = record.friendlyName || 'DWM V2';
        }
        const headerUid = document.getElementById(`meter-${sid}-header-uid`);
        if (headerUid && record.apiUid) headerUid.textContent = record.apiUid;

        const cfgElemSelect = document.getElementById(`meter-${sid}-cfg-elem`);
        const cfgEvalSelect = document.getElementById(`meter-${sid}-cfg-eval`);
        const cfgEtypeSelect = document.getElementById(`meter-${sid}-cfg-etype`);
        const cfgRangeSelect = document.getElementById(`meter-${sid}-cfg-range`);
        if (cfgElemSelect) cfgElemSelect.disabled = !isConn;
        if (cfgEvalSelect) cfgEvalSelect.disabled = !isConn;
        if (cfgEtypeSelect) cfgEtypeSelect.disabled = !isConn;
        if (cfgRangeSelect) cfgRangeSelect.disabled = !isConn;

        // Buttons in header
        const cardEl = document.getElementById(`meter-card-${sid}`);
        if (cardEl) {
            cardEl.querySelectorAll('[data-meter-action="connect"]').forEach(b => { b.disabled = isConn; });
            cardEl.querySelectorAll('[data-meter-action="disconnect"]').forEach(b => { b.disabled = !isConn; });
            // Detail section connection-dependent buttons
            const detailDependent = [
                'refresh-all','load-name','save-name','refresh-commands',
                'refresh-element-profiles',
                'refresh-power-info','read-metric','refresh-snapshot',
                'start-poll','start-monitor','send-raw',
                'cfg-bright','cfg-elem','cfg-eval','cfg-etype','cfg-range','cfg-avgw',
                'sys-save','sys-rst','sys-dfu','identify-meter',
            ];
            detailDependent.forEach(action => {
                cardEl.querySelectorAll(`[data-meter-action="${action}"]`).forEach(b => { b.disabled = !isConn; });
            });
            // Poll/stop buttons
            cardEl.querySelectorAll('[data-meter-action="start-poll"],[data-meter-action="start-monitor"]')
                .forEach(b => { b.disabled = !isConn || isMonitoring; });
            cardEl.querySelectorAll('[data-meter-action="stop-poll"],[data-meter-action="stop-monitor"]')
                .forEach(b => { b.disabled = !isMonitoring; });

            const isIdentifying = Boolean(state && state.identifyInProgress);
            cardEl.querySelectorAll('[data-meter-action="identify-meter"]')
                .forEach(b => { b.disabled = !isConn || isIdentifying; });
        }

        // Status banner
        if (!isConn) {
            this.setMeterStatus(key, 'Connect to this meter to use the control API.', 'warning');
        } else if (isMonitoring) {
            const ms = state ? state.pollIntervalMs : 500;
            this.setMeterStatus(key, `${ms}ms polling active. Press Stop to end background snapshots.`, 'active');
        } else {
            this.setMeterStatus(key, 'Connected. Use Refresh All or individual actions to query the device.', 'ready');
        }

        const rawInput = document.getElementById(`meter-${sid}-raw-command`);
        if (rawInput) rawInput.disabled = !isConn;

        const sysStatusEl = document.getElementById(`meter-${sid}-sys-status`);
        if (sysStatusEl && !isConn) sysStatusEl.textContent = '';
    };

    // ─── Serial I/O ───────────────────────────────────────────────────────────

    DWMControl.prototype.attachDeviceControlSerialListener = function() {
        if (this._serialListenerAttached || !window.electronAPI || !window.electronAPI.onSerialData) return;
        window.electronAPI.onSerialData((portPath, data) => {
            this.handleControlSerialData(portPath, data);
        });
        this._serialListenerAttached = true;
    };

    DWMControl.prototype.handleControlSerialData = function(portPath, data) {
        if (typeof data !== 'string' || !data) return;

        const record = this.getMeterRecordByPortPath(portPath);
        if (!record || !record.state) return;

        const key = record.key;
        this.appendMeterDebug(key, 'RX', data);

        record.state.serialBuffer += data;
        const lines = record.state.serialBuffer.split('\n');
        record.state.serialBuffer = lines.pop() || '';

        lines.forEach(line => {
            const normalized = line.replace(/\r$/, '').trim();
            if (normalized) this.handleControlSerialLine(key, normalized);
        });
    };

    DWMControl.prototype.handleControlSerialLine = function(key, line) {
        if (!line.startsWith('proto=')) return;

        const frame = this.parseApiFrame(line);
        if (!frame || frame.proto !== '1' || !frame.type) return;

        this.updateMeterLastFrame(key);

        const record = this.meterRegistry.get(key);
        if (!record || !record.state) return;

        if (!frame.req) {
            if (frame.type === 'err') this.setMeterStatus(key, this.describeApiError(frame), 'error');
            return;
        }

        const pending = record.state.pendingRequests.get(frame.req);
        if (!pending) {
            if (frame.type === 'err') this.setMeterStatus(key, this.describeApiError(frame), 'error');
            return;
        }

        clearTimeout(pending.timeoutId);
        record.state.pendingRequests.delete(frame.req);

        if (frame.type === 'resp' && frame.status === 'ok') {
            pending.resolve(frame);
        } else {
            pending.reject(new Error(this.describeApiError(frame)));
        }
    };

    DWMControl.prototype.parseApiFrame = function(line) {
        const frame = { raw: line };
        line.split(' ').forEach(token => {
            const sep = token.indexOf('=');
            if (sep <= 0) return;
            frame[token.slice(0, sep)] = token.slice(sep + 1);
        });
        return frame;
    };

    // ─── API command layer ────────────────────────────────────────────────────

    DWMControl.prototype.sendApiCommand = async function(key, command, fields = {}, options = {}) {
        const record = this.meterRegistry.get(key);
        if (!record || record.connectionState !== 'connected' || !record.state) {
            throw new Error('Device is not connected');
        }

        const state = record.state;
        const runCommand = async () => {
            const requestId = String(state.nextRequestId++);
            const timeoutMs = options.timeoutMs || 2000;
            const frame = this.buildApiFrame(command, requestId, fields);
            const globalPacing = Number.isFinite(this.config?.globalApiPacingMs) ? this.config.globalApiPacingMs : 100;
            const pacingMs = Number.isFinite(options.pacingMs) ? Math.max(0, options.pacingMs) : globalPacing;
            const prevMonitorBusy = Boolean(state.monitorBusy);

            if (!prevMonitorBusy) state.monitorBusy = true;

            try {
                if (pacingMs > 0) await this._delayMs(pacingMs);

                const responsePromise = new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        state.pendingRequests.delete(requestId);
                        reject(new Error(`${command} timed out after ${timeoutMs}ms`));
                    }, timeoutMs);
                    state.pendingRequests.set(requestId, { command, resolve, reject, timeoutId });
                });

                this.appendMeterDebug(key, 'TX', frame);
                const writeResult = await this.writeSerialData(record.portPath, frame);
                if (!writeResult || !writeResult.success) {
                    const pending = state.pendingRequests.get(requestId);
                    if (pending) {
                        clearTimeout(pending.timeoutId);
                        state.pendingRequests.delete(requestId);
                    }
                    throw new Error(writeResult?.error || `Failed to write ${command}`);
                }

                const response = await responsePromise;
                if (pacingMs > 0) await this._delayMs(pacingMs);
                return response;
            } finally {
                if (!prevMonitorBusy) state.monitorBusy = false;
            }
        };

        const queue = state.apiCommandQueue || Promise.resolve();
        const queuedCommand = queue.catch(() => {}).then(runCommand);
        state.apiCommandQueue = queuedCommand.catch(() => {});
        return queuedCommand;
    };

    DWMControl.prototype._decodeRawDebugCommand = function(value) {
        return String(value || '')
            .replace(/\\\\/g, '\\')
            .replace(/\\r/g, '\r')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\0/g, '\0');
    };

    DWMControl.prototype.sendRawMeterCommand = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state || record.connectionState !== 'connected') {
            this.setMeterStatus(key, 'Connect to this meter before sending a raw command.', 'warning');
            return;
        }

        const sid = this.meterSafeId(key);
        const inputEl = document.getElementById(`meter-${sid}-raw-command`);
        if (!inputEl) return;

        const rawValue = inputEl.value;
        if (!rawValue.trim()) {
            this.setMeterStatus(key, 'Enter a raw command before sending.', 'warning');
            return;
        }

        const command = this._decodeRawDebugCommand(rawValue);
        this.appendMeterDebug(key, 'TX', command);

        const writeResult = await this.writeSerialData(record.portPath, command);
        if (!writeResult || !writeResult.success) {
            this.setMeterStatus(key, `Raw send failed: ${writeResult?.error || 'Unknown write error'}`, 'error');
            return;
        }

        this.setMeterStatus(key, 'Raw command sent. Watch RX below for the response.', 'ready');
    };

    // ─── System actions ───────────────────────────────────────────────────────

    DWMControl.prototype.systemSave = async function(key) {
        const sid = this.meterSafeId(key);
        const statusEl = document.getElementById(`meter-${sid}-sys-status`);
        try {
            await this.sendApiCommand(key, 'sys.save');
            if (statusEl) statusEl.textContent = 'Configuration saved to non-volatile storage.';
            this.setMeterStatus(key, 'sys.save: configuration persisted.', 'ready');
        } catch (err) {
            if (statusEl) statusEl.textContent = `Save failed: ${err.message}`;
            this.setMeterStatus(key, `sys.save failed: ${err.message}`, 'error');
        }
    };

    DWMControl.prototype.systemReset = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record) return;
        if (!window.confirm(`Reboot ${record.friendlyName || record.portPath}?\n\nThe meter will restart. The app will attempt to auto-reconnect.`)) return;

        const sid = this.meterSafeId(key);
        const statusEl = document.getElementById(`meter-${sid}-sys-status`);
        try {
            // Fire-and-forget: the device may reset before the response arrives
            this.sendApiCommand(key, 'sys.rst', {}, { timeoutMs: 1000 }).catch(() => {});
            if (statusEl) statusEl.textContent = 'Reboot command sent — waiting for reconnect…';
            this.setMeterStatus(key, 'sys.rst sent. Waiting for device to come back…', 'warning');
            // Watchdog will handle reconnection naturally
        } catch (err) {
            if (statusEl) statusEl.textContent = `Reboot failed: ${err.message}`;
            this.setMeterStatus(key, `sys.rst failed: ${err.message}`, 'error');
        }
    };

    DWMControl.prototype.systemDfu = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record) return;
        if (!window.confirm(`Enter DFU mode on ${record.friendlyName || record.portPath}?\n\nThe device will reboot into firmware update mode. Switch to the Firmware tab to upload.`)) return;

        const sid = this.meterSafeId(key);
        const statusEl = document.getElementById(`meter-${sid}-sys-status`);
        try {
            // Fire-and-forget: device reboots immediately after response
            this.sendApiCommand(key, 'sys.dfu', {}, { timeoutMs: 1000 }).catch(() => {});
            if (statusEl) statusEl.textContent = 'DFU command sent — device is rebooting into update mode.';
            this.setMeterStatus(key, 'sys.dfu sent. Switch to the Firmware tab.', 'warning');
            // After a short delay, disconnect cleanly so the app doesn't try to reconnect
            setTimeout(async () => {
                this.stopMeterMonitoring(key, true);
                try { await window.electronAPI.closeSerialPort(record.portPath); } catch (_) {}
                record.connectionState = 'available';
                this.updateMeterCardUI(key);
            }, 1200);
        } catch (err) {
            if (statusEl) statusEl.textContent = `DFU failed: ${err.message}`;
            this.setMeterStatus(key, `sys.dfu failed: ${err.message}`, 'error');
        }
    };

    DWMControl.prototype.buildApiFrame = function(command, requestId, fields = {}) {
        const tokens = [
            ['proto', '1'],
            ['type', 'cmd'],
            ['cmd', command],
            ['req', String(requestId)],
        ];
        Object.entries(fields).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') tokens.push([k, String(v)]);
        });
        return `${tokens.map(([k, v]) => `${k}=${v}`).join(' ')}\r\n`;
    };

    DWMControl.prototype.describeApiError = function(frame) {
        const CODES = {
            ERR_BAD_FRAME: 'Frame could not be parsed as key=value tokens',
            ERR_MISSING_KEY: 'A required key was absent from the frame',
            ERR_UNKNOWN_CMD: 'Command not recognised by firmware',
            ERR_UNKNOWN_METRIC: 'Metric name is not supported',
            ERR_BAD_ENUM: 'A key had an unsupported value',
            ERR_BAD_VALUE: 'A value could not be parsed',
            ERR_VALUE_RANGE: 'Numeric value was out of the accepted range',
            ERR_SETTING_REJECTED: 'Firmware rejected the setting',
            ERR_BUSY: 'Device is temporarily unable to service the command',
            ERR_INTERNAL: 'Internal firmware error',
        };
        const description = frame.code ? (CODES[frame.code] || frame.code) : null;
        const detail = frame.msg && frame.msg !== description ? ` (${frame.msg})` : '';
        const summary = description ? `${description}${detail}` : (frame.msg || frame.error || 'Unknown device error');
        return `${frame.cmd || 'command'} failed: ${summary}`;
    };

    // ─── Data refresh ─────────────────────────────────────────────────────────

    DWMControl.prototype._autoQueryMeterOnConnect = async function(key) {
        try {
            await this.refreshDeviceIdentity(key, { quiet: true });
            await this.loadDeviceName(key, { quiet: true });
            await this.refreshElementProfiles(key, { quiet: true });
            await this.refreshPowerInfo(key, { quiet: true });
            await this.refreshSupportedCommands(key, { quiet: true });
            await this.refreshCfgBrightness(key, { quiet: true });
            await this.refreshCfgAvgw(key, { quiet: true });
            this.setMeterStatus(key, 'Connected. Device info was queried automatically.', 'ready');
        } catch (error) {
            this.appendOutput(`Auto device query failed: ${error.message}`);
            this.setMeterStatus(key, 'Connected, but auto-query failed. Use Refresh All.', 'warning');
        }
    };

    DWMControl.prototype.refreshAllMeterData = async function(key) {
        this.setMeterStatus(key, 'Refreshing identity, name, capabilities, power info, and snapshot…', 'ready');
        try {
            await this.refreshDeviceIdentity(key, { quiet: true });
            await this.loadDeviceName(key, { quiet: true });
            await this.refreshSupportedCommands(key, { quiet: true });
            await this.refreshElementProfiles(key, { quiet: true });
            await this.refreshPowerInfo(key, { quiet: true });
            await this.refreshCfgBrightness(key, { quiet: true });
            await this.refreshCfgAvgw(key, { quiet: true });
            await this.refreshPowerSnapshot(key, { quiet: true });
            this.setMeterStatus(key, 'Control data refreshed successfully.', 'ready');
        } catch (error) {
            this.appendOutput(`Control refresh failed: ${error.message}`);
            this.setMeterStatus(key, error.message, 'error');
        }
    };

    DWMControl.prototype.refreshElementProfiles = async function(key, options = {}) {
        try {
            const response = await this.sendApiCommand(key, 'cfg.elems');
            const record = this.meterRegistry.get(key);
            if (record) {
                record.elementProfiles = this._parseElementProfiles(response);
                const sid = this.meterSafeId(key);
                const elemSelect = document.getElementById(`meter-${sid}-cfg-elem`);
                if (elemSelect) {
                    const selectedElem = Number.parseInt(record.elementId, 10) || 1;
                    if (!(record.state && record.state.elementProfileMenuOpen)) {
                        elemSelect.innerHTML = this._renderElementProfileOptions(record, selectedElem);
                    }
                    elemSelect.value = String(selectedElem);
                }
            }
            if (!options.quiet) this.setMeterStatus(key, 'Element profile list refreshed.', 'ready');
            return response;
        } catch (error) {
            if (!options.quiet) {
                this.appendOutput(`Element profile refresh failed: ${error.message}`);
                this.setMeterStatus(key, `Element profile refresh failed: ${error.message}`, 'error');
            }
            throw error;
        }
    };

    DWMControl.prototype.refreshDeviceIdentity = async function(key, options = {}) {
        try {
            const response = await this.sendApiCommand(key, 'sys.id');
            const record = this.meterRegistry.get(key);

            if (record && response.uid) {
                record.apiUid = response.uid;
            }

            const sid = this.meterSafeId(key);
            const uidEl = document.getElementById(`meter-${sid}-uid`);
            const dnameEl = document.getElementById(`meter-${sid}-dname`);
            const headerUidEl = document.getElementById(`meter-${sid}-header-uid`);
            const nameInputEl = document.getElementById(`meter-${sid}-name-input`);

            if (uidEl) uidEl.textContent = response.uid || '-';
            if (dnameEl) dnameEl.textContent = response.dname || '-';
            if (headerUidEl && response.uid) headerUidEl.textContent = response.uid;
            if (nameInputEl && response.dname) nameInputEl.value = response.dname;

            if (!options.quiet) this.setMeterStatus(key, 'Device identity updated.', 'ready');
            return response;
        } catch (error) {
            this.appendOutput(`Identity read failed: ${error.message}`);
            this.setMeterStatus(key, error.message, 'error');
            throw error;
        }
    };

    DWMControl.prototype.loadDeviceName = async function(key, options = {}) {
        try {
            const response = await this.sendApiCommand(key, 'sys.nget');
            const sid = this.meterSafeId(key);
            const inputEl = document.getElementById(`meter-${sid}-name-input`);
            const dnameEl = document.getElementById(`meter-${sid}-dname`);
            const headerNameEl = document.getElementById(`meter-${sid}-header-name`);

            if (inputEl) inputEl.value = response.dname || '';
            if (dnameEl) dnameEl.textContent = response.dname || '-';
            if (headerNameEl && response.dname) {
                headerNameEl.textContent = response.dname;
                const record = this.meterRegistry.get(key);
                if (record) record.friendlyName = response.dname;
            }

            if (!options.quiet) this.setMeterStatus(key, 'Device name loaded from firmware.', 'ready');
            return response;
        } catch (error) {
            this.appendOutput(`Name read failed: ${error.message}`);
            this.setMeterStatus(key, error.message, 'error');
            throw error;
        }
    };

    DWMControl.prototype.saveDeviceName = async function(key) {
        const sid = this.meterSafeId(key);
        const inputEl = document.getElementById(`meter-${sid}-name-input`);
        const name = inputEl ? inputEl.value.trim() : '';

        if (!name) { this.setMeterStatus(key, 'Enter a device name before saving.', 'warning'); return; }
        if (/\s/.test(name)) { this.setMeterStatus(key, 'Device name cannot contain whitespace.', 'warning'); return; }

        try {
            const response = await this.sendApiCommand(key, 'sys.nset', { name });
            const dnameEl = document.getElementById(`meter-${sid}-dname`);
            const headerNameEl = document.getElementById(`meter-${sid}-header-name`);
            const displayName = response.dname || name;

            if (dnameEl) dnameEl.textContent = displayName;
            if (headerNameEl) headerNameEl.textContent = displayName;

            const record = this.meterRegistry.get(key);
            if (record) record.friendlyName = displayName;

            this.setMeterStatus(key, `Stored device name: ${displayName}`, 'ready');
        } catch (error) {
            this.appendOutput(`Name update failed: ${error.message}`);
            this.setMeterStatus(key, error.message, 'error');
        }
    };

    DWMControl.prototype.refreshSupportedCommands = async function(key, options = {}) {
        try {
            const response = await this.sendApiCommand(key, 'sys.cmds');
            const sid = this.meterSafeId(key);
            const listEl = document.getElementById(`meter-${sid}-commands`);
            if (listEl) {
                const commands = (response.cmds || '').split(',').filter(Boolean);
                listEl.innerHTML = commands.length === 0
                    ? '<span class="control-chip muted">No commands returned</span>'
                    : commands.map(cmd => `<span class="control-chip">${cmd}</span>`).join('');
            }
            if (!options.quiet) this.setMeterStatus(key, 'Firmware command list updated.', 'ready');
            return response;
        } catch (error) {
            this.appendOutput(`Command list failed: ${error.message}`);
            this.setMeterStatus(key, error.message, 'error');
            throw error;
        }
    };

    DWMControl.prototype.refreshPowerInfo = async function(key, options = {}) {
        try {
            const response = await this.sendApiCommand(key, 'pwr.info');
            const sid = this.meterSafeId(key);
            const mappings = {
                [`meter-${sid}-pinfo-elem`]:  response.elem,
                [`meter-${sid}-pinfo-etype`]: response.etype,
                [`meter-${sid}-pinfo-eval`]:  this.formatDecimal(response.eval, 6, ' W'),
                [`meter-${sid}-pinfo-range`]: response.range,
            };
            Object.entries(mappings).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val || '-';
            });
            // Cache element rating and range for gauge scaling
            const record = this.meterRegistry.get(key);
            if (record) {
                const evRaw = Number.parseFloat(response.eval);
                if (Number.isFinite(evRaw) && evRaw > 0) record.elementRating = evRaw;
                const elemRaw = Number.parseInt(response.elem, 10);
                if (Number.isFinite(elemRaw) && elemRaw >= 1 && elemRaw <= 8) {
                    // Clear history when the active element changes
                    if (record.state && record.elementId !== elemRaw) {
                        record.state.history = [];
                    }
                    record.elementId = elemRaw;
                }
                record.elementType = String(response.etype || record.elementType || '30ua').toLowerCase();
                record.rangeMultiplier = this._parseRangeMultiplier(response.range);
                record.rangeCfg = record.rangeMultiplier >= 4 ? 1 : 0;
                this._updateGaugeScale(key);

                const elemSelect = document.getElementById(`meter-${sid}-cfg-elem`);
                const evalSelect = document.getElementById(`meter-${sid}-cfg-eval`);
                const etypeSelect = document.getElementById(`meter-${sid}-cfg-etype`);
                const rangeSelect = document.getElementById(`meter-${sid}-cfg-range`);
                const rangeReadOnly = document.getElementById(`meter-${sid}-cfg-range-readonly`);
                if (elemSelect && Number.isFinite(record.elementId) && !(record.state && record.state.elementProfileMenuOpen)) {
                    elemSelect.innerHTML = this._renderElementProfileOptions(record, record.elementId);
                    elemSelect.value = String(record.elementId);
                }
                if (evalSelect && Number.isFinite(evRaw) && evRaw > 0 && !(record.state?.cfgDraftEval)) {
                    if (record.state?.topControlEditingId !== evalSelect.id) evalSelect.value = String(evRaw);
                }
                if (etypeSelect && !(record.state?.cfgDraftEtype)) {
                    if (record.state?.topControlEditingId !== etypeSelect.id) etypeSelect.value = record.elementType;
                }
                if (rangeSelect && record.state?.topControlEditingId !== rangeSelect.id) rangeSelect.value = String(record.rangeCfg);
                if (rangeReadOnly) rangeReadOnly.value = String(record.rangeCfg);

            }
            if (!options.quiet) this.setMeterStatus(key, 'Power configuration updated.', 'ready');
            return response;
        } catch (error) {
            this.appendOutput(`Power info failed: ${error.message}`);
            this.setMeterStatus(key, error.message, 'error');
            throw error;
        }
    };

    DWMControl.prototype.readSinglePowerMetric = async function(key) {
        const sid = this.meterSafeId(key);
        const metricSel = document.getElementById(`meter-${sid}-metric-select`);
        const metricLoadingEl = document.getElementById(`meter-${sid}-metric-loading`);
        const metric = metricSel ? metricSel.value : 'avg';
        if (metricLoadingEl) metricLoadingEl.style.display = '';
        try {
            const response = await this.sendApiCommand(key, 'pwr.get', { met: metric });
            const nameEl = document.getElementById(`meter-${sid}-metric-name`);
            const valEl = document.getElementById(`meter-${sid}-metric-value`);
            if (nameEl) {
                const ctx = [response.etype, response.range].filter(Boolean).join(' | ');
                nameEl.textContent = ctx ? `${response.met || metric} (${ctx})` : (response.met || metric);
            }
            if (valEl) valEl.textContent = this.formatDecimal(response.value, 6, ' W');
            this.setMeterStatus(key, `Read ${metric} successfully.`, 'ready');
        } catch (error) {
            this.appendOutput(`Metric read failed: ${error.message}`);
            this.setMeterStatus(key, error.message, 'error');
        } finally {
            if (metricLoadingEl) metricLoadingEl.style.display = 'none';
        }
    };

    DWMControl.prototype.resetMeterReadings = function(key) {
        const sid = this.meterSafeId(key);
        ['inst','avg','peak','max','min','dev'].forEach(m => {
            this.updateSnapshotMeterEl(key, m, 0, 1);
        });
        ['pvolt','svolt','snap-elem','snap-etype','snap-eval','snap-range'].forEach(suffix => {
            const el = document.getElementById(`meter-${sid}-${suffix}`);
            if (el) el.textContent = '-';
        });
        const scaleEl = document.getElementById(`meter-${sid}-snap-scale`);
        if (scaleEl) scaleEl.textContent = '0.000000 W';
        const updatedEl = document.getElementById(`meter-${sid}-snap-updated`);
        if (updatedEl) updatedEl.textContent = 'Never';
        // Reset readings bar
        ['inst','avg','peak'].forEach(m => {
            const el = document.getElementById(`meter-${sid}-${m}`);
            if (el) el.textContent = '--';
        });
        // Reset gauges
        const avgFill = document.getElementById(`meter-${sid}-gauge-avg`);
        const pepFill = document.getElementById(`meter-${sid}-gauge-pep`);
        if (avgFill) avgFill.style.width = '0%';
        if (pepFill) pepFill.style.width = '0%';
        // Clear history
        const histRecord = this.meterRegistry.get(key);
        if (histRecord && histRecord.state) {
            histRecord.state.history = [];
            histRecord.state.lastSnapshotResponse = null;
            histRecord.state.lastSnapshotRaw = null;
            histRecord.state.pepHeldPeakW = 0;
            histRecord.state.pepHoldUntilTs = 0;
            if (histRecord.state.gaugeAnim?.rafId) {
                window.cancelAnimationFrame(histRecord.state.gaugeAnim.rafId);
            }
            histRecord.state.gaugeAnim = null;
        }
        const histCanvas = document.getElementById(`meter-${sid}-history-canvas`);
        if (histCanvas) {
            const ctx = histCanvas.getContext('2d');
            ctx.clearRect(0, 0, histCanvas.width, histCanvas.height);
        }
    };

    // ─── Live panel helpers ───────────────────────────────────────────────────

    DWMControl.prototype._setMeterView = function(key, view) {
        const sid = this.meterSafeId(key);
        const gaugesView = document.getElementById(`meter-${sid}-gauges-view`);
        const histView   = document.getElementById(`meter-${sid}-history-view`);
        const cardEl     = document.getElementById(`meter-card-${sid}`);

        if (gaugesView) gaugesView.style.display = view === 'meters'  ? '' : 'none';
        if (histView)   histView.style.display   = view === 'history' ? '' : 'none';

        if (cardEl) {
            cardEl.querySelectorAll('.meter-view-btn').forEach(btn => {
                const btnView = btn.dataset.meterAction === 'view-meters' ? 'meters' : 'history';
                btn.classList.toggle('active', btnView === view);
            });
        }

        if (view === 'history') this._drawMeterHistory(key);
    };

    DWMControl.prototype._setMeterCardLayout = function(key, layout) {
        const record = this.meterRegistry.get(key);
        if (!record?.state) return;
        record.state.cardLayout = layout;

        const sid       = this.meterSafeId(key);
        const gaugesView = document.getElementById(`meter-${sid}-gauges-view`);
        if (gaugesView) gaugesView.dataset.layout = layout;

        // Update active state on picker buttons
        const picker = document.getElementById(`meter-${sid}-layout-picker`);
        if (picker) {
            picker.querySelectorAll('.meter-layout-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.meterAction === `layout-${layout}`);
            });
        }

        // Hide panels that aren't shown in this layout
        const panelL = gaugesView?.querySelector('.meter-gauge-radial-panel:first-child');
        const panelR = gaugesView?.querySelector('.meter-gauge-radial-panel:last-child');
        if (panelL && panelR) {
            const showL = layout !== 'single-R';
            const showR = layout !== 'single-L';
            panelL.style.display = showL ? '' : 'none';
            panelR.style.display = showR ? '' : 'none';
        }

        // Force gauge repaint at new size
        const liveRecord = this.meterRegistry.get(key);
        if (liveRecord?.state?.lastSnapshotResponse) {
            requestAnimationFrame(() => this._updateMeterGauges(key, liveRecord.state.lastSnapshotResponse));
        }
    };

    DWMControl.prototype._parseRangeMultiplier = function(rangeStr) {
        const s = String(rangeStr || '').trim();
        if (s === '1' || s === '4x' || s === '4X') return 4;
        // '0', '2x', '2X', or anything unrecognised → default 2x
        return 2;
    };

    DWMControl.prototype._computeGaugeMax = function(key) {
        const record = this.meterRegistry.get(key);
        if (!record) return 1;
        const rating = record.elementRating;
        const mult   = record.rangeMultiplier || 2;
        if (Number.isFinite(rating) && rating > 0) return rating * mult;
        // Fallback: use the last measured peak from state if no element rating yet
        const state = record.state;
        return (state && state.snapshotScaleMax > 1) ? state.snapshotScaleMax : 100;
    };

    DWMControl.prototype._getPepHoldMs = function(record) {
        const raw = Number.parseInt(record?.pepHoldMs, 10);
        if (!Number.isFinite(raw) || raw < 0) return 1000;
        return raw;
    };

    DWMControl.prototype._applyPepHoldValue = function(key, rawPeak) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state) return rawPeak;

        const holdMs = this._getPepHoldMs(record);
        const safePeak = Number.isFinite(rawPeak) ? Math.max(0, rawPeak) : 0;
        if (holdMs <= 0) {
            record.state.pepHeldPeakW = safePeak;
            record.state.pepHoldUntilTs = 0;
            return safePeak;
        }

        const now = Date.now();
        const heldPeak = Number.isFinite(record.state.pepHeldPeakW) ? record.state.pepHeldPeakW : 0;
        const holdUntil = Number.isFinite(record.state.pepHoldUntilTs) ? record.state.pepHoldUntilTs : 0;

        if (safePeak >= heldPeak || now >= holdUntil) {
            record.state.pepHeldPeakW = safePeak;
            record.state.pepHoldUntilTs = now + holdMs;
            return safePeak;
        }
        return heldPeak;
    };

    DWMControl.prototype._updateGaugeScale = function(key) {
        const sid      = this.meterSafeId(key);
        const record   = this.meterRegistry.get(key);
        const scaleEl  = document.getElementById(`meter-${sid}-gauge-scale`);
        if (!scaleEl || !record) return;
        const rating   = record.elementRating;
        const mult     = record.rangeMultiplier || 2;
        if (Number.isFinite(rating) && rating > 0) {
            scaleEl.textContent = `${this.formatDecimal(rating * mult, 0)} W FS`;
        }
    };

    DWMControl.prototype._updateMeterGauges = function(key, response) {
        const record   = this.meterRegistry.get(key);
        if (!record || !record.state) return;
        record.state.lastSnapshotResponse = response;
        const sid       = this.meterSafeId(key);
        const maxPower  = record.state.maxPowerW || 0;
        const rawResponse = record.state.lastSnapshotRaw || response;
        const getVal = (src, metric) => {
            const v = Number.parseFloat(src?.[metric]);
            return Number.isFinite(v) ? Math.max(0, v) : 0;
        };

        if (!record.state.gaugeAnim) {
            record.state.gaugeAnim = {
                rafId: null,
                lastTs: 0,
                L: { gaugeCurrent: 0, gaugeTarget: 0, textCurrent: 0, textTarget: 0 },
                R: { gaugeCurrent: 0, gaugeTarget: 0, textCurrent: 0, textTarget: 0 },
            };
        }
        const anim = record.state.gaugeAnim;

        ['L', 'R'].forEach(side => {
            const metric = side === 'L' ? (record.gaugeMetricL || 'avg') : (record.gaugeMetricR || 'peak');
            const mode   = side === 'L' ? (record.gaugeDisplayL || 'gauge') : (record.gaugeDisplayR || 'gauge');
            const heldVal = getVal(response, metric);
            const gaugeVal = (metric === 'peak' && mode === 'gauge') ? getVal(rawResponse, metric) : heldVal;
            anim[side].gaugeTarget = gaugeVal;
            anim[side].textTarget = heldVal;
        });

        const advance = (current, target, alpha) => {
            const next = current + (target - current) * alpha;
            return Number.isFinite(next) ? next : target;
        };

        const drawFrame = (timestamp) => {
            const liveRecord = this.meterRegistry.get(key);
            if (!liveRecord || !liveRecord.state || !liveRecord.state.gaugeAnim) return;
            const liveAnim = liveRecord.state.gaugeAnim;
            const lastTs = Number.isFinite(liveAnim.lastTs) ? liveAnim.lastTs : 0;
            const dt = lastTs > 0 ? Math.max(1, Math.min(64, timestamp - lastTs)) : 16;
            liveAnim.lastTs = timestamp;

            const smoothPct = this._getGlobalGaugeSmoothing() / 100;
            const baseAlpha = 0.82 - (0.62 * smoothPct); // lower smoothing % = faster response
            const alpha = 1 - Math.pow(1 - Math.min(0.95, Math.max(0.08, baseAlpha)), dt / 16);

            ['L', 'R'].forEach(side => {
                liveAnim[side].gaugeCurrent = advance(liveAnim[side].gaugeCurrent, liveAnim[side].gaugeTarget, alpha);
            });

            const scaleMax = this._computeGaugeMax(key);
            const pct = v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0) / (scaleMax || 1));

            ['L', 'R'].forEach(side => {
                const metric = side === 'L' ? (liveRecord.gaugeMetricL || 'avg') : (liveRecord.gaugeMetricR || 'peak');
                const mode   = side === 'L' ? (liveRecord.gaugeDisplayL || 'gauge') : (liveRecord.gaugeDisplayR || 'gauge');
                const label  = metric === 'peak' ? 'PEP' : metric.toUpperCase();
                const valStr = this.formatPowerWithClip(liveAnim[side].textTarget, maxPower);
                const cvs    = document.getElementById(`meter-${sid}-gauge-canvas-${side}`);
                if (!cvs) return;

                if (mode === 'numeric') {
                    this._drawLargePowerReadout(cvs, pct(liveAnim[side].gaugeTarget), valStr, label);
                } else {
                    this._drawSemiRadialGauge(cvs, pct(liveAnim[side].gaugeCurrent), valStr, label, scaleMax);
                }
            });

            const done = ['L', 'R'].every(side => {
                const a = liveAnim[side];
                return Math.abs(a.gaugeTarget - a.gaugeCurrent) < 0.02;
            });

            if (done) {
                liveAnim.rafId = null;
                liveAnim.lastTs = 0;
                return;
            }

            liveAnim.rafId = window.requestAnimationFrame(drawFrame);
        };

        if (!anim.rafId) {
            anim.rafId = window.requestAnimationFrame(drawFrame);
        }
    };
    // ─── Semicircular RF Wattmeter Gauge ─────────────────────────────────────

    DWMControl.prototype._drawSemiRadialGauge = function(canvas, pct, valStr, metricLabel, scaleMax) {
        if (!canvas || canvas.offsetWidth === 0) return;

        const TRACK_W  = 14;
        const PAD_SIDE = 110;   // horizontal inset; keeps tick labels clear of canvas edges
        const PAD_TOP  = 80;
        const DIG_H    = 110;
        const BOT_PAD  = 6;

        const dpr    = window.devicePixelRatio || 1;
        const cssW   = canvas.offsetWidth;
        const radius = Math.max(30, Math.floor((cssW - PAD_SIDE * 2) / 2));
        const cx     = cssW / 2;
        const cy     = PAD_TOP + TRACK_W / 2 + radius;
        const cssH   = cy + 14 + DIG_H + BOT_PAD;

        canvas.style.height = `${cssH}px`;
        if (canvas.width  !== Math.round(cssW * dpr) ||
            canvas.height !== Math.round(cssH * dpr)) {
            canvas.width  = Math.round(cssW * dpr);
            canvas.height = Math.round(cssH * dpr);
        }

        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, cssW, cssH);

        const pal  = this._getCanvasPalette();

        // Arc geometry: 0% at left (π), 100% at right (2π), clockwise through top
        const S_ANG = Math.PI;
        const aAt   = p => S_ANG + Math.min(Math.max(p, 0), 1) * Math.PI;

        // ── Background
        ctx.fillStyle = pal.bg;
        ctx.fillRect(0, 0, cssW, cssH);

        // ── Zone arc track (dim background rings — always visible)
        pal.zones.forEach(z => {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, aAt(z.from), aAt(z.to), false);
            ctx.strokeStyle = z.dim;
            ctx.lineWidth   = TRACK_W;
            ctx.lineCap     = 'butt';
            ctx.stroke();
        });

        // ── Bright fill up to current level
        if (pct > 0.002) {
            pal.zones.forEach(z => {
                if (pct <= z.from) return;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, aAt(z.from), aAt(Math.min(pct, z.to)), false);
                ctx.strokeStyle = z.bright;
                ctx.lineWidth   = TRACK_W;
                ctx.lineCap     = 'butt';
                ctx.stroke();
            });
        }

        // ── Zone boundary dividers
        [0.60, 0.80].forEach(bp => {
            const a    = aAt(bp);
            const cosA = Math.cos(a), sinA = Math.sin(a);
            ctx.beginPath();
            ctx.moveTo(cx + cosA * (radius - TRACK_W / 2), cy + sinA * (radius - TRACK_W / 2));
            ctx.lineTo(cx + cosA * (radius + TRACK_W / 2), cy + sinA * (radius + TRACK_W / 2));
            ctx.strokeStyle = pal.divider;
            ctx.lineWidth   = 1.5;
            ctx.lineCap     = 'round';
            ctx.stroke();
        });

        // ── Tick marks + scale labels OUTSIDE the arc
        const outerEdge = radius + TRACK_W / 2;

        const fmtTick = w => {
            if (!Number.isFinite(w) || w <= 0) return '0';
            const { scaled, unit } = this.scalePower(w);
            const d = Math.abs(scaled) < 10 ? parseFloat(scaled.toFixed(1)) : Math.round(scaled);
            return `${d}${unit}`;
        };

        // ── Fine ticks at every 2.5% of FS (no labels, skip positions already covered by 10% ticks)
        for (let j = 1; j < 40; j++) {
            if (j % 4 === 0) continue; // 10% positions are drawn with labels below
            const p     = j / 40;
            const angle = aAt(p);
            const cosA  = Math.cos(angle);
            const sinA  = Math.sin(angle);
            const r1    = outerEdge + 2;
            const r2    = outerEdge + (j % 2 === 0 ? 10 : 6); // 5% ticks slightly longer than 2.5% ticks
            ctx.beginPath();
            ctx.moveTo(cx + cosA * r1, cy + sinA * r1);
            ctx.lineTo(cx + cosA * r2, cy + sinA * r2);
            ctx.strokeStyle = pal.tickFine;
            ctx.lineWidth   = 1.2;
            ctx.lineCap     = 'round';
            ctx.stroke();
        }

        for (let i = 0; i <= 10; i++) {
            const p     = i / 10;
            const angle = aAt(p);
            const cosA  = Math.cos(angle);
            const sinA  = Math.sin(angle);
            const isMaj = (i % 5 === 0);
            const tLen  = isMaj ? 19 : 12;
            const r1    = outerEdge + 2;
            const r2    = outerEdge + tLen;

            ctx.beginPath();
            ctx.moveTo(cx + cosA * r1, cy + sinA * r1);
            ctx.lineTo(cx + cosA * r2, cy + sinA * r2);
            ctx.strokeStyle = isMaj ? pal.tickMaj : pal.tickMin;
            ctx.lineWidth   = isMaj ? 2.5 : 1.5;
            ctx.lineCap     = 'round';
            ctx.stroke();

            const lx     = cx + cosA * (r2 + 5);
            const ly     = cy + sinA * (r2 + 5);
            const fSize  = isMaj ? 30 : 27;
            ctx.fillStyle    = pal.zoneLabel(p);
            ctx.font         = `bold ${fSize}px monospace`;
            ctx.textAlign    = cosA < -0.12 ? 'right' : cosA > 0.12 ? 'left' : 'center';
            ctx.textBaseline = sinA < -0.12 ? 'bottom' : sinA > 0.12 ? 'top' : 'middle';
            ctx.fillText(fmtTick((scaleMax || 0) * p), lx, ly);
        }

        // ── Needle
        const nAngle = aAt(pct);
        const nCosA  = Math.cos(nAngle);
        const nSinA  = Math.sin(nAngle);
        const nLen   = radius - TRACK_W / 2 - 5;
        const tailR  = radius * 0.16;

        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur  = 5;
        ctx.beginPath();
        ctx.moveTo(cx - nCosA * tailR, cy - nSinA * tailR);
        ctx.lineTo(cx + nCosA * nLen,  cy + nSinA * nLen);
        ctx.strokeStyle = pal.needle;
        ctx.lineWidth   = 2.5;
        ctx.lineCap     = 'round';
        ctx.stroke();
        ctx.shadowBlur  = 0;

        // ── Pivot bearing
        ctx.beginPath(); ctx.arc(cx, cy, 9,   0, Math.PI * 2); ctx.fillStyle = pal.pivotOuter; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fillStyle = pal.pivotMid;   ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, 2,   0, Math.PI * 2); ctx.fillStyle = pal.pivotInner; ctx.fill();

        // ── Digital readout strip below pivot
        const digTop = cy + 14;
        const digH   = cssH - digTop - BOT_PAD;
        if (digH > 18) {
            ctx.fillStyle = pal.digBg;
            ctx.beginPath();
            ctx.roundRect(6, digTop, cssW - 12, digH, 5);
            ctx.fill();

            ctx.strokeStyle = pal.digSep;
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(6, digTop); ctx.lineTo(cssW - 6, digTop);
            ctx.stroke();

            ctx.fillStyle    = pal.zoneColor(pct);
            ctx.font         = 'bold 41px sans-serif';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(metricLabel, cx, digTop + 4);

            const valFS = Math.max(21, Math.min(42, Math.floor((cssW - 20) / Math.max(valStr.length, 1) * 0.65)));
            ctx.fillStyle    = pal.readout;
            ctx.font         = `bold ${valFS}px monospace`;
            ctx.textBaseline = 'middle';
            ctx.fillText(valStr, cx, digTop + digH * 0.74);
        }

        ctx.restore();
    };

    DWMControl.prototype._drawLargePowerReadout = function(canvas, pct, valStr, metricLabel) {
        if (!canvas || canvas.offsetWidth === 0) return;

        const dpr  = window.devicePixelRatio || 1;
        const cssW = canvas.offsetWidth;
        const cssH = Math.max(190, Math.floor(cssW * 0.62));

        canvas.style.height = `${cssH}px`;
        if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
            canvas.width = Math.round(cssW * dpr);
            canvas.height = Math.round(cssH * dpr);
        }

        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, cssW, cssH);

        const pal = this._getCanvasPalette();

        const bg = ctx.createLinearGradient(0, 0, 0, cssH);
        bg.addColorStop(0, pal.bgGrad1);
        bg.addColorStop(1, pal.bgGrad2);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, cssW, cssH);

        ctx.strokeStyle = pal.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, cssW - 1, cssH - 1);

        ctx.fillStyle = pal.zoneColor(pct);
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(metricLabel, cssW / 2, 12);

        const valueFS = Math.max(47, Math.min(109, Math.floor((cssW - 18) / Math.max(valStr.length, 1) * 1.6)));
        ctx.fillStyle = pal.readout;
        ctx.font = `bold ${valueFS}px monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillText(valStr, cssW / 2, cssH * 0.55);

        ctx.restore();
    };

    DWMControl.prototype._resetMeterHistoryData = function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state) return;
        record.state.history = [];
        this._drawMeterHistory(key);
    };

    DWMControl.prototype._pausePollingForElementProfile = function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state) return;
        if (record.state.elementProfileMenuOpen) return;

        record.state.elementProfileMenuOpen = true;
        record.state.resumePollingAfterElementProfile = Boolean(record.state.monitorTimer);
        if (record.state.resumePollingAfterElementProfile) {
            this.stopMeterMonitoring(key, true);
        }
    };

    DWMControl.prototype._resumePollingForElementProfile = function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state) return;
        const shouldResume = Boolean(record.state.resumePollingAfterElementProfile);
        record.state.elementProfileMenuOpen = false;
        record.state.resumePollingAfterElementProfile = false;
        if (shouldResume && record.connectionState === 'connected') {
            this.startMeterMonitoring(key);
        }
    };

    DWMControl.prototype._updateHistoryLineLegend = function(key) {
        const record = this.meterRegistry.get(key);
        if (!record?.state) return;
        const sid   = this.meterSafeId(key);
        const lines = record.state.historyLines;
        const atMax = lines.length >= 4;
        const legend = document.getElementById(`meter-${sid}-history-legend`);
        if (!legend) return;
        legend.querySelectorAll('.meter-hist-line-toggle').forEach(label => {
            const metric   = label.dataset.metric;
            const checked  = lines.includes(metric);
            const disabled = !checked && atMax;
            const cb = label.querySelector('input[type=checkbox]');
            if (cb) { cb.checked = checked; cb.disabled = disabled; }
            label.classList.toggle('active',   checked);
            label.classList.toggle('disabled', disabled);
        });
    };

    DWMControl.prototype._pushMeterHistory = function(key, response, maxPowerW = 0) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state) return;
        const h = record.state.history;
        const clip = v => {
            const n = Number.parseFloat(v) || 0;
            return maxPowerW > 0 ? Math.min(Math.max(0, n), maxPowerW) : Math.max(0, n);
        };
        const now = Date.now();
        h.push({
            t:    now,
            inst: clip(response.inst),
            avg:  clip(response.avg),
            peak: clip(response.peak),
            max:  clip(response.max),
            min:  clip(response.min),
            dev:  clip(response.dev),
        });
        // Trim points older than 2× the selected window; hard cap at 200 000 points
        const windowMs = record.state.historyWindowMs || 30000;
        const cutoff = now - windowMs * 2;
        while (h.length > 0 && h[0].t < cutoff) h.shift();
        if (h.length > 200000) h.shift();
    };

    DWMControl.prototype.exportMeterHistory = function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state) return;

        const hist = record.state.history || [];
        if (hist.length < 2) {
            this.setMeterStatus(key, 'Not enough history samples to export yet.', 'warning');
            return;
        }

        const firstTs = hist[0].t;
        const elementRating = record.state.elementRating || 0;
        const rangeMultiplier = record.state.rangeMultiplier || 1;
        const rows = [
            `# Element Rating: ${elementRating} W, Range: ${rangeMultiplier}x`,
            'timestamp_iso,epoch_ms,elapsed_ms,inst_w,avg_w,peak_w,max_w,min_w,dev_w,element_rating_w,range_mult',
            ...hist.map(point => {
                const tsIso = new Date(point.t).toISOString();
                const fmt = k => Number.isFinite(point[k]) ? Number(point[k]).toFixed(6) : '0.000000';
                return `${tsIso},${point.t},${point.t - firstTs},${fmt('inst')},${fmt('avg')},${fmt('peak')},${fmt('max')},${fmt('min')},${fmt('dev')},${elementRating},${rangeMultiplier}`;
            }),
        ];

        const baseNameRaw = record.friendlyName || record.apiUid || this.meterSafeId(key) || 'meter';
        const baseName = String(baseNameRaw).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 20) || 'meter';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `${baseName}-history-${stamp}.csv`;

        const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);

        this.setMeterStatus(key, `Exported ${hist.length} chart points to ${fileName}.`, 'ready');
    };

    DWMControl.prototype._drawMeterHistory = function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state) return;
        const sid = this.meterSafeId(key);

        const histView = document.getElementById(`meter-${sid}-history-view`);
        if (!histView || histView.style.display === 'none') return;

        const canvas = document.getElementById(`meter-${sid}-history-canvas`);
        if (!canvas) return;

        const dpr  = window.devicePixelRatio || 1;
        const cssW = canvas.clientWidth || canvas.offsetWidth || 400;
        const cssH = 230;
        canvas.width  = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.height = `${cssH}px`;

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const pal = this._getCanvasPalette();

        // ── Layout ──────────────────────────────────────────────────────────
        const FONT_TICK = 'bold 13px monospace';
        const FONT_UNIT = 'bold 16px monospace';
        const margin = { left: 66, right: 14, top: 48, bottom: 30 };
        const plotX = margin.left;
        const plotY = margin.top;
        const plotW = Math.max(10, cssW - margin.left - margin.right);
        const plotH = Math.max(10, cssH - margin.top - margin.bottom);

        ctx.clearRect(0, 0, cssW, cssH);
        ctx.fillStyle = pal.plotBg;
        ctx.fillRect(0, 0, cssW, cssH);

        // ── Y axis ──────────────────────────────────────────────────────────
        const hist = record.state.history;
        const histLines = record.state.historyLines || ['avg', 'peak'];
        const yMaxFromData = hist.length > 0
            ? Math.max(1, ...hist.flatMap(p => histLines.map(m => Math.abs(p[m] || 0))))
            : 1;
        const yMax = Math.max(this._computeGaugeMax(key), yMaxFromData);

        // Determine unit from yMax once — all tick values use this same scale so
        // sub-1W ticks (e.g. 0.5 W) don't accidentally switch to mW and show "500".
        const { scaled: yMaxScaled, unit: yUnit } = this.scalePower(yMax);
        const toDisplayUnit = yMax > 0 ? yMaxScaled / yMax : 1; // watts → display unit
        const yForValue = val => plotY + plotH - (Math.max(0, Math.min(val, yMax)) / yMax) * plotH;

        // Choose decimal places based on the step size in display units.
        // e.g. step=0.5 → 2 dec ("0.50"), step=25 → 0 dec ("25"), step=2.5 → 1 dec ("2.5")
        const yTicks = 5;
        const stepInUnit = yMaxScaled / (yTicks - 1);
        const decPlaces = stepInUnit >= 100 ? 0 : stepInUnit >= 10 ? 1 : stepInUnit >= 1 ? 2 : 3;

        ctx.font = FONT_TICK;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < yTicks; i++) {
            const frac  = i / (yTicks - 1);
            const y     = plotY + frac * plotH;
            const value = yMax * (1 - frac);

            ctx.strokeStyle = pal.gridLine;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(plotX, y);
            ctx.lineTo(plotX + plotW, y);
            ctx.stroke();

            ctx.fillStyle = pal.axisLabel;
            const rawStr = (value * toDisplayUnit).toFixed(decPlaces);
            const numStr = rawStr.includes('.') ? rawStr.replace(/\.?0+$/, '') : rawStr;
            ctx.fillText(numStr, plotX - 6, y);
        }

        // Unit label right-aligned well above the top tick for clear separation
        ctx.font = FONT_UNIT;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = pal.axisLabelFaint;
        ctx.fillText(`(${yUnit})`, plotX - 6, plotY - 14);

        // ── Plot border ──────────────────────────────────────────────────────
        ctx.strokeStyle = pal.plotBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(plotX, plotY, plotW, plotH);

        // ── X-axis: fixed grid anchored to right edge ────────────────────────
        // xForAgo maps "ms ago from now" to canvas x. Tick positions are pure
        // fractions of windowMs, so they are completely static between frames.
        const windowMs   = record.state.historyWindowMs || 30000;
        const xForAgo    = msAgo => plotX + plotW - (msAgo / windowMs) * plotW;

        const CLEAN_INTERVALS_MS = [
            500, 1000, 2000, 5000, 10000, 15000, 30000,
            60000, 120000, 300000, 600000, 900000, 1800000,
            3600000, 7200000, 10800000, 21600000, 43200000, 86400000,
        ];
        const tickIntervalMs = CLEAN_INTERVALS_MS.find(c => c >= windowMs / 6)
            || CLEAN_INTERVALS_MS[CLEAN_INTERVALS_MS.length - 1];

        const formatTimeLabel = msAgo => {
            if (msAgo === 0) return 'now';
            if (msAgo < 60000)   return `-${msAgo / 1000 % 1 === 0 ? msAgo / 1000 : (msAgo / 1000).toFixed(1)}s`;
            if (msAgo < 3600000) return `-${Math.round(msAgo / 60000)}m`;
            const h = msAgo / 3600000;
            return `-${h % 1 === 0 ? h : h.toFixed(1)}h`;
        };

        ctx.font = FONT_TICK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // "now" pinned at right edge
        ctx.strokeStyle = pal.gridLineFaint;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(plotX + plotW, plotY); ctx.lineTo(plotX + plotW, plotY + plotH); ctx.stroke();
        ctx.fillStyle = pal.axisLabelFaint;
        ctx.fillText('now', plotX + plotW, plotY + plotH + 5);

        // Interior ticks at fixed msAgo multiples — never scroll between frames
        for (let msAgo = tickIntervalMs; msAgo < windowMs; msAgo += tickIntervalMs) {
            const x = xForAgo(msAgo);
            if (x < plotX + 10) continue;

            ctx.strokeStyle = pal.gridLineFaint;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, plotY); ctx.lineTo(x, plotY + plotH); ctx.stroke();

            ctx.fillStyle = pal.axisLabelFaint;
            ctx.fillText(formatTimeLabel(msAgo), x, plotY + plotH + 5);
        }

        // ── No-data message ──────────────────────────────────────────────────
        if (hist.length < 2) {
            ctx.font = '14px sans-serif';
            ctx.fillStyle = pal.noData;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Waiting for data…', plotX + plotW / 2, plotY + plotH / 2);
            return;
        }

        // ── Data lines ───────────────────────────────────────────────────────
        // tNow is sampled once so all points share a consistent "now" reference
        const tNow        = Date.now();
        const tWindowStart = tNow - windowMs;

        // Collect visible points; carry one point just before the window so
        // lines enter cleanly from the left rather than jumping into view.
        const visiblePts = [];
        let prevPt = null;
        for (const pt of hist) {
            if (pt.t < tWindowStart) { prevPt = pt; continue; }
            if (prevPt) { visiblePts.push(prevPt); prevPt = null; }
            visiblePts.push(pt);
        }

        if (visiblePts.length < 1) {
            ctx.font = '14px sans-serif';
            ctx.fillStyle = pal.noData;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No data in range', plotX + plotW / 2, plotY + plotH / 2);
            return;
        }

        const drawLine = (color, getter) => {
            ctx.save();
            ctx.beginPath();
            ctx.rect(plotX, plotY, plotW, plotH);
            ctx.clip();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            visiblePts.forEach((pt, i) => {
                const x = xForAgo(tNow - pt.t);
                const y = yForValue(getter(pt));
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.restore();
        };

        histLines.forEach(metric => {
            const color = pal.histColors[metric] || pal.histColors.avg;
            drawLine(color, p => p[metric] || 0);
        });
    };

    // ─── Monitoring ───────────────────────────────────────────────────────────

    DWMControl.prototype.startMeterMonitoring = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state || record.state.monitorTimer || record.connectionState !== 'connected') return;

        await this.pollMeterSnapshot(key);
        record.state.monitorTimer = window.setInterval(() => {
            this.pollMeterSnapshot(key);
        }, record.state.pollIntervalMs);
        this.updateMeterCardUI(key);
    };

    DWMControl.prototype.stopMeterMonitoring = function(key, silent = false) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state) return;
        if (record.state.monitorTimer) {
            clearInterval(record.state.monitorTimer);
            record.state.monitorTimer = null;
        }
        record.state.monitorBusy = false;
        this.updateMeterCardUI(key);
        if (!silent) this.setMeterStatus(key, 'Snapshot polling stopped.', 'ready');
    };

    DWMControl.prototype.pollMeterSnapshot = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state || record.connectionState !== 'connected' || record.state.monitorBusy) return;

        record.state.monitorBusy = true;
        try {
            await this.refreshPowerSnapshot(key, { quiet: true });
            record.state.consecutiveFailures = 0;
            record.state.lastSuccessfulPoll = Date.now();
            const ms = record.state.pollIntervalMs;
            this.setMeterStatus(key, `${ms}ms polling active. Snapshot data is updating live.`, 'active');
        } catch (error) {
            record.state.consecutiveFailures = (record.state.consecutiveFailures || 0) + 1;
            this.setMeterStatus(key, `No response (${record.state.consecutiveFailures})…`, 'warning');
            // After 3 consecutive timeouts, assume a remote reset and attempt to reconnect
            if (record.state.consecutiveFailures >= 3 && !record._watchdogActive) {
                this._triggerMeterWatchdogReconnect(key);
            }
        } finally {
            record.state.monitorBusy = false;
        }
    };

    // Reconnect after remote firmware reset without erasing chart history
    DWMControl.prototype._triggerMeterWatchdogReconnect = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || record.connectionState !== 'connected' || record._watchdogActive) return;

        record._watchdogActive = true;
        const savedHistory  = record.state ? [...(record.state.history  || [])] : [];
        const savedPollMs   = record.state ? (record.state.pollIntervalMs || 250) : 250;

        this.appendOutput(`Watchdog: no response from ${record.portPath} — reconnecting…`);
        this.setMeterStatus(key, 'No response — reconnecting…', 'warning');

        this.stopMeterMonitoring(key, true);
        try { await window.electronAPI.closeSerialPort(record.portPath); } catch (_) {}

        record.connectionState = 'available';
        this.updateMeterCardUI(key);

        const delayMs = 1500;
        const retryDelayMs = 2500;
        const maxAttempts = 6;
        let attempts = 0;

        await new Promise(resolve => setTimeout(resolve, delayMs));

        const attempt = async () => {
            if (!this.meterRegistry.has(key)) {
                // Meter was removed from registry during the wait — abort
                record._watchdogActive = false;
                return;
            }
            attempts++;
            try {
                const result = await window.electronAPI.openSerialPort(record.portPath, 115200);
                if (result.success) {
                    // Restore state, keeping chart history
                    record.state = this.createMeterState();
                    record.state.history       = savedHistory;
                    record.state.pollIntervalMs = savedPollMs;
                    record.connectionState = 'connected';
                    record.lastSeenAt      = Date.now();
                    record._watchdogActive  = false;
                    this.isConnected = true;
                    if (!this.activeMeterKey) this.activeMeterKey = key;
                    this.updateMeterCardUI(key);
                    this.appendOutput(`Watchdog: reconnected to ${record.portPath} (history preserved)`);
                    this._autoQueryMeterOnConnect(key);
                    this.startMeterMonitoring(key);
                } else if (attempts < maxAttempts) {
                    this.setMeterStatus(key, `Reconnect attempt ${attempts}/${maxAttempts} failed…`, 'warning');
                    setTimeout(attempt, retryDelayMs);
                } else {
                    record._watchdogActive = false;
                    this.setMeterStatus(key, 'Auto-reconnect failed. Use Connect to retry.', 'error');
                }
            } catch (err) {
                if (attempts < maxAttempts) {
                    setTimeout(attempt, retryDelayMs);
                } else {
                    record._watchdogActive = false;
                    this.setMeterStatus(key, `Auto-reconnect failed: ${err.message}`, 'error');
                }
            }
        };

        attempt();
    };

    DWMControl.prototype.refreshPowerSnapshot = async function(key, options = {}) {
        try {
            const response = await this.sendApiCommand(key, 'pwr.snap');
            // Expand compact d=CSV into named fields.
            // Fixed order: inst, avg, peak, max, min, dev, pvolt(mV), svolt(V)
            const D_KEYS = ['inst','avg','peak','max','min','dev','pvolt','svolt'];
            if (response.d) {
                response.d.split(',').forEach((v, i) => {
                    if (i < D_KEYS.length) response[D_KEYS[i]] = v;
                });
            }
            const sid = this.meterSafeId(key);
            const metrics = ['inst','avg','peak','max','min','dev'];
            const values = metrics.map(m => Math.abs(Number.parseFloat(response[m]) || 0));
            const scaleMax = Math.max(1, ...values);

            const record = this.meterRegistry.get(key);
            if (record && record.state) {
                record.state.snapshotScaleMax = scaleMax;
                record.state.lastSnapshotRaw = response;
            }

            const rawPeak = Number.parseFloat(response.peak) || 0;
            const heldPeak = this._applyPepHoldValue(key, rawPeak);
            const displayResponse = { ...response, peak: heldPeak };

            // Cache element/range from snap response (snap also returns these fields)
            if (record) {
                const evRaw = Number.parseFloat(response.eval);
                if (Number.isFinite(evRaw) && evRaw > 0) record.elementRating = evRaw;
                const elemRaw = Number.parseInt(response.elem, 10);
                if (Number.isFinite(elemRaw) && elemRaw >= 1 && elemRaw <= 8) {
                    // Clear history when the active element changes (device-side switch)
                    if (record.state && record.elementId !== elemRaw) {
                        record.state.history = [];
                    }
                    record.elementId = elemRaw;
                }
                record.elementType = String(response.etype || record.elementType || '30ua').toLowerCase();
                if (response.range !== undefined) {
                    record.rangeMultiplier = this._parseRangeMultiplier(response.range);
                }
                record.rangeCfg = record.rangeMultiplier >= 4 ? 1 : 0;
                // Calculate max power and store it
                if (record.state) {
                    record.state.elementRating = record.elementRating;
                    record.state.rangeMultiplier = record.rangeMultiplier;
                    record.state.maxPowerW = record.elementRating * record.rangeMultiplier;
                }
                this._updateGaugeScale(key);
                const elemSelect = document.getElementById(`meter-${sid}-cfg-elem`);
                const evalSelect = document.getElementById(`meter-${sid}-cfg-eval`);
                const etypeSelect = document.getElementById(`meter-${sid}-cfg-etype`);
                const rangeSelect = document.getElementById(`meter-${sid}-cfg-range`);
                const rangeReadOnly = document.getElementById(`meter-${sid}-cfg-range-readonly`);
                if (elemSelect && Number.isFinite(record.elementId) && !(record.state && record.state.elementProfileMenuOpen)) {
                    elemSelect.innerHTML = this._renderElementProfileOptions(record, record.elementId);
                    elemSelect.value = String(record.elementId);
                }
                if (evalSelect && Number.isFinite(evRaw) && evRaw > 0 && !(record.state?.cfgDraftEval)) {
                    if (record.state?.topControlEditingId !== evalSelect.id) evalSelect.value = String(evRaw);
                }
                if (etypeSelect && !(record.state?.cfgDraftEtype)) {
                    if (record.state?.topControlEditingId !== etypeSelect.id) etypeSelect.value = record.elementType;
                }
                if (rangeSelect && record.state?.topControlEditingId !== rangeSelect.id) rangeSelect.value = String(record.rangeCfg);
                if (rangeReadOnly) rangeReadOnly.value = String(record.rangeCfg);
            }

            metrics.forEach(m => {
                const value = m === 'peak' ? displayResponse.peak : displayResponse[m];
                this.updateSnapshotMeterEl(key, m, value, scaleMax);
            });

            // Update gauge values with autoscaled units and clipping
            ['inst','avg','peak'].forEach(m => {
                const el = document.getElementById(`meter-${sid}-${m}`);
                if (!el) return;
                const rawValue = Number.parseFloat(displayResponse[m]) || 0;
                const displayStr = this.formatPowerWithClip(rawValue, record?.state?.maxPowerW || 0);
                el.textContent = displayStr.split(' ')[0];
                const unitEl = document.getElementById(`meter-${sid}-${m}-unit`);
                if (unitEl) unitEl.textContent = displayStr.split(' ')[1] || 'W';
            });

            const maxPower = record?.state?.maxPowerW || 0;
            this._updateMeterGauges(key, displayResponse);
            this._pushMeterHistory(key, response, maxPower);
            this._drawMeterHistory(key);

            const ids = {
                // pvolt arrives in mV from the d=CSV field
                [`meter-${sid}-pvolt`]: Number.isFinite(Number.parseFloat(response.pvolt)) ? `${Number.parseFloat(response.pvolt).toFixed(2)} mV` : '-',
                [`meter-${sid}-svolt`]: this.formatDecimal(response.svolt, 1, ' V'),
                [`meter-${sid}-snap-elem`]: response.elem || '-',
                [`meter-${sid}-snap-etype`]: response.etype || '-',
                [`meter-${sid}-snap-eval`]: this.formatPower(response.eval),
                [`meter-${sid}-snap-range`]: response.range || '-',
                [`meter-${sid}-snap-scale`]: this.formatPower(scaleMax),
                [`meter-${sid}-snap-updated`]: new Date().toLocaleTimeString(),
            };
            Object.entries(ids).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            });

            if (!options.quiet) this.setMeterStatus(key, 'Power snapshot updated.', 'ready');
            return response;
        } catch (error) {
            if (!options.quiet) this.appendOutput(`Power snapshot failed: ${error.message}`);
            this.setMeterStatus(key, error.message, 'error');
            throw error;
        }
    };

    // ─── cfg.get / cfg.set ───────────────────────────────────────────────────

    DWMControl.prototype.getCfgValue = async function(key, cfgKey, options = {}) {
        const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 1200;
        const response = await this.sendApiCommand(key, 'cfg.get', { key: cfgKey }, { timeoutMs });
        return response?.val;
    };

    DWMControl.prototype.refreshCfgAvgw = async function(key, options = {}) {
        const sid = this.meterSafeId(key);
        const val = await this.getCfgValue(key, 'avgw', options);
        const avgw = Number.parseFloat(val);
        const pinfoEl = document.getElementById(`meter-${sid}-pinfo-avgw`);
        const inputEl = document.getElementById(`meter-${sid}-cfg-avgw`);
        if (pinfoEl && Number.isFinite(avgw)) pinfoEl.textContent = this.formatDecimal(avgw, 3, ' s');
        if (inputEl && Number.isFinite(avgw)) inputEl.value = String(avgw);
        return val;
    };

    DWMControl.prototype.refreshCfgBrightness = async function(key, options = {}) {
        const sid = this.meterSafeId(key);
        const val = await this.getCfgValue(key, 'bright', options);
        const bright = Number.parseInt(val, 10);

        const record = this.meterRegistry.get(key);
        if (record?.state && Number.isFinite(bright)) record.state.lastKnownBrightness = Math.max(0, Math.min(10, bright));

        const inputEl = document.getElementById(`meter-${sid}-cfg-bright`);
        if (inputEl && Number.isFinite(bright)) inputEl.value = String(Math.max(0, Math.min(10, bright)));

        const statusEl = document.getElementById(`meter-${sid}-cfg-status`);
        if (statusEl && Number.isFinite(bright)) statusEl.textContent = `Read bright = ${Math.max(0, Math.min(10, bright))}`;

        return val;
    };

    DWMControl.prototype.setCfgValue = async function(key, cfgKey, inputId) {
        const inputEl = document.getElementById(inputId);
        if (!inputEl) return;
        const val = inputEl.value.trim();
        if (!val) { this.setMeterStatus(key, `Enter a value for ${cfgKey} before setting.`, 'warning'); return; }
        try {
            // cfg.set key=eval and key=etype require elem to identify which element to update
            const cmdFields = { key: cfgKey, val };
            if (cfgKey === 'eval' || cfgKey === 'etype') {
                const record = this.meterRegistry.get(key);
                const activeElem = Number.parseInt(record?.elementId, 10);
                if (!Number.isFinite(activeElem) || activeElem < 1 || activeElem > 8) {
                    this.setMeterStatus(key, `Cannot set ${cfgKey}: no element selected.`, 'warning');
                    return;
                }
                cmdFields.elem = activeElem;
            }
            const response = await this.sendApiCommand(key, 'cfg.set', cmdFields);
            const sid = this.meterSafeId(key);
            const statusEl = document.getElementById(`meter-${sid}-cfg-status`);
            if (statusEl) statusEl.textContent = `Set ${response.key} = ${response.val}`;

            if (cfgKey === 'bright') {
                const record = this.meterRegistry.get(key);
                const b = Number.parseInt(response.val, 10);
                if (record && record.state && Number.isFinite(b)) record.state.lastKnownBrightness = b;
            }

            if (cfgKey === 'elem') {
                const record = this.meterRegistry.get(key);
                const elem = Number.parseInt(response.val, 10);
                if (record && Number.isFinite(elem) && elem >= 1 && elem <= 8) {
                    const priorElem = Number.parseInt(record.elementId, 10);
                    record.elementId = elem;
                    const sid = this.meterSafeId(key);
                    const elemSelect = document.getElementById(`meter-${sid}-cfg-elem`);
                    if (elemSelect) {
                        elemSelect.innerHTML = this._renderElementProfileOptions(record, elem);
                        elemSelect.value = String(elem);
                    }
                    const profile = Array.isArray(record.elementProfiles)
                        ? record.elementProfiles.find(p => Number.parseInt(p.elem, 10) === elem)
                        : null;
                    if (profile) {
                        record.elementRating = Number.isFinite(Number.parseFloat(profile.eval)) ? Number.parseFloat(profile.eval) : record.elementRating;
                        record.elementType = String(profile.etype || record.elementType || '30ua').toLowerCase();
                        const evalSelect = document.getElementById(`meter-${sid}-cfg-eval`);
                        const etypeSelect = document.getElementById(`meter-${sid}-cfg-etype`);
                        if (evalSelect && Number.isFinite(record.elementRating) && record.elementRating > 0) evalSelect.value = String(record.elementRating);
                        if (etypeSelect) etypeSelect.value = record.elementType;
                    }
                    if (priorElem !== elem) this._resetMeterHistoryData(key);
                }
            }

            if (cfgKey === 'eval') {
                const record = this.meterRegistry.get(key);
                const evalW = Number.parseFloat(response.val);
                if (record && Number.isFinite(evalW) && evalW > 0) {
                    const priorEval = Number.parseFloat(record.elementRating);
                    record.elementRating = evalW;
                    if (record.state) {
                        record.state.elementRating = evalW;
                        record.state.maxPowerW = evalW * (record.rangeMultiplier || 1);
                    }
                    const sid = this.meterSafeId(key);
                    const evalSelect = document.getElementById(`meter-${sid}-cfg-eval`);
                    if (evalSelect) evalSelect.value = String(evalW);
                    if (Array.isArray(record.elementProfiles)) {
                        const activeElem = Number.parseInt(record.elementId, 10);
                        const profile = record.elementProfiles.find(p => Number.parseInt(p.elem, 10) === activeElem);
                        if (profile) profile.eval = evalW;
                        const elemSelect = document.getElementById(`meter-${sid}-cfg-elem`);
                        if (elemSelect) {
                            elemSelect.innerHTML = this._renderElementProfileOptions(record, activeElem);
                            elemSelect.value = String(activeElem);
                        }
                    }
                    this._updateGaugeScale(key);
                    if (record.state) record.state.cfgDraftEval = null;
                    if (!Number.isFinite(priorEval) || Math.abs(priorEval - evalW) > Math.max(1e-9, evalW * 1e-9)) {
                        this._resetMeterHistoryData(key);
                    }
                }
            }

            if (cfgKey === 'etype') {
                const record = this.meterRegistry.get(key);
                if (record) {
                    const etype = String(response.val || '').toLowerCase();
                    if (etype) {
                        record.elementType = etype;
                        const sid = this.meterSafeId(key);
                        const etypeSelect = document.getElementById(`meter-${sid}-cfg-etype`);
                        if (etypeSelect) etypeSelect.value = etype;
                        if (Array.isArray(record.elementProfiles)) {
                            const activeElem = Number.parseInt(record.elementId, 10);
                            const profile = record.elementProfiles.find(p => Number.parseInt(p.elem, 10) === activeElem);
                            if (profile) profile.etype = etype;
                            const elemSelect = document.getElementById(`meter-${sid}-cfg-elem`);
                            if (elemSelect) {
                                elemSelect.innerHTML = this._renderElementProfileOptions(record, activeElem);
                                elemSelect.value = String(activeElem);
                            }
                        }
                        if (record.state) record.state.cfgDraftEtype = null;
                        this._resetMeterHistoryData(key);
                    }
                }
            }

            if (cfgKey === 'range') {
                const record = this.meterRegistry.get(key);
                const rangeCfg = Number.parseInt(response.val, 10);
                if (record && (rangeCfg === 0 || rangeCfg === 1)) {
                    record.rangeCfg = rangeCfg;
                    record.rangeMultiplier = rangeCfg === 1 ? 4 : 2;
                    if (record.state) {
                        record.state.rangeMultiplier = record.rangeMultiplier;
                        record.state.maxPowerW = (record.elementRating || 0) * record.rangeMultiplier;
                    }
                    const sid = this.meterSafeId(key);
                    const rangeSelect = document.getElementById(`meter-${sid}-cfg-range`);
                    const rangeReadOnly = document.getElementById(`meter-${sid}-cfg-range-readonly`);
                    if (rangeSelect) rangeSelect.value = String(rangeCfg);
                    if (rangeReadOnly) rangeReadOnly.value = String(rangeCfg);
                    this._updateGaugeScale(key);
                }
            }

            this.setMeterStatus(key, `cfg.set: ${response.key} = ${response.val}`, 'ready');
        } catch (error) {
            this.appendOutput(`cfg.set failed: ${error.message}`);
            this.setMeterStatus(key, error.message, 'error');
        }
    };

    DWMControl.prototype.identifyMeter = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state || record.connectionState !== 'connected') {
            this.setMeterStatus(key, 'Connect to this meter before running identify.', 'warning');
            return;
        }
        if (record.state.identifyInProgress) {
            this.setMeterStatus(key, 'Identify is already running for this meter.', 'warning');
            return;
        }

        const sid = this.meterSafeId(key);
        const brightInput = document.getElementById(`meter-${sid}-cfg-bright`);
        const clampBright = (v, fallback = 8) => {
            const n = Number.parseInt(v, 10);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(0, Math.min(10, n));
        };

        // cfg.get is the authoritative source for the current brightness.
        let original = null;
        try {
            const readVal = await this.getCfgValue(key, 'bright', { timeoutMs: 1200 });
            original = clampBright(readVal, null);
            if (Number.isFinite(original)) {
                record.state.lastKnownBrightness = original;
                if (brightInput) brightInput.value = String(original);
            }
        } catch (error) {
            this.appendOutput(`Identify failed: cfg.get bright failed: ${error.message}`);
            this.setMeterStatus(key, `Identify failed: cfg.get bright failed: ${error.message}`, 'error');
            return;
        }

        if (!Number.isFinite(original)) {
            this.setMeterStatus(key, 'Identify failed: cfg.get returned invalid bright value.', 'error');
            return;
        }

        const sequence = [0, 8, 0, 8, 0, 8];
        const wasPolling = !!record.state.monitorTimer;
        if (wasPolling) {
            this.setMeterStatus(key, 'Identify requested. Pausing polling in 500 ms…', 'active');
            await new Promise(resolve => setTimeout(resolve, 500));
            this.stopMeterMonitoring(key, true);
        }

        record.state.identifyInProgress = true;
        this.updateMeterCardUI(key);
        this.setMeterStatus(key, 'Identify running: backlight blink sequence active…', 'active');

        try {
            for (let i = 0; i < sequence.length; i += 1) {
                if (record.connectionState !== 'connected') throw new Error('Meter disconnected during identify');
                const level = sequence[i];
                await this.sendApiCommand(key, 'cfg.set', { key: 'bright', val: String(level) });
                record.state.lastKnownBrightness = level;
                if (i < sequence.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                }
            }
            this.setMeterStatus(key, 'Identify pulse sequence complete. Restoring brightness…', 'active');
            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (error) {
            this.appendOutput(`Identify failed: ${error.message}`);
            this.setMeterStatus(key, `Identify failed: ${error.message}`, 'error');
        } finally {
            try {
                if (record.connectionState === 'connected') {
                    await this.sendApiCommand(key, 'cfg.set', { key: 'bright', val: String(original) });
                    record.state.lastKnownBrightness = original;
                    if (brightInput) brightInput.value = String(original);
                    this.setMeterStatus(key, `Identify complete. Brightness restored to ${original}.`, 'ready');
                }
            } catch (restoreError) {
                this.appendOutput(`Identify restore failed: ${restoreError.message}`);
                this.setMeterStatus(key, `Identify restore failed: ${restoreError.message}`, 'error');
            }
            record.state.identifyInProgress = false;
            this.updateMeterCardUI(key);
            if (wasPolling) this.startMeterMonitoring(key);
        }
    };

    // ─── UI update helpers ────────────────────────────────────────────────────

    DWMControl.prototype.updateSnapshotMeterEl = function(key, metric, value, scaleMax) {
        const sid = this.meterSafeId(key);
        const record = this.meterRegistry.get(key);
        const maxPower = record?.state?.maxPowerW || 0;
        
        const fillEl = document.getElementById(`meter-${sid}-fill-${metric}`);
        const valEl  = document.getElementById(`meter-${sid}-snap-${metric}`);
        const numVal = Number.parseFloat(value);
        const safe   = Number.isFinite(numVal) ? numVal : 0;
        const clipped = maxPower > 0 ? Math.min(safe, maxPower) : safe;
        const width  = Math.max(0, Math.min(100, (clipped / scaleMax) * 100));

        if (valEl) valEl.textContent = this.formatPowerWithClip(safe, maxPower);
        if (!fillEl) return;

        fillEl.style.width = `${width}%`;
        fillEl.classList.remove('low-power', 'medium-power', 'high-power');
        if (width >= 75) fillEl.classList.add('high-power');
        else if (width >= 35) fillEl.classList.add('medium-power');
        else fillEl.classList.add('low-power');
    };

    DWMControl.prototype.appendMeterDebug = function(key, direction, payload) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state) return;

        const sid = this.meterSafeId(key);
        const debugEl = document.getElementById(`meter-${sid}-debug`);
        if (!debugEl) return;

        const stamp = new Date().toLocaleTimeString();
        const text = String(payload).replace(/\r/g, '\\r').replace(/\n/g, '\\n\n');
        record.state.debugLines.push(`[${stamp}] ${direction}: ${text}`);
        if (record.state.debugLines.length > record.state.debugMaxLines) {
            record.state.debugLines = record.state.debugLines.slice(-record.state.debugMaxLines);
        }
        debugEl.value = record.state.debugLines.join('\n');
        debugEl.scrollTop = debugEl.scrollHeight;
    };

    DWMControl.prototype.clearMeterDebug = function(key) {
        const record = this.meterRegistry.get(key);
        if (record && record.state) record.state.debugLines = [];
        const sid = this.meterSafeId(key);
        const debugEl = document.getElementById(`meter-${sid}-debug`);
        if (debugEl) debugEl.value = '';
    };

    DWMControl.prototype.setMeterStatus = function(key, message, tone = 'ready') {
        const sid = this.meterSafeId(key);
        const banner = document.getElementById(`meter-${sid}-status`);
        if (!banner) return;
        banner.textContent = message;
        banner.className = `control-status-banner ${tone}`;
    };

    DWMControl.prototype.updateMeterLastFrame = function(key) {
        const sid = this.meterSafeId(key);
        const el = document.getElementById(`meter-${sid}-last-frame`);
        if (el) el.textContent = new Date().toLocaleTimeString();
    };

    DWMControl.prototype.formatPowerWithClip = function(watts, maxPowerW = 0) {
        const n = Number.parseFloat(watts);
        if (!Number.isFinite(n)) return '-';
        const isClipped = maxPowerW > 0 && n > maxPowerW;
        const displayValue = isClipped ? maxPowerW : n;
        const { scaled, unit } = this.scalePower(displayValue);
        const d = 3;  // Always 3 decimal places
        const prefix = isClipped ? '>' : '';
        return `${prefix}${scaled.toFixed(d)} ${unit}`;
    };

    DWMControl.prototype.formatVoltage = function(volts) {
        const n = Number.parseFloat(volts);
        if (!Number.isFinite(n)) return '-';
        const mV = n * 1000;
        return `${mV.toFixed(3)} mV`;
    };

    DWMControl.prototype.formatDecimal = function(value, digits = 6, suffix = '') {
        const n = Number.parseFloat(value);
        if (!Number.isFinite(n)) return '-';
        return `${n.toFixed(digits)}${suffix}`;
    };

    DWMControl.prototype.scalePower = function(watts) {
        const n = Number.parseFloat(watts);
        if (!Number.isFinite(n)) return { scaled: 0, unit: 'W' };
        const abs = Math.abs(n);
        if (abs === 0)   return { scaled: 0,       unit: 'W'  };
        if (abs < 1)     return { scaled: n * 1e3,  unit: 'mW' };
        if (abs < 1e3)   return { scaled: n,         unit: 'W'  };
        if (abs < 1e6)   return { scaled: n / 1e3,  unit: 'kW' };
        return               { scaled: n / 1e6,  unit: 'MW' };
    };

    DWMControl.prototype.formatPower = function(watts, digits) {
        const n = Number.parseFloat(watts);
        if (!Number.isFinite(n)) return '-';
        const { scaled, unit } = this.scalePower(n);
        const d = digits !== undefined ? digits : 3;  // Always 3 decimal places by default
        return `${scaled.toFixed(d)} ${unit}`;
    };

})();
