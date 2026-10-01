// Demo mode — two simulated DWM V2 meters for showing the app without hardware.
// When config.demoMode is on, "Demo Steady" (a ~50 W carrier) and "Demo Voice"
// (an SSB-voice-like envelope) appear on the Control tab as connected meters.
// They answer every API command the app sends through sendApiCommand, so the
// normal polling, gauge, history, config and identity paths run unchanged.
(function attachDemoModule() {
    if (typeof DWMControl === 'undefined') {
        console.error('DWMControl not defined before demo module loaded');
        return;
    }
    const P = DWMControl.prototype;

    const STEP_MS = 5;             // internal simulation step
    const PEAK_WINDOW_MS = 250;    // PEP window
    const DEFAULT_AVG_MS = 1000;   // avg / dev window (avgw = 1.0 s)
    const MAX_AVG_MS = 10000;      // avgw upper bound accepted by cfg.set
    const DEMO_LATENCY_MS = 5;     // simulated USB round trip
    const DEMO_FW = '2.6.0-demo';
    const ELEMENT_TYPES = ['30ua', '100ua'];
    const POWER_METRICS = ['inst', 'avg', 'peak', 'max', 'min', 'dev'];
    const ALL_METRICS = [...POWER_METRICS, 'pvolt', 'svolt'];
    const DEMO_COMMANDS = [
        'pwr.get', 'pwr.snap', 'pwr.info', 'sys.id', 'sys.fw', 'sys.nget', 'sys.nset', 'sys.cmds',
        'cfg.get', 'cfg.elem', 'cfg.elems', 'cfg.set', 'sys.dfu', 'sys.save', 'sys.rst',
    ];

    const DEMO_METERS = [
        { key: 'demo:steady', profile: 'steady', portPath: 'demo://steady', friendlyName: 'Demo Steady', uid: 'DEMO00000000000000STEADY', salt: 0x51ead1 },
        { key: 'demo:voice', profile: 'voice', portPath: 'demo://voice', friendlyName: 'Demo Voice', uid: 'DEMO000000000000000VOICE', salt: 0x701ce2 },
    ];
    const DEMO_KEYS = DEMO_METERS.map(d => d.key);

    // ─── Pure pieces (no `this`, no DOM) ──────────────────────────────────────

    // mulberry32: small, fast, deterministic PRNG returning [0, 1).
    P._demoRng = function(seed) {
        let a = (Number(seed) >>> 0) || 0x9e3779b9;
        return function next() {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };

    // A stateful power source. sample(tMs) advances the simulation to tMs (in 5 ms
    // steps) and returns { inst, avg, peak, max, min, dev } in watts. Time must not run
    // backwards; an earlier tMs returns the reading at the last simulated time.
    P._demoCreateSignal = function(profile, seed) {
        const rng = P._demoRng(seed);
        const isVoice = profile === 'voice';
        let avgWindowMs = DEFAULT_AVG_MS;
        let lastT = null;
        let hist = [];             // [{ t, v }] oldest first, covers max(avg, peak) window
        let runMax = -Infinity;
        let runMin = Infinity;

        // voice state
        let burstOn = false;
        let nextToggle = null;
        let amplitude = 0;
        let env = 0;

        const stepValue = (t) => {
            if (!isVoice) return Math.max(0, 50 + (rng() - 0.5));
            if (nextToggle === null || t - nextToggle > 1000) nextToggle = t; // start or after a long gap
            while (t >= nextToggle) {
                burstOn = !burstOn;
                if (burstOn) {
                    amplitude = 20 + rng() * 80;
                    nextToggle += 80 + rng() * 220;
                } else {
                    nextToggle += 50 + rng() * 350;
                }
            }
            const target = burstOn ? amplitude * (0.85 + 0.15 * rng()) : 0;
            const tau = target > env ? 10 : 30; // ~10 ms attack, ~30 ms decay
            env += (target - env) * (1 - Math.exp(-STEP_MS / tau));
            return Math.max(0, env);
        };

        const keepMs = () => Math.max(avgWindowMs, PEAK_WINDOW_MS);

        const advanceTo = (tMs) => {
            if (lastT === null) lastT = tMs - STEP_MS;
            if (tMs <= lastT) return;
            // Do not simulate more than the retained window after a long gap.
            if (tMs - lastT > keepMs() + STEP_MS) lastT = tMs - keepMs() - STEP_MS;
            for (let t = lastT + STEP_MS; t <= tMs; t += STEP_MS) {
                const v = stepValue(t);
                hist.push({ t, v });
                if (v > runMax) runMax = v;
                if (v < runMin) runMin = v;
                lastT = t;
            }
            const cutoff = lastT - keepMs();
            let drop = 0;
            while (drop < hist.length && hist[drop].t <= cutoff) drop++;
            if (drop) hist = hist.slice(drop);
        };

        return {
            profile: isVoice ? 'voice' : 'steady',
            sample(tMs) {
                advanceTo(Number(tMs) || 0);
                if (!hist.length) return { inst: 0, avg: 0, peak: 0, max: 0, min: 0, dev: 0 };
                const inst = hist[hist.length - 1].v;
                const avgFrom = lastT - avgWindowMs;
                const peakFrom = lastT - PEAK_WINDOW_MS;
                let sum = 0, sumSq = 0, n = 0, peak = 0;
                for (const h of hist) {
                    if (h.t > avgFrom) { sum += h.v; sumSq += h.v * h.v; n++; }
                    if (h.t > peakFrom && h.v > peak) peak = h.v;
                }
                const avg = n ? sum / n : inst;
                const dev = n ? Math.sqrt(Math.max(0, sumSq / n - avg * avg)) : 0;
                return { inst, avg, peak, max: runMax, min: runMin, dev };
            },
            setAvgWindowMs(ms) {
                const v = Number(ms);
                if (Number.isFinite(v) && v > 0) avgWindowMs = Math.min(MAX_AVG_MS, v);
            },
            _historyLength() { return hist.length; },
        };
    };

    // The simulated meter's firmware-side state.
    P._demoCreateModel = function(profile, seed) {
        const def = DEMO_METERS.find(d => d.profile === profile) || DEMO_METERS[0];
        return {
            profile: def.profile,
            uid: def.uid,
            name: def.friendlyName,
            fw: DEMO_FW,
            cfg: {
                elem: 1,
                range: 0,
                bright: 7,
                avgw: 1,
                elems: Array.from({ length: 8 }, () => ({ eval: 100, etype: '30ua' })),
            },
            signal: P._demoCreateSignal(def.profile, seed),
        };
    };

    function apiError(cmd, code, msg) {
        const frame = { cmd, code, msg };
        const error = new Error(P.describeApiError ? P.describeApiError(frame) : `${cmd} failed: ${code}`);
        error.code = code;
        return error;
    }

    const fmtW = (n) => (Number.isFinite(n) ? n : 0).toFixed(6);

    function parseIntStrict(value) {
        const s = String(value ?? '').trim();
        return /^-?\d+$/.test(s) ? Number.parseInt(s, 10) : NaN;
    }

    function requireElem(cmd, fields, required) {
        if (fields.elem === undefined || fields.elem === null || fields.elem === '') {
            if (required) throw apiError(cmd, 'ERR_MISSING_KEY', 'elem');
            return null;
        }
        const elem = parseIntStrict(fields.elem);
        if (!Number.isFinite(elem)) throw apiError(cmd, 'ERR_BAD_VALUE', 'elem');
        if (elem < 1 || elem > 8) throw apiError(cmd, 'ERR_VALUE_RANGE', 'elem');
        return elem;
    }

    // Response for one command, shaped like control-api's parseApiFrame output
    // (string values). Throws an Error with an ERR_* `code` for bad input.
    P._demoResponseFor = function(meter, command, fields = {}, tMs = 0) {
        const cmd = String(command || '');
        const f = fields || {};
        const cfg = meter.cfg;
        const active = () => cfg.elems[cfg.elem - 1];
        const multiplier = () => (window.DWMProtocol?.normalizeRange(cfg.range)?.multiplier) || [1, 2, 4][cfg.range] || 1;
        const rangeLabel = () => `${multiplier()}x`;
        const elementInfo = () => ({
            elem: String(cfg.elem),
            etype: active().etype,
            eval: active().eval.toFixed(3),
            range: rangeLabel(),
        });
        const readings = () => {
            const s = meter.signal.sample(tMs);
            const full = active().eval * multiplier();
            const pvolt = full > 0 ? Math.sqrt(Math.min(1, s.inst / full)) * 3300 : 0;
            return { ...s, pvolt, svolt: 5.0 };
        };
        const ok = (payload = {}) => ({ proto: '2', type: 'resp', status: 'ok', cmd, ...payload });

        switch (cmd) {
            case 'pwr.snap': {
                const r = readings();
                const d = [...POWER_METRICS.map(m => fmtW(r[m])), r.pvolt.toFixed(2), r.svolt.toFixed(1)].join(',');
                return ok({ d, ...elementInfo() });
            }
            case 'pwr.get': {
                if (!f.met) throw apiError(cmd, 'ERR_MISSING_KEY', 'met');
                const met = String(f.met).toLowerCase();
                if (!ALL_METRICS.includes(met)) throw apiError(cmd, 'ERR_UNKNOWN_METRIC', met);
                const r = readings();
                const value = met === 'pvolt' ? r.pvolt.toFixed(2) : met === 'svolt' ? r.svolt.toFixed(1) : fmtW(r[met]);
                return ok({ met, value, ...elementInfo() });
            }
            case 'pwr.info':
                return ok(elementInfo());
            case 'cfg.elems': {
                const payload = {};
                cfg.elems.forEach((e, i) => {
                    payload[`e${i + 1}v`] = e.eval.toFixed(3);
                    payload[`e${i + 1}t`] = e.etype;
                });
                return ok(payload);
            }
            case 'cfg.elem': {
                const elem = requireElem(cmd, f, false) || cfg.elem;
                const e = cfg.elems[elem - 1];
                return ok({ elem: String(elem), eval: e.eval.toFixed(6), etype: e.etype });
            }
            case 'cfg.get': {
                if (!f.key) throw apiError(cmd, 'ERR_MISSING_KEY', 'key');
                const key = String(f.key);
                switch (key) {
                    case 'bright': return ok({ key, val: String(cfg.bright) });
                    case 'elem': return ok({ key, val: String(cfg.elem) });
                    case 'range': return ok({ key, val: String(cfg.range) });
                    case 'avgw': return ok({ key, val: cfg.avgw.toFixed(3) });
                    case 'eval':
                    case 'etype': {
                        const elem = requireElem(cmd, f, false);
                        const e = cfg.elems[(elem || cfg.elem) - 1];
                        const val = key === 'eval' ? e.eval.toFixed(6) : e.etype;
                        return ok(elem ? { key, elem: String(elem), val } : { key, val });
                    }
                    default: throw apiError(cmd, 'ERR_BAD_ENUM', 'unknown_setting_key');
                }
            }
            case 'cfg.set': {
                if (!f.key) throw apiError(cmd, 'ERR_MISSING_KEY', 'key');
                if (f.val === undefined || f.val === null || f.val === '') throw apiError(cmd, 'ERR_MISSING_KEY', 'val');
                const key = String(f.key);
                const raw = String(f.val).trim();
                switch (key) {
                    case 'bright': {
                        const v = parseIntStrict(raw);
                        if (!Number.isFinite(v)) throw apiError(cmd, 'ERR_BAD_VALUE', key);
                        if (v < 0 || v > 10) throw apiError(cmd, 'ERR_VALUE_RANGE', key);
                        cfg.bright = v;
                        return ok({ key, val: String(v) });
                    }
                    case 'elem': {
                        const v = parseIntStrict(raw);
                        if (!Number.isFinite(v)) throw apiError(cmd, 'ERR_BAD_VALUE', key);
                        if (v < 1 || v > 8) throw apiError(cmd, 'ERR_VALUE_RANGE', key);
                        cfg.elem = v;
                        return ok({ key, val: String(v) });
                    }
                    case 'range': {
                        const v = parseIntStrict(raw);
                        if (!Number.isFinite(v)) throw apiError(cmd, 'ERR_BAD_VALUE', key);
                        if (v < 0 || v > 2) throw apiError(cmd, 'ERR_VALUE_RANGE', key);
                        cfg.range = v;
                        return ok({ key, val: String(v) });
                    }
                    case 'avgw': {
                        const v = Number.parseFloat(raw);
                        if (!Number.isFinite(v)) throw apiError(cmd, 'ERR_BAD_VALUE', key);
                        if (v < 0.5 || v > 10) throw apiError(cmd, 'ERR_VALUE_RANGE', key);
                        cfg.avgw = v;
                        meter.signal.setAvgWindowMs?.(v * 1000);
                        return ok({ key, val: v.toFixed(3) });
                    }
                    case 'eval': {
                        const elem = requireElem(cmd, f, true);
                        const v = Number.parseFloat(raw);
                        if (!Number.isFinite(v)) throw apiError(cmd, 'ERR_BAD_VALUE', key);
                        if (v <= 0) throw apiError(cmd, 'ERR_VALUE_RANGE', key);
                        cfg.elems[elem - 1].eval = v;
                        return ok({ key, elem: String(elem), val: v.toFixed(6) });
                    }
                    case 'etype': {
                        const elem = requireElem(cmd, f, true);
                        const v = raw.toLowerCase();
                        if (!ELEMENT_TYPES.includes(v)) throw apiError(cmd, 'ERR_BAD_ENUM', key);
                        cfg.elems[elem - 1].etype = v;
                        return ok({ key, elem: String(elem), val: v });
                    }
                    default: throw apiError(cmd, 'ERR_BAD_ENUM', 'unknown_setting_key');
                }
            }
            case 'sys.id':
                return ok({ uid: meter.uid, dname: meter.name });
            case 'sys.fw':
                return ok({ fver: `FW:_${meter.fw}_-_COMMS` });
            case 'sys.nget':
                return ok({ dname: meter.name });
            case 'sys.nset': {
                if (f.name === undefined || f.name === null || f.name === '') throw apiError(cmd, 'ERR_MISSING_KEY', 'name');
                const name = String(f.name);
                if (!/^[A-Za-z0-9_]{1,20}$/.test(name)) throw apiError(cmd, 'ERR_SETTING_REJECTED', 'invalid_name');
                meter.name = name;
                return ok({ dname: name });
            }
            case 'sys.cmds':
                return ok({ cmds: DEMO_COMMANDS.join(',') });
            case 'sys.save':
            case 'sys.rst':
            case 'sys.dfu':
                return ok();
            default:
                throw apiError(cmd, 'ERR_UNKNOWN_CMD', 'unknown_command');
        }
    };

    function rawLine(resp) {
        const head = ['proto', 'type', 'status', 'cmd', 'req'];
        const tokens = head.filter(k => resp[k] !== undefined).map(k => `${k}=${resp[k]}`);
        Object.keys(resp).forEach(k => {
            if (head.includes(k) || k === 'raw') return;
            tokens.push(`${k}=${String(resp[k]).replace(/ /g, '_')}`);
        });
        return tokens.join(' ');
    }

    // ─── Command path ─────────────────────────────────────────────────────────

    // Called by sendApiCommand for demo records: resolves after a short simulated
    // latency, never touches the serial port, the pacing queue or the proto=1 fallback.
    P._demoHandleCommand = function(record, command, fields = {}) {
        const key = record.key;
        const state = record.state;
        const req = String(state.nextRequestId++);
        try {
            this.appendMeterDebug?.(key, 'TX', this.buildApiFrame(command, req, fields, '2'));
        } catch (_) { /* debug only */ }

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (this.meterRegistry.get(key) !== record || record.connectionState !== 'connected') {
                    reject(new Error('Device is not connected'));
                    return;
                }
                try {
                    const resp = this._demoResponseFor(record.demoModel, command, fields, Date.now());
                    resp.req = req;
                    resp.raw = rawLine(resp);
                    this.appendMeterDebug?.(key, 'RX', `${resp.raw}\r\n`);
                    this.updateMeterLastFrame?.(key);
                    resolve(resp);
                } catch (error) {
                    const errLine = `proto=2 type=err status=error cmd=${command} req=${req} code=${error.code || 'ERR_INTERNAL'}`;
                    this.appendMeterDebug?.(key, 'RX', `${errLine}\r\n`);
                    reject(error);
                }
            }, DEMO_LATENCY_MS);
        });
    };

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    P._demoBuildRecord = function(def) {
        const model = this._demoCreateModel(def.profile, (Date.now() ^ def.salt) >>> 0);
        const prefs = this.config?.meterCards?.[def.key] || {};
        const state = this.createMeterState();
        if (prefs.viewMode === 'meters' || prefs.viewMode === 'history') state.viewMode = prefs.viewMode;
        if (typeof prefs.cardLayout === 'string' && prefs.cardLayout) state.cardLayout = prefs.cardLayout;
        if (Number.isFinite(prefs.historyWindowMs) && prefs.historyWindowMs > 0) state.historyWindowMs = prefs.historyWindowMs;
        if (Array.isArray(prefs.historyLines) && prefs.historyLines.length > 0) state.historyLines = [...prefs.historyLines];
        state.protocolVersion = '2';
        state.elementRating = 100;
        state.rangeMultiplier = 1;
        state.rangeCfg = 0;
        state.maxPowerW = 100;

        const profilesResp = this._demoResponseFor(model, 'cfg.elems', {}, 0);
        return {
            key: def.key,
            isDemo: true,
            demoModel: model,
            portPath: def.portPath,
            friendlyName: def.friendlyName,
            fallbackUid: null,
            apiUid: def.uid,
            connectionState: 'connected',
            state,
            lastSeenAt: Date.now(),
            gaugeMetricL: prefs.gaugeMetricL || 'avg',
            gaugeMetricR: prefs.gaugeMetricR || 'peak',
            gaugeDisplayL: prefs.gaugeDisplayL || 'gauge',
            gaugeDisplayR: prefs.gaugeDisplayR || 'gauge',
            pepHoldMs: Number.isFinite(prefs.pepHoldMs) ? prefs.pepHoldMs : 1000,
            elementId: 1,
            elementRating: 100,
            elementType: '30ua',
            elementProfiles: typeof this._parseElementProfiles === 'function' ? this._parseElementProfiles(profilesResp) : [],
            rangeMultiplier: 1,
            rangeCfg: 0,
            protocolVersion: '2',
        };
    };

    P._demoStart = function() {
        if (!this.config) this.config = {};
        if (!Array.isArray(this.config.meterCardOrder)) this.config.meterCardOrder = [];
        if (!Array.isArray(this.config.boardCardOrder)) this.config.boardCardOrder = [];

        const added = [];
        for (const def of DEMO_METERS) {
            if (this.meterRegistry.get(def.key)?.isDemo) continue;
            this.meterRegistry.set(def.key, this._demoBuildRecord(def));
            if (!this.config.meterCardOrder.includes(def.key)) this.config.meterCardOrder.push(def.key);
            const token = `meter:${def.key}`;
            if (!this.config.boardCardOrder.includes(token)) this.config.boardCardOrder.push(token);
            added.push(def.key);
        }
        if (!added.length) return false;

        this.saveConfig?.();
        this.refreshMeterBoard?.();
        for (const key of added) {
            if (!this.activeMeterKey) this.activeMeterKey = key;
            this.isConnected = true;
            this.updateMeterCardUI?.(key);
            this._autoQueryMeterOnConnect?.(key);
            if (this.config.globalAutoStartPolling !== false) this.startMeterMonitoring?.(key);
        }
        this.appendOutput?.('Demo mode: simulated meters "Demo Steady" and "Demo Voice" added.');
        return true;
    };

    P._demoStop = function() {
        const keys = DEMO_KEYS.filter(k => this.meterRegistry.get(k)?.isDemo);
        if (!keys.length) return false;

        for (const key of keys) {
            this.stopMeterMonitoring?.(key, true);
            const record = this.meterRegistry.get(key);
            if (record) record.connectionState = 'disconnected';
            this.meterRegistry.delete(key);
        }
        const tokens = new Set(keys.map(k => `meter:${k}`));
        if (Array.isArray(this.config.meterCardOrder)) {
            this.config.meterCardOrder = this.config.meterCardOrder.filter(k => !keys.includes(k));
        }
        if (Array.isArray(this.config.boardCardOrder)) {
            this.config.boardCardOrder = this.config.boardCardOrder.filter(t => !tokens.has(t));
        }
        if (keys.includes(this.activeMeterKey)) {
            this.activeMeterKey = null;
            for (const [k, r] of this.meterRegistry) {
                if (r.connectionState === 'connected') { this.activeMeterKey = k; break; }
            }
        }
        this.isConnected = [...this.meterRegistry.values()].some(r => r.connectionState === 'connected');
        this.saveConfig?.();
        this.refreshMeterBoard?.();
        this.appendOutput?.('Demo mode: simulated meters removed.');
        return true;
    };

    P.setupDemoMode = function() {
        if (this.config?.demoMode === true) this._demoStart();
    };

    P.setDemoMode = function(on) {
        const enable = on === true;
        if (!this.config) this.config = {};
        const configChanged = (this.config.demoMode === true) !== enable;
        this.config.demoMode = enable;
        const changed = enable ? this._demoStart() : this._demoStop();
        if (configChanged && !changed) this.saveConfig?.();
        if (changed && typeof this.announce === 'function') {
            this.announce(enable ? 'Demo mode on' : 'Demo mode off');
        }
        return changed;
    };

    P._demoConnect = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record?.isDemo) return;
        if (!record.state) record.state = this.createMeterState();
        record.connectionState = 'connected';
        record.lastSeenAt = Date.now();
        this.activeMeterKey = this.activeMeterKey || key;
        this.isConnected = true;
        this.updateMeterCardUI?.(key);
        this.announce?.(`Connected to ${record.friendlyName || 'demo meter'}`);
        this._autoQueryMeterOnConnect?.(key);
        if (this.config?.globalAutoStartPolling !== false) this.startMeterMonitoring?.(key);
    };

    P._demoDisconnect = async function(key) {
        const record = this.meterRegistry.get(key);
        if (!record?.isDemo) return;
        this.stopMeterMonitoring?.(key, true);
        record.connectionState = 'disconnected';
        if (this.activeMeterKey === key) {
            this.activeMeterKey = null;
            for (const [k, r] of this.meterRegistry) {
                if (r.connectionState === 'connected') { this.activeMeterKey = k; break; }
            }
        }
        this.isConnected = [...this.meterRegistry.values()].some(r => r.connectionState === 'connected');
        this.resetMeterReadings?.(key);
        this.updateMeterCardUI?.(key);
        this.announce?.(`Disconnected from ${record.friendlyName || 'demo meter'}`);
    };

    // Raw debug sends on a demo meter: parse each proto= line and answer it in the debug log.
    P._demoRawCommand = async function(key) {
        const record = this.meterRegistry.get(key);
        const sid = this.meterSafeId(key);
        const inputEl = document.getElementById(`meter-${sid}-raw-command`);
        if (!record || record.connectionState !== 'connected') {
            this.setMeterStatus(key, 'Connect to this meter before sending a raw command.', 'warning');
            return;
        }
        if (!inputEl || !inputEl.value.trim()) {
            this.setMeterStatus(key, 'Enter a raw command before sending.', 'warning');
            return;
        }
        const lines = this._decodeRawDebugCommand(inputEl.value).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
            const frame = this.parseApiFrame(line);
            if (!frame.cmd) continue;
            const fields = { ...frame };
            ['raw', 'proto', 'type', 'cmd', 'req'].forEach(k => delete fields[k]);
            try { await this._demoHandleCommand(record, frame.cmd, fields); } catch (_) { /* shown as RX err */ }
        }
        this.setMeterStatus(key, 'Raw command sent to the demo meter. Watch RX below for the response.', 'ready');
    };

    // ─── Wrap serial-specific entry points so demo meters never touch a port ──

    const origConnect = P.connectMeter;
    P.connectMeter = async function(key, options) {
        if (this.meterRegistry.get(key)?.isDemo) return this._demoConnect(key);
        return origConnect.call(this, key, options);
    };

    const origDisconnect = P.disconnectMeter;
    P.disconnectMeter = async function(key) {
        if (this.meterRegistry.get(key)?.isDemo) return this._demoDisconnect(key);
        return origDisconnect.call(this, key);
    };

    const origWatchdog = P._triggerMeterWatchdogReconnect;
    P._triggerMeterWatchdogReconnect = async function(key) {
        const record = this.meterRegistry.get(key);
        if (record?.isDemo) {
            if (record.state) record.state.consecutiveFailures = 0;
            return;
        }
        return origWatchdog.call(this, key);
    };

    const origRaw = P.sendRawMeterCommand;
    P.sendRawMeterCommand = async function(key) {
        if (this.meterRegistry.get(key)?.isDemo) return this._demoRawCommand(key);
        return origRaw.call(this, key);
    };
})();
