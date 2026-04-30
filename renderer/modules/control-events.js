// Control tab methods — event handlers
(function attachControlModuleEvents() {
    if (typeof DWMControl === 'undefined') {
        console.error('DWMControl not defined before control module loaded');
        return;
    }
    // ─── Event setup ──────────────────────────────────────────────────────────

    DWMControl.prototype.setupDeviceControlEvents = function() {
        const board = document.getElementById('control-panel');
        if (!board) return;

        // Event delegation: all actions bubble up to the panel
        board.addEventListener('click', (e) => {
            // ── SWR card actions ──────────────────────────────────────────
            const swrBtn = e.target.closest('[data-swr-action]');
            if (swrBtn) {
                const swrAction = swrBtn.dataset.swrAction;
                const swrId     = swrBtn.dataset.swrId;
                if (swrAction && swrId) {
                    this._handleSwrCardAction(swrId, swrAction);
                    return;
                }
            }

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

        // Delegated input handler for name inputs — live sanitize + auto-save
        if (!this._nameInputThrottleMap) this._nameInputThrottleMap = new Map();
        board.addEventListener('input', (e) => {
            const el = e.target;
            if (!el.dataset || !el.dataset.meterNameKey) return;
            const key = el.dataset.meterNameKey;
            const record = this.meterRegistry.get(key);
            if (!record) return;

            // Sanitize in-place: spaces → _, strip non-alphanumeric/_
            const pos = el.selectionStart;
            const clean = el.value.replace(/ /g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            if (clean !== el.value) {
                el.value = clean;
                el.setSelectionRange(Math.min(pos, clean.length), Math.min(pos, clean.length));
            }

            // Update header name immediately (optimistic)
            const sid = this.meterSafeId(key);
            const headerNameEl = document.getElementById(`meter-${sid}-header-name`);
            if (headerNameEl && !headerNameEl.querySelector('.meter-name-inline-input')) {
                headerNameEl.textContent = clean || record.friendlyName || 'DWM V2';
            }

            if (record.connectionState !== 'connected') return;

            // Throttle: at most one save per 2 s; if a save arrives sooner, queue it
            const throttleState = this._nameInputThrottleMap.get(key) || { lastSentAt: 0, pendingTimer: null };
            this._nameInputThrottleMap.set(key, throttleState);

            const doSave = () => {
                throttleState.pendingTimer = null;
                throttleState.lastSentAt = Date.now();
                this.saveDeviceName(key);
            };

            clearTimeout(throttleState.pendingTimer);
            const elapsed = Date.now() - throttleState.lastSentAt;
            const delay = elapsed >= 2000 ? 400 : 2000 - elapsed + 50; // 400 ms after last keystroke, or respect 2 s gap
            throttleState.pendingTimer = setTimeout(doSave, delay);
        });

        board.addEventListener('change', async (e) => {
            const sel = e.target;

            // SWR toolbar dropdowns (no id, identified by dataset)
            if (sel.dataset.swrId && sel.dataset.swrField) {
                const swrId = sel.dataset.swrId;
                const field = sel.dataset.swrField;
                const swrCards = this.config.swrCards || [];
                const cfg = swrCards.find(c => c.id === swrId);

                if (field === 'view') {
                    const sid        = this.swrSafeId(swrId);
                    const gaugesView = document.getElementById(`swr-${sid}-gauges-view`);
                    const histView   = document.getElementById(`swr-${sid}-history-view`);
                    const isHistory  = sel.value === 'history';
                    if (gaugesView) gaugesView.style.display = isHistory ? 'none' : '';
                    if (histView)   histView.style.display   = isHistory ? '' : 'none';
                    const rec = this._getSwrRegistry().get(swrId);
                    if (rec?.state) rec.state.viewMode = sel.value;
                    if (isHistory) this._drawSwrHistory(swrId);
                    return;
                }

                if (field === 'cardLayout') {
                    this._setSwrCardLayout(swrId, sel.value);
                    return;
                }

                if (cfg) {
                    if (field === 'historyRange') {
                        const ms = Number.parseInt(sel.value, 10);
                        const rec = this._getSwrRegistry().get(swrId);
                        if (rec?.state && Number.isFinite(ms) && ms > 0) {
                            rec.state.historyWindowMs = ms;
                            this._drawSwrHistory(swrId);
                        }
                    } else if (field === 'metric') {
                        cfg.fwdMetric = sel.value || 'avg';
                        cfg.refMetric = sel.value || 'avg';
                        const rec = this._getSwrRegistry().get(swrId);
                        if (rec) { rec.fwdMetric = cfg.fwdMetric; rec.refMetric = cfg.refMetric; }
                        this.saveConfig();
                    } else {
                        cfg[field] = sel.value || null;
                        const rec = this._getSwrRegistry().get(swrId);
                        if (rec) rec[field] = sel.value || null;
                        this.saveConfig();
                        if (field === 'fwdKey' || field === 'refKey') {
                            this._refreshSwrMeterSelects();
                        }
                    }
                }
                return;
            }

            // Meter layout dropdown (no id)
            if (sel.dataset.meterField === 'cardLayout') {
                const cardEl = sel.closest('[data-meter-key]');
                const key = cardEl?.dataset.meterKey;
                if (key) this._setMeterCardLayout(key, sel.value);
                return;
            }

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

    DWMControl.prototype._handleSwrCardAction = function(swrId, action) {
        const sid = this.swrSafeId(swrId);
        switch (action) {
            case 'remove':
                this.removeSwrCard(swrId);
                break;
            case 'reset-best-worst': {
                const rec = this._getSwrRegistry().get(swrId);
                if (!rec?.state) break;
                const st = rec.state;
                // Require a valid last avg-based reading to reset to
                const cfg     = (this.config.swrCards || []).find(c => c.id === swrId);
                const fwdRec  = cfg?.fwdKey ? this.meterRegistry.get(cfg.fwdKey) : null;
                const refRec  = cfg?.refKey ? this.meterRegistry.get(cfg.refKey) : null;
                const fwdConn = fwdRec && fwdRec.connectionState === 'connected';
                const refConn = refRec && refRec.connectionState === 'connected';
                if (!fwdConn || !refConn) break; // silently ignore — meters not connected
                const fwdSnap = fwdRec.state?.lastSnapshotRaw;
                const refSnap = refRec.state?.lastSnapshotRaw;
                const fwdAvgW = fwdSnap ? Number.parseFloat(fwdSnap['avg']) : NaN;
                const refAvgW = refSnap ? Number.parseFloat(refSnap['avg']) : NaN;
                const m = this._computeSwrMetrics(fwdAvgW, refAvgW);
                if (!m) break; // no valid signal to reset to
                st.bestSwr  = m.swr;
                st.worstSwr = m.swr;
                st.bestRl   = m.rl;
                st.worstRl  = m.rl;
                this._updateSwrChips(sid, st.lastComputed, st);
                break;
            }
            case 'view-gauges': {
                const gaugesView  = document.getElementById(`swr-${sid}-gauges-view`);
                const histView    = document.getElementById(`swr-${sid}-history-view`);
                if (gaugesView) gaugesView.style.display = '';
                if (histView)   histView.style.display   = 'none';
                document.querySelectorAll(`#swr-card-${sid} .meter-view-btn`).forEach(b => {
                    b.classList.toggle('active', b.dataset.swrAction === 'view-gauges');
                });
                const rec = this._getSwrRegistry().get(swrId);
                if (rec?.state) rec.state.viewMode = 'gauges';
                break;
            }
            case 'view-history': {
                const gaugesView  = document.getElementById(`swr-${sid}-gauges-view`);
                const histView    = document.getElementById(`swr-${sid}-history-view`);
                if (gaugesView) gaugesView.style.display = 'none';
                if (histView)   histView.style.display   = '';
                document.querySelectorAll(`#swr-card-${sid} .meter-view-btn`).forEach(b => {
                    b.classList.toggle('active', b.dataset.swrAction === 'view-history');
                });
                const rec = this._getSwrRegistry().get(swrId);
                if (rec?.state) rec.state.viewMode = 'history';
                this._drawSwrHistory(swrId);
                break;
            }
            default:
                break;
        }
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

        // Live-sanitize as the user types: spaces → _, strip invalid chars
        input.addEventListener('input', () => {
            const pos = input.selectionStart;
            const clean = input.value.replace(/ /g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            if (clean !== input.value) {
                input.value = clean;
                input.setSelectionRange(Math.min(pos, clean.length), Math.min(pos, clean.length));
            }
        });
        const commit = async () => {
            if (done) return;
            done = true;
            const raw = input.value.trim();
            const newName = raw.replace(/ /g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || originalName;
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
        const isMonitoring = Boolean(state && state.monitorActive);

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

})();
