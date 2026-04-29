// Control tab methods — serial I/O and API commands
(function attachControlModuleApi() {
    if (typeof DWMControl === 'undefined') {
        console.error('DWMControl not defined before control module loaded');
        return;
    }
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
        // Sanitize: spaces → _, strip everything except letters/digits/_
        const raw = (inputEl ? inputEl.value : '').replace(/ /g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        const name = raw.slice(0, 20);
        if (inputEl) inputEl.value = name; // reflect sanitized value back

        if (!name) { this.setMeterStatus(key, 'Enter a device name before saving.', 'warning'); return; }

        try {
            const response = await this.sendApiCommand(key, 'sys.nset', { name });
            const dnameEl = document.getElementById(`meter-${sid}-dname`);
            const headerNameEl = document.getElementById(`meter-${sid}-header-name`);
            const displayName = response.dname || name;

            if (dnameEl) dnameEl.textContent = displayName;
            if (headerNameEl && !headerNameEl.querySelector('.meter-name-inline-input')) {
                headerNameEl.textContent = displayName;
            }

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

        const sid        = this.meterSafeId(key);
        const gaugesView = document.getElementById(`meter-${sid}-gauges-view`);
        if (gaugesView) gaugesView.dataset.layout = layout;

        // Sync layout dropdown value
        const cardEl = document.querySelector(`[data-meter-key="${key}"]`);
        if (cardEl) {
            const sel = cardEl.querySelector('.meter-layout-select');
            if (sel) sel.value = layout;
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

    DWMControl.prototype._setSwrCardLayout = function(id, layout) {
        const reg = this._getSwrRegistry();
        const rec = reg.get(id);
        if (!rec?.state) return;
        rec.state.cardLayout = layout;

        const sid        = this.swrSafeId(id);
        const gaugesView = document.getElementById(`swr-${sid}-gauges-view`);
        if (gaugesView) gaugesView.dataset.layout = layout;

        // Show/hide individual gauge panels
        const swrPanel = gaugesView?.querySelector('[data-swr-panel="swr"]');
        const rlPanel  = gaugesView?.querySelector('[data-swr-panel="rl"]');
        if (swrPanel && rlPanel) {
            const showSwr = layout !== 'rl-only';
            const showRl  = layout !== 'swr-only';
            swrPanel.style.display = showSwr ? '' : 'none';
            rlPanel.style.display  = showRl  ? '' : 'none';
        }

        // Force gauge repaint at new size using the fwd meter key
        const fwdKey = rec.fwdKey;
        if (fwdKey && rec.state.lastComputed) {
            requestAnimationFrame(() => this._updateSwrCardsForMeter(fwdKey));
        }
    };
})();
