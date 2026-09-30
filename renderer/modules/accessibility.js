// Accessibility: screen-reader announcements, spoken readouts, tuning tone, keyboard shortcuts
(function() {
  if (typeof DWMControl === 'undefined') return;
  const P = DWMControl.prototype;

  // ─── Pure helpers (no DOM, no `this`) ──────────────────────────────────────

  const sig3 = (n) => Number(n.toPrecision(3));

  P._a11yFormatSpokenPower = function(w) {
    if (typeof w !== 'number' || !Number.isFinite(w)) return 'no reading';
    if (w === 0) return '0 watts';
    const abs = Math.abs(w);
    if (abs < 1) {
      const mw = sig3(w * 1000);
      return mw === 1 || mw === -1 ? `${mw} milliwatt` : `${mw} milliwatts`;
    }
    if (abs >= 1000) return `${sig3(w / 1000)} kilowatts`;
    const v = sig3(w);
    return v === 1 ? '1 watt' : `${v} watts`;
  };

  P._a11yFormatSpokenSwr = function(swr) {
    if (typeof swr !== 'number' || !Number.isFinite(swr) || swr <= 0) return 'SWR unknown';
    if (swr >= 99) return 'SWR infinite';
    return `SWR ${swr.toFixed(1)} to 1`;
  };

  P._a11yFormatSpokenNumber = function(n, unit) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return 'no reading';
    const body = `${sig3(Math.abs(n))}${unit ? ` ${unit}` : ''}`;
    return n < 0 ? `minus ${body}` : body;
  };

  P._a11yMetricSpokenName = function(metric) {
    const names = { avg: 'average', peak: 'PEP', inst: 'instantaneous', max: 'maximum', min: 'minimum', dev: 'deviation' };
    return names[metric] || metric;
  };

  P._a11yBuildReadout = function({ meterName, metric, watts, swr, peakHold, includeName, includeSwr } = {}) {
    let text = `${peakHold ? 'peak hold ' : ''}${this._a11yMetricSpokenName(metric)} ${this._a11yFormatSpokenPower(watts)}`;
    if (includeName && meterName) text = `${meterName}, ${text}`;
    if (includeSwr && Number.isFinite(swr)) text += `, ${this._a11yFormatSpokenSwr(swr)}`;
    return text;
  };

  P._a11yToneFrequency = function(w, fullScaleW, minHz, maxHz) {
    if (!Number.isFinite(fullScaleW) || fullScaleW <= 0 || !Number.isFinite(w)) return minHz;
    const frac = Math.min(1, Math.max(0, w / fullScaleW));
    return minHz + (maxHz - minHz) * frac;
  };

  P._a11yShouldSpeak = function(state, now, cfg, w, fullScaleW) {
    const mode = cfg.speechMode;
    if (mode === 'manual') return false;
    const last = state.lastSpokenAt || 0;
    if (last > 0 && now - last < cfg.speechMinGapMs) return false;
    if (mode === 'interval') return last === 0 || now - last >= cfg.speechIntervalS * 1000;
    if (mode === 'change') {
      if (state.lastSpokenW === null || state.lastSpokenW === undefined) return true;
      const delta = Math.abs(w - state.lastSpokenW);
      const threshold = fullScaleW > 0 ? (cfg.speechChangePct / 100) * fullScaleW : 0.1;
      return delta >= threshold;
    }
    return false;
  };

  const CODE_ACTIONS = {
    KeyS: 'speech-toggle', KeyT: 'tone-toggle', KeyR: 'speak-now', KeyD: 'describe-meter',
    KeyP: 'peak-hold', KeyM: 'range-cycle', KeyA: 'metric-cycle',
    ArrowRight: 'meter-next', ArrowLeft: 'meter-prev',
  };
  const KEY_ACTIONS = { s: 'speech-toggle', t: 'tone-toggle', r: 'speak-now', d: 'describe-meter', p: 'peak-hold', m: 'range-cycle', a: 'metric-cycle' };

  P._a11yActionForKey = function(evt) {
    if (!evt || !(evt.ctrlKey || evt.metaKey) || !evt.shiftKey || evt.altKey) return null;
    const t = evt.target;
    if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return null;
    let action = null;
    let arg;
    const code = evt.code;
    if (code) {
      const digit = /^Digit([1-8])$/.exec(code);
      if (digit) { action = 'meter-select'; arg = Number(digit[1]); } else action = CODE_ACTIONS[code] || null;
    } else if (typeof evt.key === 'string') {
      if (/^[1-8]$/.test(evt.key)) { action = 'meter-select'; arg = Number(evt.key); }
      else if (evt.key === 'ArrowRight') action = 'meter-next';
      else if (evt.key === 'ArrowLeft') action = 'meter-prev';
      else action = KEY_ACTIONS[evt.key.toLowerCase()] || null;
    }
    return action ? { action, arg } : null;
  };

  P._a11yDfuMilestone = function(prevPct, pct) {
    let hit = null;
    for (const m of [25, 50, 75, 100]) if (prevPct < m && pct >= m) hit = m;
    return hit;
  };

  // Usable meter keys: `order` filtered to those in `registry`, then any extras in registry order.
  P._a11yNextMeterKeyList = function(order, registry) {
    const list = (order || []).filter((k) => registry.has(k));
    for (const k of registry.keys()) if (!list.includes(k)) list.push(k);
    return list;
  };

  P._a11yNextMeterKey = function(order, registry, currentKey, dir) {
    const list = P._a11yNextMeterKeyList(order, registry);
    if (list.length === 0) return null;
    const i = list.indexOf(currentKey);
    if (i < 0) return dir >= 0 ? list[0] : list[list.length - 1];
    return list[(i + dir + list.length * 2) % list.length];
  };

  // ─── State and announcements ───────────────────────────────────────────────

  P._a11yState = function() {
    if (!this.a11y) {
      this.a11y = {
        focusedMeterKey: null,
        peakHold: false,
        speech: { lastSpokenAt: 0, lastSpokenW: null },
        tone: { ctx: null, osc: null, gain: null, running: false },
        announce: { timer: null, pending: null },
        lastActionAt: {},
        screenReader: null,
        dfuLastPct: 0,
      };
    }
    return this.a11y;
  };

  P._a11yCfg = function() {
    return this.config.accessibility || this._accessibilityDefaults();
  };

  P._a11yPersist = function(patch) {
    this.config.accessibility = this.normalizeAccessibility({ ...this._a11yCfg(), ...patch });
    this.saveConfig();
  };

  const ANNOUNCE_WINDOW_MS = 400;

  P.announce = function(text, { assertive = false } = {}) {
    const cfg = this._a11yCfg();
    const st = this._a11yState();
    const mode = cfg.announcements;
    const sr = st.screenReader;
    const speechPreferred = mode === 'auto' && sr === false && Boolean(cfg.speechEnabled);
    const useLive = mode === 'live-region' || mode === 'both' || (mode === 'auto' && !speechPreferred);
    const useSpeech = mode === 'speech' || mode === 'both' || speechPreferred;
    if (useSpeech) this._a11ySpeak(text);
    if (!useLive) return;

    const id = assertive ? 'a11y-alert' : 'a11y-status';
    const el = document.getElementById(id);
    if (el) el.textContent = '';
    const a = st.announce;
    if (!a.pending) a.pending = {};
    a.pending[id] = text;
    if (a.timer) return;
    a.timer = setTimeout(() => {
      const pending = a.pending || {};
      a.timer = null;
      a.pending = null;
      for (const [elId, t] of Object.entries(pending)) {
        const target = document.getElementById(elId);
        if (target) target.textContent = t;
      }
    }, ANNOUNCE_WINDOW_MS);
  };

  // ─── Speech engine and snapshot hook ───────────────────────────────────────

  P._a11ySpeak = function(text) {
    const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
    if (!synth) return false;
    const cfg = this._a11yCfg();
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = cfg.speechRate;
      u.volume = cfg.speechVolume;
      if (cfg.speechVoice) {
        const voice = (synth.getVoices() || []).find((v) => v.voiceURI === cfg.speechVoice);
        if (voice) u.voice = voice;
      }
      synth.speak(u);
      return true;
    } catch (_) {
      return false;
    }
  };

  P._a11yMeterOrder = function() {
    return this._a11yNextMeterKeyList(this.config.meterCardOrder, this.meterRegistry);
  };

  P._a11yFocusedKey = function() {
    const st = this._a11yState();
    if (st.focusedMeterKey && this.meterRegistry.has(st.focusedMeterKey)) return st.focusedMeterKey;
    const saved = this._a11yCfg().focusedMeterKey;
    if (saved && this.meterRegistry.has(saved)) {
      st.focusedMeterKey = saved;
      return saved;
    }
    const order = this._a11yMeterOrder();
    if (order.length === 0) return null;
    const connected = order.find((k) => this.meterRegistry.get(k)?.connectionState === 'connected');
    st.focusedMeterKey = connected || order[0];
    return st.focusedMeterKey;
  };

  P._a11yReadoutWatts = function(record, displayResponse) {
    const cfg = this._a11yCfg();
    let raw = Number.parseFloat(displayResponse?.[cfg.speechMetric]);
    if (!Number.isFinite(raw)) raw = Number.parseFloat(displayResponse?.avg);
    if (!Number.isFinite(raw)) raw = NaN;
    if (this._a11yState().peakHold && record?.state && Number.isFinite(raw)) {
      record.state.a11yPeakLatchW = Math.max(record.state.a11yPeakLatchW || 0, raw);
      return record.state.a11yPeakLatchW;
    }
    return raw;
  };

  P._a11ySwrForMeter = function(key) {
    const card = (this.config.swrCards || []).find((c) => c.fwdKey === key);
    if (!card || !card.refKey) return null;
    const fwd = this.meterRegistry.get(card.fwdKey)?.state?.lastSnapshotRaw;
    const ref = this.meterRegistry.get(card.refKey)?.state?.lastSnapshotRaw;
    if (!fwd || !ref) return null;
    const m = this._computeSwrMetrics(Number.parseFloat(fwd[card.fwdMetric || 'avg']), Number.parseFloat(ref[card.refMetric || 'avg']));
    return m ? m.swr : null;
  };

  P._a11yBuildFocusedReadout = function(key, watts) {
    const cfg = this._a11yCfg();
    const record = this.meterRegistry.get(key);
    return this._a11yBuildReadout({
      meterName: record?.friendlyName || 'DWM V2',
      metric: cfg.speechMetric,
      watts,
      swr: cfg.speechIncludeSwr ? this._a11ySwrForMeter(key) : null,
      peakHold: this._a11yState().peakHold,
      includeName: cfg.speechIncludeMeterName,
      includeSwr: cfg.speechIncludeSwr,
    });
  };

  P._a11yOnSnapshot = function(key, displayResponse) {
    try {
      try { this._a11yUpdateGaugeText(key, displayResponse); } catch (_) { /* never break polling */ }
      if (key !== this._a11yFocusedKey()) return;
      const cfg = this._a11yCfg();
      const record = this.meterRegistry.get(key);
      const watts = this._a11yReadoutWatts(record, displayResponse);
      const fs = this._computeGaugeMax(key);
      if (cfg.toneEnabled) this._a11yToneSet(watts, fs);
      const speech = this._a11yState().speech;
      const now = Date.now();
      if (cfg.speechEnabled && Number.isFinite(watts) && this._a11yShouldSpeak(speech, now, cfg, watts, fs)) {
        this._a11ySpeak(this._a11yBuildFocusedReadout(key, watts));
        speech.lastSpokenAt = now;
        speech.lastSpokenW = watts;
      }
    } catch (_) { /* accessibility must never break polling */ }
  };

  P._a11yTogglePeakHold = function() {
    const st = this._a11yState();
    st.peakHold = !st.peakHold;
    for (const r of this.meterRegistry.values()) if (r.state) delete r.state.a11yPeakLatchW;
    this.announce(st.peakHold ? 'Peak hold on' : 'Peak hold off');
  };

  // ─── Tuning tone ───────────────────────────────────────────────────────────

  P._a11yToneStart = function() {
    const tone = this._a11yState().tone;
    if (tone.running) return true;
    if (typeof AudioContext === 'undefined') return false;
    const cfg = this._a11yCfg();
    try {
      if (!tone.ctx) tone.ctx = new AudioContext();
      const ctx = tone.ctx;
      const osc = ctx.createOscillator();
      osc.type = cfg.toneWave;
      const gain = ctx.createGain();
      gain.gain.value = cfg.toneVolume;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      if (typeof ctx.resume === 'function') Promise.resolve(ctx.resume()).catch(() => {});
      tone.osc = osc;
      tone.gain = gain;
      tone.running = true;
      return true;
    } catch (_) {
      return false;
    }
  };

  P._a11yToneSet = function(watts, fullScaleW) {
    const tone = this._a11yState().tone;
    if (!tone.running || !tone.osc || !tone.gain) return;
    const cfg = this._a11yCfg();
    const t = tone.ctx.currentTime;
    const f = this._a11yToneFrequency(watts, fullScaleW, cfg.toneMinHz, cfg.toneMaxHz);
    tone.osc.frequency.setTargetAtTime(f, t, 0.03);
    const pct = fullScaleW > 0 ? (watts / fullScaleW) * 100 : 0;
    const muted = cfg.toneMuteBelowPct > 0 && pct < cfg.toneMuteBelowPct;
    tone.gain.gain.setTargetAtTime(muted ? 0 : cfg.toneVolume, t, 0.03);
  };

  P._a11yToneStop = function() {
    const tone = this._a11yState().tone;
    const { osc, gain } = tone;
    tone.osc = null;
    tone.gain = null;
    tone.running = false;
    try { if (osc) { osc.stop(); osc.disconnect(); } } catch (_) { /* already stopped */ }
    try { if (gain) gain.disconnect(); } catch (_) { /* already disconnected */ }
  };

  // ─── Actions, focus, dispatcher ────────────────────────────────────────────

  P._a11yToggleSpeech = function() {
    const on = !this._a11yCfg().speechEnabled;
    this._a11yPersist({ speechEnabled: on });
    const msg = on ? 'Spoken readouts on' : 'Spoken readouts off';
    this.announce(msg);
    if (on) this._a11ySpeak(msg);
  };

  P._a11yToggleTone = function() {
    const on = !this._a11yCfg().toneEnabled;
    this._a11yPersist({ toneEnabled: on });
    if (on) this._a11yToneStart(); else this._a11yToneStop();
    this.announce(on ? 'Tuning tone on' : 'Tuning tone off');
  };

  P._a11ySpeakNow = function() {
    const key = this._a11yFocusedKey();
    if (!key) { this.announce('No meter selected'); return; }
    const record = this.meterRegistry.get(key);
    const watts = this._a11yReadoutWatts(record, record?.state?.lastSnapshotRaw);
    this._a11ySpeak(this._a11yBuildFocusedReadout(key, watts));
  };

  P._a11yDescribeMeter = function() {
    const key = this._a11yFocusedKey();
    if (!key) { this.announce('No meter selected'); return; }
    const record = this.meterRegistry.get(key);
    const order = this._a11yMeterOrder();
    const cfg = this._a11yCfg();
    const range = this._normalizeRange(record.rangeCfg);
    const text = `Meter ${order.indexOf(key) + 1} of ${order.length}, ${record.friendlyName || 'DWM V2'}, `
      + `${record.connectionState === 'connected' ? 'connected' : 'disconnected'}, `
      + `element ${this._a11yFormatSpokenPower(record.elementRating)}, range ${range ? range.label : 'unknown'}, `
      + `full scale ${this._a11yFormatSpokenPower(this._computeGaugeMax(key))}, reading ${this._a11yMetricSpokenName(cfg.speechMetric)}`;
    this.announce(text);
    this._a11ySpeak(text);
  };

  P._a11yCycleMetric = function() {
    const order = ['avg', 'peak', 'inst', 'max'];
    const cur = order.indexOf(this._a11yCfg().speechMetric);
    const next = order[(cur + 1) % order.length];
    this._a11yPersist({ speechMetric: next });
    this.announce(`Readout metric: ${this._a11yMetricSpokenName(next)}`);
  };

  P._a11yCycleRange = function() {
    const key = this._a11yFocusedKey();
    const record = key ? this.meterRegistry.get(key) : null;
    if (!record) { this.announce('No meter selected'); return undefined; }
    const next = ((Number.parseInt(record.rangeCfg, 10) || 0) + 1) % 3;
    return this.applyCfgValue(key, 'range', String(next));
  };

  P._a11yAnnounceRange = function(key) {
    const record = this.meterRegistry.get(key);
    if (!record) return;
    const range = this._normalizeRange(record.rangeCfg);
    this.announce(`Range ${range ? range.label : 'unknown'}, full scale ${this._a11yFormatSpokenPower(this._computeGaugeMax(key))}`);
  };

  P._a11yMarkFocusedCard = function() {
    const focused = this.a11y?.focusedMeterKey;
    for (const key of this.meterRegistry.keys()) {
      const card = document.getElementById(`meter-card-${this.meterSafeId(key)}`);
      if (!card) continue;
      const on = key === focused;
      card.classList.toggle('a11y-focused', on);
      if (on) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
    }
  };

  P._a11yFocusMeter = function(keyOrIndex) {
    const order = this._a11yMeterOrder();
    const key = typeof keyOrIndex === 'number' ? order[keyOrIndex - 1] : keyOrIndex;
    if (!key || !order.includes(key)) { this.announce(`No meter ${keyOrIndex}`); return; }
    this._a11yState().focusedMeterKey = key;
    this._a11yPersist({ focusedMeterKey: key });
    this._a11yMarkFocusedCard();
    const name = this.meterRegistry.get(key)?.friendlyName || 'DWM V2';
    this.announce(`Meter ${order.indexOf(key) + 1} of ${order.length}: ${name}`);
  };

  P._a11yFocusNext = function(dir) {
    const key = this._a11yNextMeterKey(this.config.meterCardOrder, this.meterRegistry, this._a11yFocusedKey(), dir);
    if (!key) { this.announce('No meter selected'); return; }
    this._a11yFocusMeter(key);
  };

  const A11Y_ACTIONS = ['speech-toggle', 'tone-toggle', 'speak-now', 'describe-meter', 'peak-hold', 'range-cycle', 'metric-cycle', 'meter-next', 'meter-prev', 'meter-select'];

  P._a11yDispatchAction = function(action, arg) {
    if (!A11Y_ACTIONS.includes(action)) return false;
    const st = this._a11yState();
    const now = Date.now();
    if (st.lastActionAt[action] !== undefined && now - st.lastActionAt[action] < 150) return true;
    st.lastActionAt[action] = now;
    switch (action) {
      case 'speech-toggle': this._a11yToggleSpeech(); break;
      case 'tone-toggle': this._a11yToggleTone(); break;
      case 'speak-now': this._a11ySpeakNow(); break;
      case 'describe-meter': this._a11yDescribeMeter(); break;
      case 'peak-hold': this._a11yTogglePeakHold(); break;
      case 'range-cycle': this._a11yCycleRange(); break;
      case 'metric-cycle': this._a11yCycleMetric(); break;
      case 'meter-next': this._a11yFocusNext(1); break;
      case 'meter-prev': this._a11yFocusNext(-1); break;
      case 'meter-select': this._a11yFocusMeter(Number(arg)); break;
      default: return false;
    }
    return true;
  };

  P._a11yOnKeydown = function(evt) {
    if (this._a11yCfg().shortcutsEnabled === false) return;
    const r = this._a11yActionForKey(evt);
    if (!r) return;
    if (typeof evt.preventDefault === 'function') evt.preventDefault();
    this._a11yDispatchAction(r.action, r.arg);
  };

  P.setupAccessibility = function() {
    const st = this._a11yState();
    const cfg = this._a11yCfg();
    st.focusedMeterKey = cfg.focusedMeterKey;
    document.addEventListener('keydown', (e) => this._a11yOnKeydown(e));

    const api = window.electronAPI;
    for (const action of A11Y_ACTIONS) {
      api?.onMenuAction?.(`menu-a11y-${action}`, (arg) => this._a11yDispatchAction(action, action === 'meter-select' ? arg : undefined));
    }
    try {
      Promise.resolve(api?.getAccessibilitySupport?.())
        .then((v) => { if (v !== undefined) st.screenReader = Boolean(v); })
        .catch(() => {});
      api?.onAccessibilitySupportChanged?.((v) => { st.screenReader = Boolean(v); });
    } catch (_) { /* bridge unavailable */ }
    if (cfg.toneEnabled) this._a11yToneStart();
  };

  // ─── Screen-reader text for gauges, DFU, de-embed ──────────────────────────

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  P._a11ySpokenDuration = function(ms) {
    const secs = ms / 1000;
    if (secs < 60) return plural(Number(secs.toFixed(1)), 'second');
    return plural(Number((secs / 60).toFixed(1)), 'minute');
  };

  P._a11yUpdateGaugeText = function(key, displayResponse) {
    const record = this.meterRegistry.get(key);
    if (!record || !record.state) return;
    const state = record.state;
    const now = Date.now();
    if (state.a11ySrTextAt && now - state.a11ySrTextAt < 500) return;
    state.a11ySrTextAt = now;

    const sid = this.meterSafeId(key);
    const fsText = this._a11yFormatSpokenPower(this._computeGaugeMax(key));
    const gaugeText = (metric) => `${String(metric).toUpperCase()} ${this._a11yFormatSpokenPower(Number.parseFloat(displayResponse?.[metric]))} of ${fsText} full scale`;
    const windowMs = this.config.meterCards?.[key]?.historyWindowMs || 30000;
    const items = [
      ['gauge-sr-L', 'a11ySrTextL', gaugeText(record.gaugeMetricL || 'avg')],
      ['gauge-sr-R', 'a11ySrTextR', gaugeText(record.gaugeMetricR || 'peak')],
      ['history-sr', 'a11ySrTextH', `History graph, ${plural((state.history || []).length, 'sample')} over ${this._a11ySpokenDuration(windowMs)}`],
    ];
    for (const [suffix, field, text] of items) {
      if (state[field] === text) continue;
      state[field] = text;
      const el = document.getElementById(`meter-${sid}-${suffix}`);
      if (el) el.textContent = text;
    }
  };

  P._a11yOnDfuProgress = function(pct, message) {
    const st = this._a11yState();
    const m = this._a11yDfuMilestone(st.dfuLastPct, pct);
    if (m !== null) this.announce(`Firmware upload ${m} percent`);
    st.dfuLastPct = pct === 0 ? 0 : Math.max(st.dfuLastPct, pct);
  };

  P._a11yOnDfuResult = function(ok, msg) {
    this._a11yState().dfuLastPct = 0;
    if (ok) this.announce('Firmware upload complete');
    else this.announce(`Firmware upload failed: ${msg}`, { assertive: true });
  };

  P._a11yOnFitResult = function(rSquared) {
    const pct = Number((rSquared * 100).toFixed(1));
    const low = rSquared < 0.995;
    this.announce(`De-embed fit complete, quality ${pct} percent${low ? ' low quality' : ''}`, low ? { assertive: true } : undefined);
  };

})();
