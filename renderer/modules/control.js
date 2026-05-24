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
            pollIntervalMs: Number.parseInt(this.config.globalSampleIntervalMs || 60, 10),
            monitorTimer: null,
            monitorActive: false,
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
        const baseOptions = [50, 60, 100, 125, 200, 250, 333, 500, 750, 1000, 1500, 2000];
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
        const candidates = [cfg.globalTimingMs, cfg.globalSampleIntervalMs, cfg.globalApiPacingMs, 60];
        for (const candidate of candidates) {
            const ms = Number.parseInt(candidate, 10);
            if (Number.isFinite(ms) && ms >= 50 && ms <= 2000) return ms;
        }
        return 60;
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
        if (!Number.isFinite(raw)) return 85;
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
            // pollIntervalMs is read dynamically by scheduleNext() each cycle,
            // so no timer restart is needed — the change takes effect on the next poll.
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

    DWMControl.prototype._getBoardLayout = function() {
        const valid = ['column', 'auto-fit', 'grid-2', 'grid-3', 'grid-4'];
        const v = this.config.boardLayout;
        return valid.includes(v) ? v : 'grid-2';
    };

    DWMControl.prototype._applyBoardLayout = function(layout, persist) {
        const valid = ['column', 'auto-fit', 'grid-2', 'grid-3', 'grid-4'];
        if (!valid.includes(layout)) return;
        const board = document.getElementById('meter-board');
        if (board) board.dataset.boardLayout = layout;
        if (persist !== false) {
            this.config.boardLayout = layout;
            this.saveConfig();
        }
        requestAnimationFrame(() => this._repaintAllCanvases());
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
        const boardLayout = this._getBoardLayout();
        const smoothingPct = this._getGlobalGaugeSmoothing();
        const panelVisible = Boolean(this.config.globalSettingsPanelVisible);
        const debugLoggingEnabled = this.config.globalDebugLoggingEnabled === true;
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
                    <div class="meter-settings-group" style="display:none">
                        <label class="meter-global-toolbar-label" for="global-gauge-smoothing">Gauge Smoothing (%)</label>
                        <input type="range" id="global-gauge-smoothing" min="0" max="95" step="5" value="${smoothingPct}">
                        <span id="global-gauge-smoothing-value" class="meter-settings-value">${smoothingPct}%</span>
                    </div>
                    <div class="meter-settings-group">
                      <label class="meter-settings-checkbox">
                        <input type="checkbox" id="global-debug-logging" ${debugLoggingEnabled ? 'checked' : ''}>
                        Enable serial debug logging
                      </label>
                    </div>
                    <div class="meter-settings-group">
                        <label class="meter-global-toolbar-label" for="global-board-layout">Board Layout</label>
                        <select id="global-board-layout" class="form-select form-select-sm">
                            <option value="column"${boardLayout === 'column' ? ' selected' : ''}>Single Column</option>
                            <option value="auto-fit"${boardLayout === 'auto-fit' ? ' selected' : ''}>Auto-Fit Grid</option>
                            <option value="grid-2"${boardLayout === 'grid-2' ? ' selected' : ''}>2 Columns</option>
                            <option value="grid-3"${boardLayout === 'grid-3' ? ' selected' : ''}>3 Columns</option>
                            <option value="grid-4"${boardLayout === 'grid-4' ? ' selected' : ''}>4 Columns</option>
                        </select>
                    </div>
                    <div class="meter-settings-group">
                        <div class="meter-settings-group-label">Derived Measurements</div>
                        <button class="btn btn-secondary btn-small" id="add-swr-card-btn" style="width:100%">+ Add SWR / Return Loss Card</button>
                    </div>
                </aside>
            </div>
        `;

        const settingsToggle = document.getElementById('meter-settings-toggle');
        const settingsRail   = document.getElementById('meter-settings-rail');
        const doToggle = () => {
            const visible = !document.getElementById('meter-page-shell')?.classList.contains('settings-open');
            this._setGlobalSettingsPanelVisible(Boolean(visible));
        };
        if (settingsToggle) {
            settingsToggle.addEventListener('click', (e) => {
                e.stopPropagation(); // prevent rail handler from also firing
                doToggle();
            });
        }
        if (settingsRail) {
            settingsRail.addEventListener('click', doToggle);
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

        const debugLoggingInput = document.getElementById('global-debug-logging');
        if (debugLoggingInput) {
          debugLoggingInput.addEventListener('change', () => {
            this.config.globalDebugLoggingEnabled = Boolean(debugLoggingInput.checked);
            this.saveConfig();
          });
        }

        const boardLayoutSelect = document.getElementById('global-board-layout');
        if (boardLayoutSelect) {
            boardLayoutSelect.addEventListener('change', () => {
                this._applyBoardLayout(boardLayoutSelect.value, true);
            });
        }

        const addSwrBtn = document.getElementById('add-swr-card-btn');
        if (addSwrBtn) {
            addSwrBtn.addEventListener('click', () => this.addSwrCard());
        }

        this._applyGlobalTimingMs(timingMs, { persist: false, restartTimers: false });
        this._applyBoardLayout(boardLayout, false);
        this._initDragDrop();
        this._setupCanvasResizeObserver();
    };

    // ─── Drag-and-drop card ordering ──────────────────────────────────────────

    DWMControl.prototype._cardTokenFromElement = function(el) {
      if (!el) return null;
      if (el.classList.contains('meter-card') && el.dataset.meterKey) return `meter:${el.dataset.meterKey}`;
      if (el.classList.contains('swr-card') && el.dataset.swrId) return `swr:${el.dataset.swrId}`;
      return null;
    };

    DWMControl.prototype._persistBoardOrderFromDom = function(board) {
      const cardEls = [...board.querySelectorAll('.meter-card, .swr-card')];
      const boardOrder = cardEls.map(el => this._cardTokenFromElement(el)).filter(Boolean);
      const meterOrder = cardEls
        .filter(el => el.classList.contains('meter-card') && el.dataset.meterKey)
        .map(el => el.dataset.meterKey);

      this.config.boardCardOrder = boardOrder;
      this.config.meterCardOrder = meterOrder;
      this.saveConfig();
    };

    DWMControl.prototype._initDragDrop = function() {
        const board = document.getElementById('meter-board');
        if (!board) return;

      let dragSrcToken = null;
        let dragSrcEl  = null;
      let dragArmedEl = null;

      // Arm dragging only when pointer starts on a drag handle.
      board.addEventListener('pointerdown', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) {
          dragArmedEl = null;
          return;
        }
        const handle = target.closest('.meter-drag-handle');
        dragArmedEl = handle ? handle.closest('.meter-card, .swr-card') : null;
      });

        board.addEventListener('dragstart', (e) => {
        const target = e.target;
        if (!(target instanceof Element)) { e.preventDefault(); return; }

        const card = target.closest('.meter-card, .swr-card');
            if (!card) return;

        // Only start drag when this card was armed from its drag handle.
        if (dragArmedEl !== card) { e.preventDefault(); return; }

        dragSrcToken = this._cardTokenFromElement(card);
        if (!dragSrcToken) { e.preventDefault(); return; }
            dragSrcEl  = card;
            card.classList.add('meter-card-dragging');
            e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragSrcToken);
        });

        board.addEventListener('dragend', () => {
            if (dragSrcEl) dragSrcEl.classList.remove('meter-card-dragging');
            board.querySelectorAll('.meter-card-drag-over').forEach(el =>
                el.classList.remove('meter-card-drag-over')
            );
            dragSrcToken = null;
            dragSrcEl  = null;
        dragArmedEl = null;
        });

        board.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const target = e.target.closest('.meter-card, .swr-card');
            board.querySelectorAll('.meter-card-drag-over').forEach(el =>
                el.classList.remove('meter-card-drag-over')
            );
            if (target && target !== dragSrcEl) {
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
          const target = e.target.closest('.meter-card, .swr-card');
          if (!target || !dragSrcEl || !dragSrcToken) return;
          if (target === dragSrcEl) return;

          // Swap source/target card positions in-place.
          const placeholder = document.createElement('div');
          board.replaceChild(placeholder, dragSrcEl);
          board.replaceChild(dragSrcEl, target);
          board.replaceChild(target, placeholder);

          this._persistBoardOrderFromDom(board);
        });
    };

    DWMControl.prototype.refreshMeterBoard = function() {
        const board = document.getElementById('meter-board');
        if (!board) return;

      const lockUntil = Number(this._boardInteractionLockUntil) || 0;
      if (Date.now() < lockUntil) return;

      // Discovery runs every ~2s; avoid reordering/reinserting cards while the
      // user is interacting with layout selectors, which can close the dropdown.
      const activeEl = document.activeElement;
      const isEditingBoardControl =
        activeEl instanceof Element &&
        board.contains(activeEl) && (
          activeEl.matches('select, input, textarea') ||
          activeEl.classList.contains('meter-layout-select') ||
          activeEl.dataset?.swrField === 'cardLayout'
        );
      if (isEditingBoardControl) {
        this._boardInteractionLockUntil = Date.now() + 900;
        return;
      }

        const meterOrder = Array.isArray(this.config.meterCardOrder) ? this.config.meterCardOrder : [];
        const swrCards = Array.isArray(this.config.swrCards) ? this.config.swrCards : [];
        const swrCardMap = new Map(swrCards.map(cfg => [cfg.id, cfg]));
        const swrRegistry = this._getSwrRegistry();

        // Global board order supports both meter and SWR cards: meter:<key> / swr:<id>
        let boardOrder = Array.isArray(this.config.boardCardOrder) ? [...this.config.boardCardOrder] : [];
        if (boardOrder.length === 0) {
          boardOrder = [
            ...meterOrder.map(key => `meter:${key}`),
            ...swrCards.map(cfg => `swr:${cfg.id}`),
          ];
        }

        // Keep order complete (append new items) without dropping temporarily-missing meters.
        for (const key of meterOrder) {
          const token = `meter:${key}`;
          if (!boardOrder.includes(token)) boardOrder.push(token);
        }
        for (const cfg of swrCards) {
          const token = `swr:${cfg.id}`;
          if (!boardOrder.includes(token)) boardOrder.push(token);
        }

        // Prune removed SWR cards from board order.
        boardOrder = boardOrder.filter(token => {
          if (!token.startsWith('swr:')) return true;
          const id = token.slice(4);
          return swrCardMap.has(id);
        });

        const prevBoardOrder = Array.isArray(this.config.boardCardOrder) ? this.config.boardCardOrder : [];
        const nextMeterOrder = boardOrder
          .filter(token => token.startsWith('meter:'))
          .map(token => token.slice(6));
        const prevMeterOrder = Array.isArray(this.config.meterCardOrder) ? this.config.meterCardOrder : [];
        const boardOrderChanged = JSON.stringify(prevBoardOrder) !== JSON.stringify(boardOrder);
        const meterOrderChanged = JSON.stringify(prevMeterOrder) !== JSON.stringify(nextMeterOrder);

        this.config.boardCardOrder = boardOrder;

        const emptyEl = document.getElementById('meter-board-empty');

        // Remove DOM cards whose sources no longer exist.
        board.querySelectorAll('.meter-card').forEach(el => {
          if (!this.meterRegistry.has(el.dataset.meterKey)) el.remove();
        });
        board.querySelectorAll('.swr-card').forEach(el => {
          if (!swrCardMap.has(el.dataset.swrId)) el.remove();
        });

        // Build/refresh cards in configured mixed order.
        boardOrder.forEach((token, index) => {
          if (token.startsWith('meter:')) {
            const key = token.slice(6);
            const record = this.meterRegistry.get(key);
            if (!record) return;

            let created = false;
            let cardEl = board.querySelector(`.meter-card[data-meter-key="${CSS.escape(key)}"]`);
            if (!cardEl) {
              const html = this.renderMeterCard(record);
              const wrapper = document.createElement('div');
              wrapper.innerHTML = html;
              cardEl = wrapper.firstElementChild;
              created = true;
            } else {
              this.updateMeterCardUI(key);
            }

            board.insertBefore(cardEl, board.children[index] || null);

            if (created && record.state?.cardLayout && record.state.cardLayout !== 'dual') {
              this._setMeterCardLayout(record.key, record.state.cardLayout);
            }
            return;
          }

          if (token.startsWith('swr:')) {
            const id = token.slice(4);
            const cfg = swrCardMap.get(id);
            if (!cfg) return;

            let swrRec = swrRegistry.get(id);
            if (!swrRec) {
              swrRec = {
                id:        cfg.id,
                fwdKey:    cfg.fwdKey    || null,
                refKey:    cfg.refKey    || null,
                fwdMetric: cfg.fwdMetric || 'avg',
                refMetric: cfg.refMetric || 'avg',
                state:     this.createSwrCardState(),
              };
              swrRegistry.set(id, swrRec);
            } else {
              swrRec.fwdKey    = cfg.fwdKey    || null;
              swrRec.refKey    = cfg.refKey    || null;
              swrRec.fwdMetric = cfg.fwdMetric || 'avg';
              swrRec.refMetric = cfg.refMetric || 'avg';
            }

            const sid = this.swrSafeId(id);
            let created = false;
            let cardEl = document.getElementById(`swr-card-${sid}`);
            if (!cardEl) {
              const html = this.renderSwrCard(swrRec);
              const wrapper = document.createElement('div');
              wrapper.innerHTML = html;
              cardEl = wrapper.firstElementChild;
              created = true;
            }

            board.insertBefore(cardEl, board.children[index] || null);

            if (created && swrRec.state?.cardLayout && swrRec.state.cardLayout !== 'both') {
              this._setSwrCardLayout(id, swrRec.state.cardLayout);
            }
          }
        });

        // Keep meter-only order synced to the board's current meter sequence.
        this.config.meterCardOrder = nextMeterOrder;

        if (boardOrderChanged || meterOrderChanged) this.saveConfig();

        // Show placeholder only when there are no rendered cards.
        const hasContent = board.querySelector('.meter-card, .swr-card') !== null;
        if (emptyEl) emptyEl.style.display = hasContent ? 'none' : '';
    };

    DWMControl.prototype.renderMeterCard = function(record) {
        const sid = this.meterSafeId(record.key);
        const isConnected = record.connectionState === 'connected';
        const connState = record.connectionState || 'available';
        const badgeClass = connState === 'connected' ? 'connected' : (connState === 'disconnected' ? 'disconnected' : (connState === 'not-configured' ? 'not-configured' : 'available'));
        const badgeText  = connState === 'connected' ? 'Connected' : (connState === 'disconnected' ? 'Disconnected' : (connState === 'not-configured' ? 'Not Configured' : 'Available'));
        const portLabel = record.portPath || '-';
        const nameLabel = record.friendlyName || 'DWM V2';
        const uidLabel = record.apiUid || record.fallbackUid || '-';
        const gaugeMetricL = record.gaugeMetricL || 'avg';
        const gaugeMetricR = record.gaugeMetricR || 'peak';
        const gaugeDisplayL = record.gaugeDisplayL || 'gauge';
        const gaugeDisplayR = record.gaugeDisplayR || 'gauge';
        const pepHoldMs = Number.isFinite(record.pepHoldMs) ? Math.max(0, record.pepHoldMs) : 1000;
        const isMonitoring = Boolean(record.state && record.state.monitorActive);
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
    </div>
    <div class="meter-card-header-right">
      <button id="meter-${sid}-connect-btn" class="btn btn-small meter-connect-btn meter-connect-btn-${connState}" data-meter-action="${isConnected ? 'disconnect' : 'connect'}">${badgeText}</button>
      <button class="btn btn-secondary btn-small" data-meter-action="check-updates" ${!isConnected ? 'disabled' : ''}>Check Updates</button>
      <button class="btn btn-secondary btn-small" data-meter-action="identify-meter" ${!isConnected ? 'disabled' : ''}>Identify</button>
      <button class="btn btn-secondary btn-small meter-settings-btn" data-meter-action="toggle-cfg" title="Meter settings">⚙</button>
    </div>
  </div>

  <div id="meter-${sid}-fw-update-notice" class="meter-fw-update-notice" style="display:none"></div>

  <div class="meter-live-section" id="meter-${sid}-readings-bar" style="${isConnected ? '' : 'display:none'}">
    <div class="meter-live-toolbar">
      <div class="meter-live-toolbar-left">
        <div class="meter-view-toggle">
          <button class="meter-view-btn active" data-meter-action="view-meters">Meters</button>
          <button class="meter-view-btn" data-meter-action="view-history">History</button>
        </div>
        <select class="form-select form-select-sm meter-layout-select" data-meter-field="cardLayout">
          <option value="dual"${cardLayout === 'dual'       ? ' selected' : ''}>Dual Gauges</option>
          <option value="single-L"${cardLayout === 'single-L'   ? ' selected' : ''}>Left Only</option>
          <option value="single-R"${cardLayout === 'single-R'   ? ' selected' : ''}>Right Only</option>
          <option value="wide-left"${cardLayout === 'wide-left'  ? ' selected' : ''}>Wide Left</option>
          <option value="wide-right"${cardLayout === 'wide-right' ? ' selected' : ''}>Wide Right</option>
          <option value="stacked"${cardLayout === 'stacked'    ? ' selected' : ''}>Stacked</option>
        </select>
        <div class="meter-chart-actions" style="display:none">
                    <button class="btn btn-secondary btn-small" data-meter-action="export-history">Export Data</button>
        </div>
      </div>
    </div>
    <div class="meter-elem-info-bar" id="meter-${sid}-elem-info-bar" style="display:none">
            <div class="meter-elem-inline-group meter-elem-profile-group">
                <span class="meter-elem-inline-label">Element Profile</span>
                <select id="meter-${sid}-cfg-elem" class="form-select form-select-sm">${this._renderElementProfileOptions(record, selectedElem)}</select>
            </div>
            <button class="btn btn-secondary btn-small" data-meter-action="refresh-element-profiles" ${!isConnected ? 'disabled' : ''}>Refresh Elements</button>
            <div class="meter-elem-inline-group">
                <span class="meter-elem-inline-label">Rating</span>
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
            <button class="btn btn-secondary btn-small" data-meter-action="more-info">More Info</button>
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

  <dialog class="meter-detail-dialog" id="meter-${sid}-detail">
    <div class="meter-detail-dialog-header">
      <span class="meter-detail-dialog-title">Device Details — ${nameLabel}</span>
      <div class="meter-detail-dialog-header-actions">
        <button id="meter-${sid}-poll-toggle-btn" class="btn btn-small ${isMonitoring ? 'btn-danger' : 'btn-secondary'}" data-meter-action="toggle-poll" ${!isConnected ? 'disabled' : ''}>${isMonitoring ? 'Stop Polling' : 'Start Polling'}</button>
        <button class="btn btn-text btn-small" data-meter-action="close-more-info" title="Close">✕</button>
      </div>
    </div>
    <div class="meter-detail-dialog-body">

    <div id="meter-${sid}-status" class="control-status-banner warning">
      ${isConnected ? 'Connected. Use Refresh All or individual actions to query the device.' : 'Connect to this meter to use the control API.'}
    </div>

    <div class="meter-detail-toolbar">
      <button class="btn btn-primary btn-small" data-meter-action="refresh-all" ${!isConnected ? 'disabled' : ''}>Refresh All</button>
    </div>

    <div class="meter-detail-section">
      <h4 class="meter-detail-heading">Device Name</h4>
      <div class="form-group">
        <div class="input-group">
          <input id="meter-${sid}-name-input" class="form-input" type="text" placeholder="bench_meter_a" maxlength="20" data-meter-name-key="${record.key}" style="width:180px;flex:none;">
          <button class="btn btn-secondary btn-small" data-meter-action="load-name" ${!isConnected ? 'disabled' : ''}>Load</button>
          <button class="btn btn-primary btn-small" data-meter-action="save-name" ${!isConnected ? 'disabled' : ''}>Save</button>
        </div>
        <p class="control-helper-text">Letters, numbers, and _ only. Spaces auto-convert to _.</p>
      </div>
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
      <h4 class="meter-detail-heading">Brightness</h4>
      <div class="control-info-grid compact">
        <div class="control-info-item"><span class="control-info-label">Backlight (0-10)</span></div>
        <div class="control-info-item"><div class="input-group"><input id="meter-${sid}-cfg-bright" class="form-input" type="number" min="0" max="10" step="1" placeholder="0-10" style="width:64px;flex:none;"><button class="btn btn-secondary btn-small" data-meter-action="cfg-bright" ${!isConnected ? 'disabled' : ''}>Set</button></div></div>
      </div>
      <p id="meter-${sid}-bright-status" class="control-helper-text"></p>
    </div>

    <div class="meter-detail-section">
      <h4 class="meter-detail-heading">Averaging</h4>
      <div class="control-info-grid compact">
        <div class="control-info-item"><span class="control-info-label">Window (0.5-10 s)</span></div>
        <div class="control-info-item"><div class="input-group"><input id="meter-${sid}-cfg-avgw" class="form-input" type="number" min="0.5" max="10" step="0.5" placeholder="0.5-10" style="width:74px;flex:none;"><button class="btn btn-secondary btn-small" data-meter-action="cfg-avgw" ${!isConnected ? 'disabled' : ''}>Set</button></div></div>
      </div>
      <p id="meter-${sid}-cfg-status" class="control-helper-text"></p>
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
  </dialog>
</div>`;
    };

    // ─── SWR / Return Loss card helpers ─────────────────────────────────────

    DWMControl.prototype._getSwrRegistry = function() {
        if (!this.swrCardRegistry) this.swrCardRegistry = new Map();
        return this.swrCardRegistry;
    };

    DWMControl.prototype.swrSafeId = function(id) {
        return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
    };

    DWMControl.prototype.createSwrCardState = function() {
        return {
            history: [],
            historyWindowMs: 30000,
            lastComputed: null,   // {swr, rl, gamma, fwdW, refW, ts}
            viewMode: 'gauges',
            cardLayout: 'both',
            bestSwr:  null,   // lowest SWR seen (avg metric)
            worstSwr: null,   // highest SWR seen (avg metric)
            bestRl:   null,   // highest RL (dB) seen (avg metric)
            worstRl:  null,   // lowest RL (dB) seen (avg metric)
        };
    };

    DWMControl.prototype.addSwrCard = function() {
        if (!this.config.swrCards) this.config.swrCards = [];
        const id = `swr-${Date.now()}`;
        this.config.swrCards.push({ id, fwdKey: null, refKey: null, fwdMetric: 'avg', refMetric: 'avg' });
      if (!Array.isArray(this.config.boardCardOrder)) this.config.boardCardOrder = [];
      const swrToken = `swr:${id}`;
      if (!this.config.boardCardOrder.includes(swrToken)) this.config.boardCardOrder.push(swrToken);
        this.saveConfig();
        this.refreshMeterBoard();
    };

    DWMControl.prototype.removeSwrCard = function(id) {
        if (!Array.isArray(this.config.swrCards)) return;
        this.config.swrCards = this.config.swrCards.filter(c => c.id !== id);
      if (Array.isArray(this.config.boardCardOrder)) {
        const token = `swr:${id}`;
        this.config.boardCardOrder = this.config.boardCardOrder.filter(t => t !== token);
      }
        this._getSwrRegistry().delete(id);
        const el = document.getElementById(`swr-card-${this.swrSafeId(id)}`);
        if (el) el.remove();
        this.saveConfig();
    };

    DWMControl.prototype._swrMeterOptions = function(selectedKey, disabledKey) {
        let html = '<option value="">— Select meter —</option>';
        for (const [key, rec] of this.meterRegistry.entries()) {
            // Build a descriptive label: name + short port path
            const name      = rec.friendlyName || 'DWM V2';
            const portShort = rec.portPath
                ? rec.portPath.replace(/^\/dev\//, '')
                : null;
            const inUse = (key === disabledKey && key !== selectedKey);
            const label = (portShort ? `${name}  ·  ${portShort}` : name) + (inUse ? '  (in use)' : '');
            const sel  = key === selectedKey ? ' selected' : '';
            const dis  = inUse ? ' disabled style="color:var(--text-muted,#888)"' : '';
            html += `<option value="${key}"${sel}${dis}>${label}</option>`;
        }
        return html;
    };

    DWMControl.prototype._refreshSwrMeterSelects = function() {
        const swrCards = Array.isArray(this.config.swrCards) ? this.config.swrCards : [];
        for (const cfg of swrCards) {
            const sid = this.swrSafeId(cfg.id);
            const fwdSel = document.getElementById(`swr-${sid}-fwd-key`);
            const refSel = document.getElementById(`swr-${sid}-ref-key`);
            const fwdVal = fwdSel ? fwdSel.value : null;
            const refVal = refSel ? refSel.value : null;
            if (fwdSel) fwdSel.innerHTML = this._swrMeterOptions(fwdVal, refVal);
            if (refSel) refSel.innerHTML = this._swrMeterOptions(refVal, fwdVal);
        }
    };

    DWMControl.prototype._swrMetricOptions = function(selected) {
        const opts = [
            { v: 'avg',  l: 'AVG — Average'       },
            { v: 'inst', l: 'INST — Instantaneous' },
            { v: 'peak', l: 'PEP — Peak Envelope'  },
        ];
        return opts.map(o => `<option value="${o.v}"${o.v === selected ? ' selected' : ''}>${o.l}</option>`).join('');
    };

    DWMControl.prototype.renderSwrCard = function(swrRec) {
        const id  = swrRec.id;
        const sid = this.swrSafeId(id);
        const histWindowMs = swrRec.state?.historyWindowMs || 30000;
        const viewMode     = swrRec.state?.viewMode    || 'gauges';
        const cardLayout   = swrRec.state?.cardLayout  || 'both';
        const histRangeOptions = [
            [5000, '5 s'], [10000, '10 s'], [30000, '30 s'], [60000, '1 min'],
            [300000, '5 min'], [600000, '10 min'], [1800000, '30 min'],
            [3600000, '1 hr'], [21600000, '6 hr'], [86400000, '24 hr'],
        ].map(([ms, label]) => `<option value="${ms}"${histWindowMs === ms ? ' selected' : ''}>${label}</option>`).join('');

        return `
<div class="swr-card" data-swr-id="${id}" id="swr-card-${sid}" draggable="true">
  <div class="swr-card-header">
    <span class="meter-drag-handle" title="Drag to reorder">&#8942;</span>
    <div class="swr-card-title-area">
      <span class="swr-card-title">SWR / Return Loss</span>
    </div>
    <div class="swr-card-header-right">
      <span class="swr-status-text" id="swr-${sid}-status">Select forward and reflected power sources above.</span>
      <button class="btn btn-text btn-small swr-remove-btn" data-swr-id="${id}" data-swr-action="remove">&#x2715; Remove</button>
    </div>
  </div>

  <div class="swr-source-bar">
    <div class="swr-source-group">
      <label class="swr-source-label">Forward Power</label>
      <div class="swr-source-selects">
        <select id="swr-${sid}-fwd-key" class="form-select form-select-sm" data-swr-id="${id}" data-swr-field="fwdKey">
          ${this._swrMeterOptions(swrRec.fwdKey, swrRec.refKey)}
        </select>
      </div>
    </div>
    <div class="swr-source-arrow">&#x2192;</div>
    <div class="swr-source-group">
      <label class="swr-source-label">Reflected Power</label>
      <div class="swr-source-selects">
        <select id="swr-${sid}-ref-key" class="form-select form-select-sm" data-swr-id="${id}" data-swr-field="refKey">
          ${this._swrMeterOptions(swrRec.refKey, swrRec.fwdKey)}
        </select>
      </div>
    </div>
  </div>
  <div class="swr-metric-row">
    <label class="swr-source-label">Power Type</label>
    <select id="swr-${sid}-metric" class="form-select form-select-sm" data-swr-id="${id}" data-swr-field="metric">
      ${this._swrMetricOptions(swrRec.fwdMetric)}
    </select>
    <select class="form-select form-select-sm" data-swr-id="${id}" data-swr-field="view">
      <option value="gauges"${viewMode === 'gauges'  ? ' selected' : ''}>Meters</option>
      <option value="history"${viewMode === 'history' ? ' selected' : ''}>History</option>
    </select>
    <select class="form-select form-select-sm" data-swr-id="${id}" data-swr-field="cardLayout">
      <option value="both"${cardLayout === 'both'     ? ' selected' : ''}>Both Gauges</option>
      <option value="swr-only"${cardLayout === 'swr-only' ? ' selected' : ''}>SWR Only</option>
      <option value="rl-only"${cardLayout === 'rl-only'  ? ' selected' : ''}>Return Loss Only</option>
      <option value="stacked"${cardLayout === 'stacked'  ? ' selected' : ''}>Stacked</option>
    </select>
  </div>

  <div class="swr-gauges-view" id="swr-${sid}-gauges-view" data-layout="${cardLayout}"${viewMode === 'history' ? ' style="display:none"' : ''}>
    <div class="swr-gauge-pair">
      <div class="swr-gauge-panel" data-swr-panel="swr">
        <div class="swr-gauge-panel-label">SWR</div>
        <canvas id="swr-${sid}-gauge-swr" class="meter-gauge-radial-canvas"></canvas>
      </div>
      <div class="swr-gauge-panel" data-swr-panel="rl">
        <div class="swr-gauge-panel-label">Return Loss</div>
        <canvas id="swr-${sid}-gauge-rl" class="meter-gauge-radial-canvas"></canvas>
      </div>
    </div>
    <div class="swr-derived-chips">
      <div class="swr-chip swr-chip-swr">
        <span class="swr-chip-label">SWR</span>
        <span id="swr-${sid}-val-swr" class="swr-chip-value">—</span>
      </div>
      <div class="swr-chip swr-chip-rl">
        <span class="swr-chip-label">Return Loss</span>
        <span id="swr-${sid}-val-rl" class="swr-chip-value">—</span>
      </div>
      <div class="swr-chip swr-chip-gamma">
        <span class="swr-chip-label">&#x393; Refl. Coeff.</span>
        <span id="swr-${sid}-val-gamma" class="swr-chip-value">—</span>
      </div>
      <div class="swr-chip swr-chip-fwd">
        <span class="swr-chip-label">Forward</span>
        <span id="swr-${sid}-val-fwd" class="swr-chip-value">—</span>
      </div>
      <div class="swr-chip swr-chip-ref">
        <span class="swr-chip-label">Reflected</span>
        <span id="swr-${sid}-val-ref" class="swr-chip-value">—</span>
      </div>
      <div class="swr-chip swr-chip-best">
        <span class="swr-chip-label">BEST SWR</span>
        <span id="swr-${sid}-val-best-swr" class="swr-chip-value swr-chip-best-val">—</span>
      </div>
      <div class="swr-chip swr-chip-best-rl">
        <span class="swr-chip-label">BEST RL</span>
        <span id="swr-${sid}-val-best-rl" class="swr-chip-value swr-chip-best-val">—</span>
      </div>
      <div class="swr-chip swr-chip-worst">
        <span class="swr-chip-label">WORST SWR</span>
        <span id="swr-${sid}-val-worst-swr" class="swr-chip-value swr-chip-worst-val">—</span>
      </div>
      <div class="swr-chip swr-chip-worst-rl">
        <span class="swr-chip-label">WORST RL</span>
        <span id="swr-${sid}-val-worst-rl" class="swr-chip-value swr-chip-worst-val">—</span>
      </div>
      <button class="btn btn-danger btn-small swr-bw-reset-btn" data-swr-id="${id}" data-swr-action="reset-best-worst" title="Reset BEST / WORST to current reading">STAT Reset</button>
    </div>
  </div>

  <div class="swr-history-view" id="swr-${sid}-history-view" style="display:none">
    <div class="swr-history-toolbar">
      <span class="meter-range-label">Time</span>
      <select class="meter-history-range-select" id="swr-${sid}-history-range" data-swr-id="${id}" data-swr-field="historyRange">
        ${histRangeOptions}
      </select>
    </div>
    <canvas id="swr-${sid}-history-canvas" class="meter-history-canvas"></canvas>
  </div>
</div>`;
    };

    // ─── Canvas resize / zoom repaint ─────────────────────────────────────────

    DWMControl.prototype._repaintAllCanvases = function() {
      document.querySelectorAll('canvas.meter-gauge-radial-canvas, canvas.meter-history-canvas').forEach(canvas => {
        delete canvas.dataset.cssWidth;
        delete canvas.dataset.cssHeight;
      });

        // Repaint all power meter gauge + history canvases
        for (const [key, record] of this.meterRegistry.entries()) {
            if (record.state?.lastSnapshotResponse) {
                requestAnimationFrame(() => this._updateMeterGauges(key, record.state.lastSnapshotResponse));
            }
            this._drawMeterHistory(key);
        }
        // Repaint all SWR gauge + history canvases
        if (this.swrCardRegistry) {
            for (const [id, rec] of this.swrCardRegistry.entries()) {
                if (rec.fwdKey) {
                    requestAnimationFrame(() => this._updateSwrCardsForMeter(rec.fwdKey));
                }
                this._drawSwrHistory(id);
            }
        }
    };

    DWMControl.prototype._setupCanvasResizeObserver = function() {
        const main = document.querySelector('.meter-page-main');
        if (!main || this._canvasResizeObserver) return;

        let debounceTimer = null;
        const repaint = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => this._repaintAllCanvases(), 80);
        };

        this._canvasResizeObserver = new ResizeObserver(repaint);
        this._canvasResizeObserver.observe(main);

        // Also repaint when device pixel ratio changes (Electron Ctrl+/- zoom)
        const trackDprChange = () => {
            const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
            mq.addEventListener('change', () => { repaint(); trackDprChange(); }, { once: true });
        };
        trackDprChange();
    };

})();
