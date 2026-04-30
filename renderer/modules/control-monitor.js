// Control tab methods — monitoring, polling and snapshot
(function attachControlModuleMonitor() {
    if (typeof DWMControl === 'undefined') {
        console.error('DWMControl not defined before control module loaded');
        return;
    }

    DWMControl.prototype.startMeterMonitoring = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state || record.state.monitorActive || record.connectionState !== 'connected') return;

        record.state.monitorActive = true;

        // Start-aligned scheduling: next poll fires pollIntervalMs after this poll STARTED,
        // not after it finished. If the poll takes longer than the interval (e.g. slow device),
        // the next poll fires immediately with 0ms delay — no overlap, no dropped cycles.
        const runPollCycle = () => {
            if (!record.state?.monitorActive) return;
            const intervalMs = record.state.pollIntervalMs;
            const cycleStart = Date.now();
            this.pollMeterSnapshot(key).finally(() => {
                if (!record.state?.monitorActive) return;
                const elapsed = Date.now() - cycleStart;
                const delay = Math.max(0, intervalMs - elapsed);
                record.state.monitorTimer = window.setTimeout(runPollCycle, delay);
            });
        };

        runPollCycle();
        this.updateMeterCardUI(key);
    };

    DWMControl.prototype.stopMeterMonitoring = function(key, silent = false) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state) return;
        record.state.monitorActive = false;
        if (record.state.monitorTimer) {
            clearTimeout(record.state.monitorTimer);
            record.state.monitorTimer = null;
        }
        this.updateMeterCardUI(key);
        if (!silent) this.setMeterStatus(key, 'Snapshot polling stopped.', 'ready');
    };

    DWMControl.prototype.pollMeterSnapshot = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || !record.state || record.connectionState !== 'connected') return;

        try {
            await this.refreshPowerSnapshot(key, { quiet: true, pacingMs: 0 });
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
            const cmdOptions = {};
            if (Number.isFinite(options.pacingMs)) cmdOptions.pacingMs = options.pacingMs;
            const response = await this.sendApiCommand(key, 'pwr.snap', {}, cmdOptions);
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
                if (elemSelect && Number.isFinite(record.elementId) && !(record.state && record.state.elementProfileMenuOpen) && document.activeElement !== elemSelect) {
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
            this._updateSwrCardsForMeter(key);

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

        const statusEl = document.getElementById(`meter-${sid}-bright-status`);
        if (statusEl) statusEl.textContent = '';

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
        const wasPolling = !!record.state.monitorActive;
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
        if (this.config?.globalDebugLoggingEnabled !== true) return;

        const record = this.meterRegistry.get(key);
        if (!record || !record.state) return;

        const sid = this.meterSafeId(key);
        const debugEl = document.getElementById(`meter-${sid}-debug`);
        if (!debugEl) return;

        const now = new Date();
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        const stamp = `${now.toLocaleTimeString()}.${ms}`;
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

    // ─── SWR / Return Loss computation ────────────────────────────────────────

    DWMControl.prototype._computeSwrMetrics = function(fwdW, refW) {
        if (!Number.isFinite(fwdW) || fwdW <= 0) return null;
        const safeRef = Math.min(Math.max(0, Number.isFinite(refW) ? refW : 0), fwdW);
        const ratio   = safeRef / fwdW;
        const gamma   = Math.sqrt(ratio);
        const rl      = ratio > 0 ? -10 * Math.log10(ratio) : Infinity;
        const swr     = gamma < 1 ? (1 + gamma) / (1 - gamma) : Infinity;
        return {
            swr:   Number.isFinite(swr)  ? swr  : 999,
            rl:    Number.isFinite(rl)   ? rl   : 60,
            gamma: gamma,
            fwdW:  fwdW,
            refW:  safeRef,
        };
    };

    DWMControl.prototype._updateSwrCardsForMeter = function(key) {
        const swrCards = this.config.swrCards;
        if (!Array.isArray(swrCards) || swrCards.length === 0) return;

        for (const cfg of swrCards) {
            if (cfg.fwdKey !== key && cfg.refKey !== key) continue;

            // Pull the latest snapshot values from each side
            const fwdRec = cfg.fwdKey ? this.meterRegistry.get(cfg.fwdKey) : null;
            const refRec = cfg.refKey ? this.meterRegistry.get(cfg.refKey) : null;
            const fwdMetric = cfg.fwdMetric || 'avg';
            const refMetric = cfg.refMetric || 'avg';

            const fwdSnap = fwdRec?.state?.lastSnapshotRaw;
            const refSnap = refRec?.state?.lastSnapshotRaw;

            const fwdW = fwdSnap ? Number.parseFloat(fwdSnap[fwdMetric]) : NaN;
            const refW = refSnap ? Number.parseFloat(refSnap[refMetric]) : NaN;

            const sid = this.swrSafeId(cfg.id);
            const statusEl = document.getElementById(`swr-${sid}-status`);

            // Determine overlay message based on configuration / connection state
            const fwdSet  = !!cfg.fwdKey;
            const refSet  = !!cfg.refKey;
            const fwdConn = fwdSet && fwdRec && fwdRec.connectionState === 'connected';
            const refConn = refSet && refRec && refRec.connectionState === 'connected';

            let overlayMsg = null;
            if (!fwdSet && !refSet) {
                overlayMsg = 'FWD & REV Not Set';
            } else if (!fwdSet) {
                overlayMsg = 'FWD Meter Not Set';
            } else if (!refSet) {
                overlayMsg = 'REV Meter Not Set';
            } else if (!fwdConn && !refConn) {
                overlayMsg = 'FWD & REV Not Connected';
            } else if (!fwdConn) {
                overlayMsg = 'FWD Meter Not Connected';
            } else if (!refConn) {
                overlayMsg = 'REV Meter Not Connected';
            }

            if (overlayMsg) {
                if (statusEl) statusEl.textContent = '';
                this._updateSwrChips(sid, null);
                this._drawIdleSwrGaugesWithMsg(sid, overlayMsg);
                continue;
            }

            const metrics = this._computeSwrMetrics(fwdW, refW);
            if (!metrics) {
                if (statusEl) statusEl.textContent = '';
                this._updateSwrChips(sid, null, null);
                this._drawIdleSwrGauges(sid);
                continue;
            }

            // Track BEST / WORST using avg metric specifically
            const fwdAvgW = fwdSnap ? Number.parseFloat(fwdSnap['avg']) : NaN;
            const refAvgW = refSnap ? Number.parseFloat(refSnap['avg']) : NaN;
            const avgMetrics = this._computeSwrMetrics(fwdAvgW, refAvgW);
            const rec = this._getSwrRegistry().get(cfg.id);
            if (avgMetrics && rec?.state) {
                const st = rec.state;
                if (st.bestSwr  === null || avgMetrics.swr < st.bestSwr)  st.bestSwr  = avgMetrics.swr;
                if (st.worstSwr === null || avgMetrics.swr > st.worstSwr) st.worstSwr = avgMetrics.swr;
                if (st.bestRl   === null || avgMetrics.rl  > st.bestRl)   st.bestRl   = avgMetrics.rl;
                if (st.worstRl  === null || avgMetrics.rl  < st.worstRl)  st.worstRl  = avgMetrics.rl;
            }

            // Update chips
            if (statusEl) statusEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
            this._updateSwrChips(sid, metrics, rec?.state);

            // Draw gauges
            const swrCanvas = document.getElementById(`swr-${sid}-gauge-swr`);
            const rlCanvas  = document.getElementById(`swr-${sid}-gauge-rl`);

            if (swrCanvas) {
                // Piecewise linear scale: 9 anchor SWR values mapped to equally-spaced arc positions.
                // This keeps the requested labels evenly distributed while preserving the
                // logarithmic character (each step is progressively larger in SWR).
                const SWR_ANCHORS = [1, 1.05, 1.1, 1.2, 1.5, 2, 3, 5, 10];
                const SWR_N       = SWR_ANCHORS.length - 1; // 8 segments
                const clampedSwr  = Math.max(1, Math.min(metrics.swr, SWR_ANCHORS[SWR_N]));
                let swrPct = 1;
                for (let i = 0; i < SWR_N; i++) {
                    if (clampedSwr <= SWR_ANCHORS[i + 1]) {
                        swrPct = (i + (clampedSwr - SWR_ANCHORS[i]) / (SWR_ANCHORS[i + 1] - SWR_ANCHORS[i])) / SWR_N;
                        break;
                    }
                }
                const swrStr   = metrics.swr >= 999 ? '\u221e' : metrics.swr.toFixed(2) + ':1';
                const swrTicks = SWR_ANCHORS.map((v, i) => ({
                    p:     i / SWR_N,
                    label: `${v}`,
                    major: true,
                }));
                // SWR zones aligned with RL scale: green SWR≤1.43 (RL≥15dB), yellow 1.43–1.93 (RL 10–15dB), red ≥1.93 (RL≤10dB)
                // Piecewise boundaries: p≈0.472 (SWR 1.43) and p≈0.606 (SWR 1.93)
                const swrZoneOpts = {
                    zonesDark:  [
                        { from: 0,     to: 0.472, dim: '#14532d', bright: '#16a34a' },
                        { from: 0.472, to: 0.606, dim: '#78350f', bright: '#d97706' },
                        { from: 0.606, to: 1.00,  dim: '#7f1d1d', bright: '#ef4444' },
                    ],
                    zonesLight: [
                        { from: 0,     to: 0.472, dim: '#bbf7d0', bright: '#16a34a' },
                        { from: 0.472, to: 0.606, dim: '#fef08a', bright: '#ca8a04' },
                        { from: 0.606, to: 1.00,  dim: '#fecaca', bright: '#dc2626' },
                    ],
                    zoneLabel: dark => p => p >= 0.606 ? (dark ? '#fca5a5' : '#b91c1c') : p >= 0.472 ? (dark ? '#fde68a' : '#92400e') : (dark ? '#86efac' : '#166534'),
                    zoneColor:  dark => p => p >= 0.606 ? (dark ? '#f87171' : '#dc2626') : p >= 0.472 ? (dark ? '#fbbf24' : '#d97706') : (dark ? '#4ade80' : '#16a34a'),
                    dividers: [0.472, 0.606],
                };
                this._drawSwrGauge(swrCanvas, swrPct, swrStr, 'SWR', swrTicks, swrZoneOpts);
            }

            if (rlCanvas) {
                // Inverted scale: 0 dB RL (bad) = right/red, 50 dB (good) = left/green
                // Green 50–15 dB, yellow 15–10 dB, red 10–0 dB
                const RL_MAX  = 50;
                const rlPct   = 1 - Math.min(Math.max(metrics.rl, 0), RL_MAX) / RL_MAX;
                const rlStr   = metrics.rl >= RL_MAX ? `\u2265 ${RL_MAX} dB` : `${metrics.rl.toFixed(1)} dB`;
                const rlTicks = [];
                for (let db = 50; db >= 0; db -= 5) {
                    rlTicks.push({ p: 1 - db / RL_MAX, label: `${db}`, major: (db % 10 === 0) });
                }
                // Zone boundaries on inverted scale: 15dB = p=0.70, 10dB = p=0.80
                const rlZoneOpts = {
                    zonesDark:  [
                        { from: 0,    to: 0.70, dim: '#14532d', bright: '#16a34a' },
                        { from: 0.70, to: 0.80, dim: '#78350f', bright: '#d97706' },
                        { from: 0.80, to: 1.00, dim: '#7f1d1d', bright: '#ef4444' },
                    ],
                    zonesLight: [
                        { from: 0,    to: 0.70, dim: '#bbf7d0', bright: '#16a34a' },
                        { from: 0.70, to: 0.80, dim: '#fef08a', bright: '#ca8a04' },
                        { from: 0.80, to: 1.00, dim: '#fecaca', bright: '#dc2626' },
                    ],
                    zoneLabel: dark => p => p >= 0.80 ? (dark ? '#fca5a5' : '#b91c1c') : p >= 0.70 ? (dark ? '#fde68a' : '#92400e') : (dark ? '#86efac' : '#166534'),
                    zoneColor:  dark => p => p >= 0.80 ? (dark ? '#f87171' : '#dc2626') : p >= 0.70 ? (dark ? '#fbbf24' : '#d97706') : (dark ? '#4ade80' : '#16a34a'),
                    dividers: [0.70, 0.80],
                };
                this._drawSwrGauge(rlCanvas, rlPct, rlStr, 'RL dB', rlTicks, rlZoneOpts);
            }

            // Push and draw history
            if (rec?.state) {
                rec.state.lastComputed = { ...metrics, ts: Date.now() };
            }
            this._pushSwrHistory(cfg.id, metrics);
            this._drawSwrHistory(cfg.id);
        }
    };

    DWMControl.prototype._updateSwrChips = function(sid, metrics, state) {
        const setChip = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        const fmtSwr = v => (v === null || v === undefined) ? '—' : (v >= 999 ? '∞' : `${v.toFixed(2)}:1`);
        const fmtRl  = v => (v === null || v === undefined) ? '—' : (v >= 60  ? '≥ 60 dB' : `${v.toFixed(1)} dB`);
        if (!metrics) {
            setChip(`swr-${sid}-val-swr`,   '—');
            setChip(`swr-${sid}-val-rl`,    '—');
            setChip(`swr-${sid}-val-gamma`, '—');
            setChip(`swr-${sid}-val-fwd`,   '—');
            setChip(`swr-${sid}-val-ref`,   '—');
            // Keep best/worst chips if state exists
            if (state) {
                setChip(`swr-${sid}-val-best-swr`,  fmtSwr(state.bestSwr));
                setChip(`swr-${sid}-val-best-rl`,   fmtRl(state.bestRl));
                setChip(`swr-${sid}-val-worst-swr`, fmtSwr(state.worstSwr));
                setChip(`swr-${sid}-val-worst-rl`,  fmtRl(state.worstRl));
            }
            return;
        }
        const swrStr = fmtSwr(metrics.swr);
        const rlStr  = fmtRl(metrics.rl);
        setChip(`swr-${sid}-val-swr`,   swrStr);
        setChip(`swr-${sid}-val-rl`,    rlStr);
        setChip(`swr-${sid}-val-gamma`, metrics.gamma.toFixed(4));
        setChip(`swr-${sid}-val-fwd`,   this.formatPower(metrics.fwdW));
        setChip(`swr-${sid}-val-ref`,   this.formatPower(metrics.refW));
        if (state) {
            setChip(`swr-${sid}-val-best-swr`,  fmtSwr(state.bestSwr));
            setChip(`swr-${sid}-val-best-rl`,   fmtRl(state.bestRl));
            setChip(`swr-${sid}-val-worst-swr`, fmtSwr(state.worstSwr));
            setChip(`swr-${sid}-val-worst-rl`,  fmtRl(state.worstRl));
        }
    };

    DWMControl.prototype._drawIdleSwrGauges = function(sid) {
        const drawIdle = id => {
            const c = document.getElementById(id);
            if (c) this._drawSwrGauge(c, 0, '—', '—', [], undefined, 'No FWD Power');
        };
        drawIdle(`swr-${sid}-gauge-swr`);
        drawIdle(`swr-${sid}-gauge-rl`);
    };

    DWMControl.prototype._drawIdleSwrGaugesWithMsg = function(sid, msg) {
        const drawIdle = id => {
            const c = document.getElementById(id);
            if (c) this._drawSwrGauge(c, 0, '—', '—', [], undefined, msg);
        };
        drawIdle(`swr-${sid}-gauge-swr`);
        drawIdle(`swr-${sid}-gauge-rl`);
    };

})();
