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
        if (!frame || !window.DWMProtocol?.isSupportedProto(frame.proto) || !frame.type) return;

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
            const record = this.meterRegistry.get(key);
            if (record?.state && frame.proto) {
                record.state.protocolVersion = window.DWMProtocol.isSupportedProto(frame.proto) ? String(frame.proto) : record.state.protocolVersion;
            }
            pending.resolve(frame);
        } else {
            const error = new Error(this.describeApiError(frame));
            error.code = frame.code || null; // machine-readable; the message is for humans
            pending.reject(error);
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

        // Simulated meters (demo.js) answer in-process: no serial write, pacing or proto fallback.
        if (record.isDemo) return this._demoHandleCommand(record, command, fields);

        const state = record.state;
        const allowLegacyFallback = options.allowLegacyFallback !== false;

        const runCommand = async (protocolVersion) => {
            const requestId = String(state.nextRequestId++);
            const timeoutMs = options.timeoutMs || 2000;
            const frame = this.buildApiFrame(command, requestId, fields, protocolVersion);
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
                if (response?.proto && window.DWMProtocol.isSupportedProto(response.proto)) {
                    state.protocolVersion = String(response.proto);
                }
                return response;
            } finally {
                if (!prevMonitorBusy) state.monitorBusy = false;
            }
        };

        const queue = state.apiCommandQueue || Promise.resolve();
        const preferredProto = String(options.protocolVersion || state.protocolVersion || window.DWMProtocol.PROTOCOL_VERSION || '2');
        const primaryCommand = queue.catch(() => {}).then(() => runCommand(preferredProto));
        const finalCommand = allowLegacyFallback && preferredProto !== '1'
            ? primaryCommand.catch(async error => {
                const fallbackCode = /^ERR_(UNKNOWN_CMD|BAD_FRAME|BAD_ENUM)$/i.test(String(error?.code || ''));
                const fallbackReason = fallbackCode || /timed out|Failed to write/i.test(error?.message || '');
                if (!fallbackReason) throw error;
                state.protocolVersion = '1';
                return runCommand('1');
            })
            : primaryCommand;

        state.apiCommandQueue = finalCommand.catch(() => {});
        return finalCommand;
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

    // ─── Firmware version check ───────────────────────────────────────────────

    DWMControl.prototype._parseSemver = function(str) {
        const match = String(str || '').match(/(\d+)\.(\d+)\.(\d+)/);
        if (!match) return null;
        return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), Number.parseInt(match[3], 10)];
    };

    DWMControl.prototype._semverIsNewer = function(a, b) {
        for (let i = 0; i < 3; i++) {
            if (a[i] > b[i]) return true;
            if (a[i] < b[i]) return false;
        }
        return false;
    };

    // ─── In-card firmware update ──────────────────────────────────────────────
    //
    // record.state.fwUpdate = { stage, version, deviceVersion, hexPath, pct, dfuSent, error, doneAt }
    // stage: idle → checking → available | uptodate
    //        available → downloading → entering-dfu → waiting-dfu → uploading → done | error
    //        error → (retry) → [downloading] → [entering-dfu] → waiting-dfu → …
    // While stage is entering-dfu/waiting-dfu/uploading, record.connectionState is 'updating'.

    const FW_RUNNING_STAGES = new Set(['downloading', 'entering-dfu', 'waiting-dfu', 'uploading']);
    // How long a done/error record is kept after its serial port vanished (meter in DFU mode).
    const FW_HOLD_MS = 10 * 60 * 1000;
    // How long to wait for the meter to restart by itself and re-enumerate after a flash.
    const FW_RESTART_TIMEOUT_MS = 20000;
    const FW_RESTART_POLL_MS = 1000;
    const FW_RESTARTING_MESSAGE = 'Update complete, waiting for meter to restart…';
    const FW_RESTART_TIMEOUT_MESSAGE = 'The meter did not come back within 20 seconds. If it does not reappear, power-cycle it (unplug and reconnect, or switch it off and on).';
    const FW_NO_DFU_MESSAGE = 'No DFU device found. Check the USB cable, or install the WinUSB driver on Windows (Firmware tab).';

    DWMControl.prototype._fwCompareVersions = function(deviceFver, latestTag) {
        const device = this._parseSemver(deviceFver);
        const latest = this._parseSemver(latestTag);
        if (!device || !latest) return null;
        return {
            deviceVerStr: device.join('.'),
            latestVerStr: latest.join('.'),
            updateAvailable: this._semverIsNewer(latest, device),
        };
    };

    DWMControl.prototype._fwIsRunning = function(record) {
        return FW_RUNNING_STAGES.has(record?.state?.fwUpdate?.stage);
    };

    // Discovery (renderer.js removeMissingMeterRecords) must keep a record whose serial
    // port disappeared because the meter is in DFU mode for an in-card update.
    DWMControl.prototype.isMeterHeldForFirmwareUpdate = function(record) {
        if (!record) return false;
        if (record.connectionState === 'updating') return true;
        const fw = record.state?.fwUpdate;
        if (!fw) return false;
        if (FW_RUNNING_STAGES.has(fw.stage)) return true;
        if ((fw.stage === 'done' || fw.stage === 'error') && fw.doneAt) {
            return Date.now() - fw.doneAt < FW_HOLD_MS;
        }
        return false;
    };

    DWMControl.prototype._fwSleep = function(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    };

    DWMControl.prototype._fwStatus = function(key, text, kind = 'info') {
        const el = document.getElementById(`meter-${this.meterSafeId(key)}-fw-status`);
        if (!el) return;
        el.textContent = text || '';
        el.hidden = !text;
        el.className = `meter-fw-status meter-fw-status-${kind}`;
    };

    DWMControl.prototype._fwProgress = function(key, pct) {
        const sid = this.meterSafeId(key);
        const bar = document.getElementById(`meter-${sid}-fw-progress`);
        if (!bar) return;
        if (pct === null || pct === undefined) { bar.hidden = true; return; }
        const safe = Math.max(0, Math.min(100, Math.round(pct)));
        bar.hidden = false;
        bar.setAttribute('aria-valuenow', String(safe));
        const fill = document.getElementById(`meter-${sid}-fw-progress-fill`);
        if (fill) fill.style.width = `${safe}%`;
    };

    // The header button is either "Check Updates" or "Update to vX.Y.Z", depending on fwUpdate.
    DWMControl.prototype._fwSyncButton = function(key) {
        const btn = document.getElementById(`meter-${this.meterSafeId(key)}-fw-btn`);
        const record = this.meterRegistry.get(key);
        if (!btn || !record) return;
        const fw = record.state?.fwUpdate;
        const stage = fw?.stage || 'idle';
        const isConn = record.connectionState === 'connected';

        let action = 'check-updates';
        let text = 'Check Updates';
        let warn = false;
        let disabled = !isConn;
        if (stage === 'checking') {
            text = 'Checking…';
            disabled = true;
        } else if (stage === 'uptodate') {
            text = 'Up to date';
        } else if (stage === 'available' || stage === 'error') {
            action = 'run-fw-update';
            text = `Update to v${fw.version}`;
            warn = true;
            // A meter left in DFU mode by a failed attempt has no serial port; retry still works.
            disabled = !(isConn || (stage === 'error' && fw.dfuSent));
        } else if (FW_RUNNING_STAGES.has(stage)) {
            action = 'run-fw-update';
            text = 'Updating…';
            warn = true;
            disabled = true;
        }

        btn.dataset.meterAction = action;
        btn.setAttribute('data-meter-action', action);
        btn.textContent = text;
        btn.disabled = disabled;
        btn.className = `btn ${warn ? 'btn-warning' : 'btn-secondary'} btn-small meter-fw-btn`;
        if (FW_RUNNING_STAGES.has(stage)) btn.setAttribute('aria-busy', 'true');
        else btn.removeAttribute('aria-busy');
    };

    DWMControl.prototype._fwRenderAvailableNotice = function(key) {
        const record = this.meterRegistry.get(key);
        const fw = record?.state?.fwUpdate;
        const noticeEl = document.getElementById(`meter-${this.meterSafeId(key)}-fw-update-notice`);
        if (!noticeEl || !fw) return;
        noticeEl.classList.remove('meter-fw-done');
        noticeEl.innerHTML = `
<div class="meter-fw-update-available">
  <div class="meter-fw-update-info">
    <span class="meter-fw-update-icon" aria-hidden="true">&#x2B06;</span>
    <span class="meter-fw-update-text">Firmware update available &mdash; <strong>Latest: v${fw.version}</strong> &nbsp;(installed: v${fw.deviceVersion || '?'})</span>
    <button class="btn btn-icon meter-fw-dismiss-btn" data-meter-action="dismiss-fw-notice" title="Dismiss" aria-label="Dismiss firmware update notice">&times;</button>
  </div>
  <p class="meter-fw-update-note">Click <strong>Update to v${fw.version}</strong> above to start. The meter restarts by itself when the update finishes and reconnects automatically.</p>
  <div class="meter-fw-update-actions">
    <button class="btn btn-link btn-small meter-fw-manual-link" data-meter-action="enter-dfu-from-update">Use the Firmware tab instead</button>
  </div>
</div>`;
        noticeEl.style.display = '';
    };

    DWMControl.prototype._fwHideNotice = function(key) {
        const sid = this.meterSafeId(key);
        const noticeEl = document.getElementById(`meter-${sid}-fw-update-notice`);
        if (noticeEl) {
            noticeEl.style.display = 'none';
            noticeEl.classList.remove('meter-fw-done');
        }
        this._fwStatus(key, '');
        this._fwProgress(key, null);
    };

    DWMControl.prototype.dismissFirmwareNotice = function(key) {
        const record = this.meterRegistry.get(key);
        if (!record) return;
        if (this._fwIsRunning(record)) return;
        if (record.state) record.state.fwUpdate = { stage: 'idle' };
        this._fwHideNotice(key);
        this._fwSyncButton(key);
    };

    DWMControl.prototype.checkFirmwareUpdate = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record || record.connectionState !== 'connected' || !record.state) {
            this.setMeterStatus(key, 'Connect to this meter before checking for updates.', 'warning');
            return;
        }
        if (this._fwIsRunning(record)) return;

        const sid = this.meterSafeId(key);
        const noticeEl = document.getElementById(`meter-${sid}-fw-update-notice`);
        const prev = record.state.fwUpdate || {};
        const setStage = (stage, extra = {}) => {
            record.state.fwUpdate = { ...extra, stage };
            this._fwSyncButton(key);
        };

        setStage('checking');
        this.setMeterStatus(key, 'Checking for firmware update…', 'active');

        try {
            // Step 1: device firmware version via sys.fw
            const fwResponse = await this.sendApiCommand(key, 'sys.fw', {}, { timeoutMs: 3000 });
            const fver = fwResponse.fver || '';
            if (!this._parseSemver(fver)) {
                this.setMeterStatus(key, `Could not parse device firmware version: "${fver}"`, 'error');
                this._fwHideNotice(key);
                setStage('idle');
                return;
            }

            // Step 2: latest release tag from GitHub
            let latestTag = null;
            try {
                const releaseInfo = await window.electronAPI.getLatestFirmwareVersion();
                if (releaseInfo && releaseInfo.tag_name) latestTag = releaseInfo.tag_name;
            } catch (netErr) {
                this.setMeterStatus(key, `Update check failed (network): ${netErr.message}`, 'error');
                this._fwHideNotice(key);
                setStage('idle');
                return;
            }

            const cmp = this._fwCompareVersions(fver, latestTag);
            if (!cmp) {
                this.setMeterStatus(key, `Could not parse latest release version: "${latestTag}"`, 'error');
                this._fwHideNotice(key);
                setStage('idle');
                return;
            }

            if (cmp.updateAvailable) {
                // Keep an already-downloaded hex for the same version.
                const hexPath = prev.version === cmp.latestVerStr ? prev.hexPath : undefined;
                setStage('available', { version: cmp.latestVerStr, deviceVersion: cmp.deviceVerStr, hexPath });
                this._fwStatus(key, '');
                this._fwProgress(key, null);
                this._fwRenderAvailableNotice(key);
                this.setMeterStatus(key, `Firmware update available: v${cmp.deviceVerStr} → v${cmp.latestVerStr}`, 'warning');
            } else {
                setStage('uptodate', { version: cmp.latestVerStr, deviceVersion: cmp.deviceVerStr });
                if (noticeEl) {
                    noticeEl.classList.remove('meter-fw-done');
                    noticeEl.innerHTML = `<div class="meter-fw-up-to-date"><span>&#x2713; Firmware is up to date (v${cmp.deviceVerStr})</span></div>`;
                    noticeEl.style.display = '';
                }
                this._fwStatus(key, '');
                this._fwProgress(key, null);
                this.setMeterStatus(key, `Firmware is up to date (v${cmp.deviceVerStr}).`, 'ready');
                setTimeout(() => {
                    if (record.state?.fwUpdate?.stage !== 'uptodate') return;
                    record.state.fwUpdate = { stage: 'idle' };
                    if (noticeEl) noticeEl.style.display = 'none';
                    this._fwSyncButton(key);
                }, 5000);
            }
        } catch (err) {
            this.setMeterStatus(key, `Firmware check failed: ${err.message}`, 'error');
            this._fwHideNotice(key);
            setStage('idle');
        }
    };

    // ── Steps (each unit-testable with a stubbed window.electronAPI) ──

    DWMControl.prototype._fwDownload = async function() {
        const result = await window.electronAPI.downloadLatestFirmware();
        if (!result || !result.filePath) throw new Error('no file path was returned');
        return result.filePath;
    };

    // Fire-and-forget sys.dfu, exactly like enterDfuForUpdate, then release the port.
    DWMControl.prototype._fwEnterDfu = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record) return;
        this.stopMeterMonitoring(key, true);
        this.sendApiCommand(key, 'sys.dfu', {}, { timeoutMs: 1000 }).catch(() => {});
        if (record.state?.fwUpdate) record.state.fwUpdate.dfuSent = true;
        // From here on discovery must neither auto-connect nor drop this record.
        record.connectionState = 'updating';
        if (this.activeMeterKey === key) {
            this.activeMeterKey = null;
            for (const [k, r] of this.meterRegistry) {
                if (r.connectionState === 'connected') { this.activeMeterKey = k; break; }
            }
        }
        this.isConnected = [...this.meterRegistry.values()].some(r => r.connectionState === 'connected');
        this.updateMeterCardUI(key);
        await this._fwSleep(1200);
        try { await window.electronAPI.closeSerialPort(record.portPath); } catch (_) { /* port already gone */ }
    };

    // Resolves { device, count } for the first DFU device, or null after timeoutMs.
    DWMControl.prototype._fwWaitForDfuDevice = async function(timeoutMs = 30000, intervalMs = 1000) {
        let lastError = null;
        for (let elapsed = 0; ; elapsed += intervalMs) {
            try {
                const result = await window.electronAPI.getDfuDevices();
                const devices = (result && result.success && Array.isArray(result.devices)) ? result.devices : [];
                if (devices.length > 0) return { device: devices[0], count: devices.length };
                if (result && !result.success && result.error) lastError = result.error;
            } catch (err) {
                lastError = err.message;
            }
            if (elapsed + intervalMs > timeoutMs) break;
            await this._fwSleep(intervalMs);
        }
        if (lastError) this.appendOutput(`DFU device search: ${lastError}`);
        return null;
    };

    // Listens on upload-progress only for the duration of this upload.
    DWMControl.prototype._fwUpload = async function(key, hexFilePath, deviceInfo, note = '') {
        const record = this.meterRegistry.get(key);
        const api = window.electronAPI;
        const onLine = (_event, data) => {
            const fw = record?.state?.fwUpdate;
            if (!fw || fw.stage !== 'uploading') return;
            const line = typeof data === 'string' ? data.trim() : String(data?.message || '').trim();
            const pct = typeof this.parseProgressFromDfuOutput === 'function' ? this.parseProgressFromDfuOutput(line) : null;
            if (pct === null || pct === undefined || pct <= (fw.pct || 0)) return;
            fw.pct = pct;
            this._fwProgress(key, pct);
            this._fwStatus(key, `Uploading firmware… ${pct}%${note}`, 'active');
            if (typeof this._a11yOnDfuProgress === 'function') this._a11yOnDfuProgress(pct);
        };
        const off = typeof api.onUploadProgress === 'function' ? api.onUploadProgress(onLine) : null;
        try {
            return await api.uploadFirmware({ hexFilePath, deviceInfo });
        } finally {
            if (typeof off === 'function') off();
        }
    };

    DWMControl.prototype._fwFinish = function(key, ok, message) {
        const record = this.meterRegistry.get(key);
        const fw = record?.state?.fwUpdate;
        if (!fw) return;
        fw.stage = ok ? 'done' : 'error';
        fw.doneAt = Date.now();
        if (ok) {
            fw.hexPath = undefined;
            fw.pct = 100;
            this._fwProgress(key, 100);
        } else {
            fw.error = message;
            this._fwProgress(key, null);
        }
        if (record.connectionState === 'updating') record.connectionState = 'available';
        this._fwStatus(key, message, ok ? 'success' : 'error');
        const noticeEl = document.getElementById(`meter-${this.meterSafeId(key)}-fw-update-notice`);
        if (noticeEl) {
            noticeEl.classList.toggle('meter-fw-done', ok);
            noticeEl.style.display = '';
        }
        if (typeof this._a11yOnDfuResult === 'function') this._a11yOnDfuResult(ok, message);
        this.appendOutput(message);
        this.updateMeterCardUI(key);
        this._fwSyncButton(key);
    };

    DWMControl.prototype.runInlineFirmwareUpdate = async function(key) {
        const record = this.meterRegistry.get(key);
        const fw = record?.state?.fwUpdate;
        if (!record || !fw || !fw.version) return;
        if (fw.stage !== 'available' && fw.stage !== 'error') return; // running or not checked: ignore

        // dfu-util flashes whichever DFU device it finds, so only one update app-wide.
        for (const [k, r] of this.meterRegistry) {
            if (k !== key && this._fwIsRunning(r)) {
                this._fwStatus(key, 'Another meter is being updated. Wait for it to finish.', 'warning');
                return;
            }
        }
        if (this.isUploading) {
            this._fwStatus(key, 'A firmware upload is running on the Firmware tab. Wait for it to finish.', 'warning');
            return;
        }
        const isConn = record.connectionState === 'connected';
        if (!isConn && !fw.dfuSent) {
            this._fwStatus(key, 'Connect to this meter before updating.', 'warning');
            return;
        }

        const version = fw.version;
        const setStage = (stage, text) => {
            fw.stage = stage;
            this._fwStatus(key, text, 'active');
            this._fwSyncButton(key);
        };
        fw.error = undefined;
        fw.doneAt = undefined;
        fw.pct = 0;

        if (record.isDemo) return this._fwRunDemo(key);

        // Step 1: download
        if (!fw.hexPath) {
            setStage('downloading', `Downloading firmware v${version}…`);
            this._fwProgress(key, null);
            try {
                fw.hexPath = await this._fwDownload();
            } catch (err) {
                this._fwFinish(key, false, `Firmware download failed: ${err.message}`);
                return;
            }
        }

        try {
            // Step 2: reboot into DFU (skipped on a retry while the meter already sits in DFU mode)
            if (record.connectionState === 'connected') {
                setStage('entering-dfu', 'Rebooting meter into DFU mode…');
                await this._fwEnterDfu(key);
            } else {
                record.connectionState = 'updating';
                this.updateMeterCardUI(key);
            }

            // Step 3: wait for the DFU device
            setStage('waiting-dfu', 'Waiting for DFU device…');
            const found = await this._fwWaitForDfuDevice(30000, 1000);
            if (!found) {
                this._fwFinish(key, false, FW_NO_DFU_MESSAGE);
                return;
            }

            // Step 4: upload
            const note = found.count > 1 ? ` (${found.count} DFU devices found; using the first)` : '';
            setStage('uploading', `Uploading firmware… 0%${note}`);
            this._fwProgress(key, 0);
            const result = await this._fwUpload(key, fw.hexPath, found.device, note);
            if (!result || !result.success) {
                this._fwFinish(key, false, `Firmware upload failed: ${(result && result.error) || 'dfu-util reported an error'}`);
                return;
            }
            // dwm-core already maps dfu-util exit code 74 (device detached at the :leave step) to
            // success, so result.success is true here for that case too.
            this._fwFinish(key, true, FW_RESTARTING_MESSAGE);
            // Deliberately not awaited: the card shows progress while the meter restarts.
            fw.restartWait = this._fwAwaitRestart(key);
        } catch (err) {
            this._fwFinish(key, false, `Firmware update failed: ${err.message}`);
        }
    };

    // Demo meters: no DFU device exists, so fake the upload over ~3 s.
    DWMControl.prototype._fwRunDemo = async function(key) {
        const record = this.meterRegistry.get(key);
        const fw = record.state.fwUpdate;
        fw.stage = 'uploading';
        this._fwSyncButton(key);
        this.sendApiCommand(key, 'sys.dfu', {}, { timeoutMs: 1000 }).catch(() => {});
        for (let pct = 0; pct < 100; pct += 10) {
            this._fwProgress(key, pct);
            this._fwStatus(key, `Uploading firmware… ${pct}% (demo)`, 'active');
            await this._fwSleep(300);
        }
        fw.stage = 'done';
        fw.pct = 100;
        this._fwProgress(key, 100);
        this._fwStatus(key, `Firmware v${fw.version} uploaded (demo, simulated).`, 'success');
        if (typeof this._a11yOnDfuResult === 'function') this._a11yOnDfuResult(true, '');
        this._fwSyncButton(key);
    };

    // Looks for the meter that was just flashed. Returns its (connected) record, or null.
    // Identity: the USB serial number it had before the update, then its device key, then,
    // when neither is known to differ, the only unclaimed DWM port present. Reuses the
    // normal discovery path (scanAndSyncMeters) to create/refresh the record and connect.
    DWMControl.prototype._fwFindReturnedMeter = async function(identity = {}) {
        const sameSerial = (a, b) => Boolean(a && b) && String(a).toLowerCase() === String(b).toLowerCase();
        const matches = (rec) => Boolean(rec) && !rec.isDemo && (
            (identity.key && rec.key === identity.key) || sameSerial(identity.serialNumber, rec.serialNumber));
        const connectedMatch = () => {
            for (const rec of this.meterRegistry.values()) {
                if (rec.connectionState === 'connected' && matches(rec)) return rec;
            }
            return null;
        };

        const already = connectedMatch();
        if (already) return already;

        let ports = [];
        try {
            const result = await window.electronAPI.getSerialPorts();
            if (result && result.success) ports = (result.ports || []).filter((p) => this.isMeterPort(p));
        } catch (_) { return null; }
        if (ports.length === 0) return null;

        const claimed = new Set();
        for (const rec of this.meterRegistry.values()) {
            if (rec.connectionState === 'connected' && !matches(rec)) claimed.add(rec.portPath);
        }
        const candidates = ports.filter((p) => !claimed.has(p.path));
        let port = candidates.find((p) => sameSerial(identity.serialNumber, p.serialNumber)) || null;
        if (!port && identity.key) port = candidates.find((p) => this.buildMeterKey(p) === identity.key) || null;
        if (!port && candidates.length === 1) {
            const only = candidates[0];
            const differs = identity.serialNumber && only.serialNumber && !sameSerial(identity.serialNumber, only.serialNumber);
            if (!differs) port = only;
        }
        if (!port) return null;

        await this.scanAndSyncMeters();
        return connectedMatch()
            || [...this.meterRegistry.values()].find((rec) => rec.connectionState === 'connected' && rec.portPath === port.path)
            || null;
    };

    DWMControl.prototype._fwWaitForMeterReturn = async function(identity, timeoutMs = FW_RESTART_TIMEOUT_MS, intervalMs = FW_RESTART_POLL_MS) {
        for (let elapsed = 0; ; elapsed += intervalMs) {
            const found = await this._fwFindReturnedMeter(identity);
            if (found) return found;
            if (elapsed + intervalMs > timeoutMs) return null;
            await this._fwSleep(intervalMs);
        }
    };

    // In-card flow: after a successful flash, wait for the meter to restart on its own and
    // reconnect. connectMeter -> _fwOnReconnected shows "Reconnected"; this method handles
    // the timeout and a changed device key (Linux paths can change across re-enumeration).
    DWMControl.prototype._fwAwaitRestart = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record) return null;
        const identity = { key, serialNumber: record.serialNumber || null };
        const found = await this._fwWaitForMeterReturn(identity);
        const current = this.meterRegistry.get(key);
        if (found) {
            if (found.key !== key && current && current.connectionState !== 'connected') {
                // Same meter under a new key: drop the stale card, the new one is live.
                this.meterRegistry.delete(key);
                if (typeof this.refreshMeterBoard === 'function') this.refreshMeterBoard();
                this.appendOutput(`${found.friendlyName || 'DWM V2'} reconnected after the firmware update.`);
                if (typeof this.announce === 'function') this.announce('Meter reconnected after the firmware update');
            }
            return found;
        }
        if (current && current.state?.fwUpdate?.stage === 'done') {
            this._fwStatus(key, FW_RESTART_TIMEOUT_MESSAGE, 'warning');
            this.appendOutput(FW_RESTART_TIMEOUT_MESSAGE);
            if (typeof this.announce === 'function') this.announce(FW_RESTART_TIMEOUT_MESSAGE, { assertive: true });
        }
        return null;
    };

    // Firmware-tab flow (no meter card involved): same wait, reported in the upload log.
    DWMControl.prototype._fwTabAwaitRestart = async function(identity) {
        this.updateProgressBar(100, FW_RESTARTING_MESSAGE);
        this.appendSerialMonitor(FW_RESTARTING_MESSAGE);
        const found = await this._fwWaitForMeterReturn(identity || {});
        if (found) {
            this.updateProgressBar(100, 'Reconnected');
            this.appendSerialMonitor('Reconnected');
            this.appendOutput(`${found.friendlyName || 'DWM V2'} reconnected after the firmware update.`);
            if (typeof this.announce === 'function') this.announce('Meter reconnected after the firmware update');
        } else {
            this.updateProgressBar(100, FW_RESTART_TIMEOUT_MESSAGE);
            this.appendSerialMonitor(FW_RESTART_TIMEOUT_MESSAGE);
            this.appendOutput(FW_RESTART_TIMEOUT_MESSAGE);
            if (typeof this.announce === 'function') this.announce(FW_RESTART_TIMEOUT_MESSAGE, { assertive: true });
        }
        return found;
    };

    // Called by connectMeter once the meter answers again after a successful update.
    DWMControl.prototype._fwOnReconnected = function(key) {
        const record = this.meterRegistry.get(key);
        const fw = record?.state?.fwUpdate;
        if (!fw) return;
        if (fw.stage === 'done') {
            record.state.fwUpdate = { stage: 'idle' };
            this._fwHideNotice(key);
            this._fwStatus(key, 'Reconnected', 'success');
            this._fwSleep(8000).then(() => {
                const r = this.meterRegistry.get(key);
                if (r?.state?.fwUpdate?.stage === 'idle') this._fwStatus(key, '');
            });
            this.appendOutput(`${record.friendlyName || 'DWM V2'} reconnected after the firmware update.`);
            if (typeof this.announce === 'function') this.announce(`${record.friendlyName || 'DWM V2'} reconnected after the firmware update`);
        }
        this._fwSyncButton(key);
    };

    DWMControl.prototype.enterDfuForUpdate = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record) return;
        if (!window.confirm(`Enter DFU mode on ${record.friendlyName || record.portPath} for firmware update?\n\nThe device will reboot into firmware update mode. You will then be taken to the Firmware Upload tab.\n\nThe meter restarts by itself when the update finishes and the app reconnects automatically.`)) return;

        // Remember which meter this was so the Firmware tab can find it again after the flash.
        this._dfuMeterIdentity = { key, serialNumber: record.serialNumber || null };
        const sid = this.meterSafeId(key);
        const statusEl = document.getElementById(`meter-${sid}-sys-status`);
        try {
            this.sendApiCommand(key, 'sys.dfu', {}, { timeoutMs: 1000 }).catch(() => {});
            if (statusEl) statusEl.textContent = 'DFU command sent — device is rebooting into update mode.';
            this.setMeterStatus(key, 'sys.dfu sent. Switching to Firmware tab…', 'warning');
            setTimeout(async () => {
                this.stopMeterMonitoring(key, true);
                try { await window.electronAPI.closeSerialPort(record.portPath); } catch (_) {}
                record.connectionState = 'available';
                this.updateMeterCardUI(key);
                const fwTab = document.querySelector('[data-tab="firmware"]');
                if (fwTab) fwTab.click();
            }, 1200);
        } catch (err) {
            if (statusEl) statusEl.textContent = `DFU failed: ${err.message}`;
            this.setMeterStatus(key, `DFU failed: ${err.message}`, 'error');
        }
    };

    DWMControl.prototype.buildApiFrame = function(command, requestId, fields = {}, protocolVersion) {
        return window.DWMProtocol.buildFrame(command, requestId, fields, protocolVersion);
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

            this._refreshSwrMeterSelects();
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

            this._refreshSwrMeterSelects();
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
                const rangeInfo = this._normalizeRange(response.range);
                if (rangeInfo) {
                    record.rangeCfg = rangeInfo.cfg;
                    record.rangeMultiplier = rangeInfo.multiplier;
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

    DWMControl.prototype._persistMeterCardPrefs = function(key, partialPrefs) {
        if (!key || !partialPrefs || typeof partialPrefs !== 'object') return;
        if (!this.config.meterCards) this.config.meterCards = {};
        if (!this.config.meterCards[key]) this.config.meterCards[key] = {};
        Object.assign(this.config.meterCards[key], partialPrefs);
        this.saveConfig();
    };

    DWMControl.prototype._setMeterView = function(key, view) {
        const record = this.meterRegistry.get(key);
        if (record?.state) record.state.viewMode = view;

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
            const chartActions = cardEl.querySelector('.meter-chart-actions');
            if (chartActions) chartActions.style.display = view === 'history' ? '' : 'none';
        }

        if (view === 'history') this._drawMeterHistory(key);

        // Persist view preference
        this._persistMeterCardPrefs(key, { viewMode: view });
    };

    DWMControl.prototype._setMeterCardLayout = function(key, layout) {
        const record = this.meterRegistry.get(key);
        if (!record?.state) return;
        record.state.cardLayout = layout;

        // Persist layout preference
        this._persistMeterCardPrefs(key, { cardLayout: layout });
        const sid        = this.meterSafeId(key);
        const gaugesView = document.getElementById(`meter-${sid}-gauges-view`);
        if (gaugesView) gaugesView.dataset.layout = layout;

        // Sync layout dropdown value
        const cardEl = document.querySelector(`[data-meter-key="${key}"]`);
        if (cardEl) {
            const sel = cardEl.querySelector('.meter-layout-select');
            if (sel && document.activeElement !== sel) sel.value = layout;
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

        // Force gauge repaint at new size — double rAF ensures CSS layout has settled
        // before we measure canvas dimensions (single rAF can still read stale sizes).
        const liveRecord = this.meterRegistry.get(key);
        requestAnimationFrame(() => {
            // Bust the cached canvas size so _getCachedCanvasSize re-measures
            if (gaugesView) {
                gaugesView.querySelectorAll('canvas').forEach(c => {
                    delete c.dataset.cssWidth;
                    delete c.dataset.cssHeight;
                });
            }
            if (liveRecord?.state?.lastSnapshotResponse) {
                requestAnimationFrame(() => this._updateMeterGauges(key, liveRecord.state.lastSnapshotResponse));
            }
        });
    };

    DWMControl.prototype._setSwrCardLayout = function(id, layout) {
        const reg = this._getSwrRegistry();
        const rec = reg.get(id);
        if (!rec?.state) return;
        rec.state.cardLayout = layout;

        // Persist layout preference
        const swrCfg = (this.config.swrCards || []).find(c => c.id === id);
        if (swrCfg) { swrCfg.cardLayout = layout; this.saveConfig(); }
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

        // Force gauge repaint at new size — double rAF ensures CSS layout has settled.
        const fwdKey = rec.fwdKey;
        requestAnimationFrame(() => {
            if (gaugesView) {
                gaugesView.querySelectorAll('canvas').forEach(c => {
                    delete c.dataset.cssWidth;
                    delete c.dataset.cssHeight;
                });
            }
            if (fwdKey && rec.state.lastComputed) {
                requestAnimationFrame(() => this._updateSwrCardsForMeter(fwdKey));
            }
        });
    };
})();
