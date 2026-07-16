// Control tab methods — canvas gauge drawing
(function attachControlModuleGauges() {
    if (typeof DWMControl === 'undefined') {
        console.error('DWMControl not defined before control module loaded');
        return;
    }
    DWMControl.prototype._parseRangeMultiplier = function(rangeStr) {
        return window.DWMProtocol.parseRangeMultiplier(rangeStr);
    };

    DWMControl.prototype._normalizeRange = function(rangeValue) {
        return window.DWMProtocol.normalizeRange(rangeValue);
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

    DWMControl.prototype._getCachedCanvasSize = function(canvas, fallbackHeight, minHeight = 140) {
        if (!canvas) return null;

        const dpr = window.devicePixelRatio || 1;
        let cssW = Number.parseFloat(canvas.dataset.cssWidth || '0');
        if (!Number.isFinite(cssW) || cssW <= 0) {
            cssW = canvas.clientWidth || 0;
            if (!cssW) return null;
            canvas.dataset.cssWidth = String(cssW);
        }

        let cssH = Number.parseFloat(canvas.dataset.cssHeight || '0');
        if (!Number.isFinite(cssH) || cssH <= 0) {
            cssH = Math.max(minHeight, canvas.clientHeight || fallbackHeight);
            canvas.dataset.cssHeight = String(cssH);
        }

        return { cssW, cssH, dpr };
    };

    DWMControl.prototype._updateMeterGauges = function(key, response) {
        const record   = this.meterRegistry.get(key);
        if (!record || !record.state) return;

        // Avoid expensive canvas animation when the app is backgrounded.
        if (document.hidden) return;

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

        // If an animation loop is already running, only update targets above.
        // This avoids restarting RAF every poll and reduces CPU overhead.
        if (!anim.rafId) {
            anim.rafId = window.requestAnimationFrame(drawFrame);
        }
    };
    // ─── Semicircular RF Wattmeter Gauge ─────────────────────────────────────

    DWMControl.prototype._drawSemiRadialGauge = function(canvas, pct, valStr, metricLabel, scaleMax) {
        if (!canvas) return;

        const BOT_PAD = 6;

        // Derive canvas width first, then scale all layout constants proportionally.
        // Reference width: 420 px (the size at which the original constants were designed).
        const sizeProbe = this._getCachedCanvasSize(canvas, 300, 140);
        if (!sizeProbe) return;
        const cssW = sizeProbe.cssW;
        const sc   = Math.max(0.5, cssW / 420);

        // Target readout typography close to pre-compact sizing.
        const refStr = (this.formatPowerWithClip && Number.isFinite(scaleMax))
            ? this.formatPowerWithClip(scaleMax, scaleMax) : '';
        const refLen = Math.max(refStr.length, 6);
        const valFSMaxWTarget = Math.floor((cssW - 20) / refLen * 1.1);
        const metricFSTarget = Math.max(11, Math.round(34 * sc));
        const valFSTarget = Math.max(Math.round(14 * sc), Math.min(Math.round(64 * sc), valFSMaxWTarget));
        const digPadY = Math.max(5, Math.round(7 * sc));
        const digGapY = Math.max(3, Math.round(4 * sc));

        const TRACK_W  = Math.max(6,  Math.round(14  * sc));
        const PAD_SIDE = Math.round(cssW * 0.200);   // keeps tick labels clear; ≈ 84 px at 420 px
        const PAD_TOP  = Math.max(14, Math.round(52  * sc));
        const DIG_H    = Math.max(24, metricFSTarget + valFSTarget + digPadY * 2 + digGapY);

        const radius = Math.max(20, Math.floor((cssW - PAD_SIDE * 2) / 2));
        const cx     = cssW / 2;
        const cy     = PAD_TOP + TRACK_W / 2 + radius;
        const fallbackCssH = cy + 14 + DIG_H + BOT_PAD;
        // Pin meter gauge canvas CSS height to the content-fit target so the
        // element doesn't stay taller than the gauge/readout drawing.
        canvas.dataset.cssHeight = String(Math.max(140, Math.round(fallbackCssH)));
        const size = this._getCachedCanvasSize(canvas, fallbackCssH, 140);
        if (!size) return;
        const cssH   = size.cssH;
        const dpr    = size.dpr;

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
        const fineTick5  = Math.max(4, Math.round(10 * sc));
        const fineTick25 = Math.max(3, Math.round(6  * sc));
        for (let j = 1; j < 40; j++) {
            if (j % 4 === 0) continue; // 10% positions are drawn with labels below
            const p     = j / 40;
            const angle = aAt(p);
            const cosA  = Math.cos(angle);
            const sinA  = Math.sin(angle);
            const r1    = outerEdge + 2;
            const r2    = outerEdge + (j % 2 === 0 ? fineTick5 : fineTick25);
            ctx.beginPath();
            ctx.moveTo(cx + cosA * r1, cy + sinA * r1);
            ctx.lineTo(cx + cosA * r2, cy + sinA * r2);
            ctx.strokeStyle = pal.tickFine;
            ctx.lineWidth   = 1.2;
            ctx.lineCap     = 'round';
            ctx.stroke();
        }

        const majTickLen    = Math.max(10, Math.round(19 * sc));
        const minTickLen    = Math.max(7,  Math.round(12 * sc));
        const tickLabelGap  = Math.max(3,  Math.round(5  * sc));
        for (let i = 0; i <= 10; i++) {
            const p     = i / 10;
            const angle = aAt(p);
            const cosA  = Math.cos(angle);
            const sinA  = Math.sin(angle);
            const isMaj = (i % 5 === 0);
            const tLen  = isMaj ? majTickLen : minTickLen;
            const r1    = outerEdge + 2;
            const r2    = outerEdge + tLen;

            ctx.beginPath();
            ctx.moveTo(cx + cosA * r1, cy + sinA * r1);
            ctx.lineTo(cx + cosA * r2, cy + sinA * r2);
            ctx.strokeStyle = isMaj ? pal.tickMaj : pal.tickMin;
            ctx.lineWidth   = isMaj ? Math.max(1.5, 2.5 * sc) : Math.max(1, 1.5 * sc);
            ctx.lineCap     = 'round';
            ctx.stroke();

            const lx     = cx + cosA * (r2 + tickLabelGap);
            const ly     = cy + sinA * (r2 + tickLabelGap);
            const fSize  = isMaj ? Math.max(9, Math.round(22 * sc)) : Math.max(7, Math.round(17 * sc));
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
        ctx.lineWidth   = Math.max(1.5, 2.5 * sc);
        ctx.lineCap     = 'round';
        ctx.stroke();
        ctx.shadowBlur  = 0;

        // ── Pivot bearing
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(4,   Math.round(9   * sc)), 0, Math.PI * 2); ctx.fillStyle = pal.pivotOuter; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(2.5, 5.5 * sc),              0, Math.PI * 2); ctx.fillStyle = pal.pivotMid;   ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(1,   2   * sc),              0, Math.PI * 2); ctx.fillStyle = pal.pivotInner; ctx.fill();

        // ── Digital readout strip below pivot
        const digTop = cy + 14;
        const digAvailH = cssH - digTop - BOT_PAD;
        if (digAvailH > 18) {
            const digH = digAvailH;

            ctx.fillStyle = pal.digBg;
            ctx.beginPath();
            ctx.roundRect(6, digTop, cssW - 12, digH, 5);
            ctx.fill();

            ctx.strokeStyle = pal.digSep;
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(6, digTop); ctx.lineTo(cssW - 6, digTop);
            ctx.stroke();

            const metricFS = Math.max(11, Math.min(metricFSTarget, Math.floor(digH * 0.42)));
            ctx.fillStyle    = pal.zoneColor(pct);
            ctx.font         = `bold ${metricFS}px sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'top';
            const labelTop = digTop + digPadY;
            ctx.fillText(metricLabel, cx, labelTop);
            const labelBot = labelTop + metricFS;

            // Font sized from scale factor only (not current value length) so both gauges
            // in a dual layout always match. Width-capped to the longest possible string.
            const valSpace  = digTop + digH - (labelBot + digGapY + digPadY);
            const valFS     = Math.max(Math.round(14 * sc), Math.min(valFSTarget, Math.floor(valSpace * 0.98)));
            ctx.fillStyle    = pal.readout;
            ctx.font         = `bold ${valFS}px monospace`;
            ctx.textBaseline = 'middle';
            ctx.fillText(valStr, cx, labelBot + digGapY + (valSpace * 0.5));
        }

        ctx.restore();
    };

    DWMControl.prototype._drawLargePowerReadout = function(canvas, pct, valStr, metricLabel) {
        if (!canvas) return;

        const sizeProbe = this._getCachedCanvasSize(canvas, 220, 140);
        if (!sizeProbe) return;
        const cssW = sizeProbe.cssW;
        const fallbackCssH = Math.max(190, Math.floor(cssW * 0.62));
        // Keep numeric mode canvas compact to its intended content height.
        canvas.dataset.cssHeight = String(Math.max(140, Math.round(fallbackCssH)));
        const size = this._getCachedCanvasSize(canvas, fallbackCssH, 140);
        if (!size) return;
        const cssH = size.cssH;
        const dpr  = size.dpr;

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

        const sc = Math.max(0.5, cssW / 420);
        ctx.fillStyle = pal.zoneColor(pct);
        ctx.font = `bold ${Math.max(11, Math.round(36 * sc))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(metricLabel, cssW / 2, Math.round(12 * sc));

        const valueFS = Math.max(Math.round(29 * sc), Math.min(Math.round(109 * sc), Math.floor((cssW - 18) / Math.max(valStr.length, 1) * 1.6)));
        ctx.fillStyle = pal.readout;
        ctx.font = `bold ${valueFS}px monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillText(valStr, cssW / 2, cssH * 0.55);

        ctx.restore();
    };

    /**
     * _drawSwrGauge — semi-radial gauge for SWR/Reflection% values.
     * @param {HTMLCanvasElement} canvas
     * @param {number}   pct          0-1 normalized position
     * @param {string}   valStr       readout string (e.g. "1.85:1" or "12.4%")
     * @param {string}   metricLabel  label shown in digital readout strip
     * @param {Array}    tickDefs     [{p, label, major}] tick descriptors; p is 0-1 normalized position
     */
    DWMControl.prototype._drawSwrGauge = function(canvas, pct, valStr, metricLabel, tickDefs, zoneOpts, overlayMsg) {
        if (!canvas) return;

        const BOT_PAD = 6;

        // Derive canvas width first, then scale all layout constants proportionally.
        // Reference width: 420 px (the size at which the original constants were designed).
        const sizeProbe = this._getCachedCanvasSize(canvas, 300, 140);
        if (!sizeProbe) return;
        const cssW = sizeProbe.cssW;
        const sc   = Math.max(0.5, cssW / 420);

        const TRACK_W  = Math.max(6,  Math.round(14  * sc));
        const PAD_SIDE = Math.round(cssW * 0.265);   // wider than power gauge for SWR tick labels; ≈ 111 px at 420 px
        const PAD_TOP  = Math.max(14, Math.round(52  * sc));
        const DIG_H    = Math.max(26, Math.round(72  * sc));

        const radius = Math.max(20, Math.floor((cssW - PAD_SIDE * 2) / 2));
        const cx     = cssW / 2;
        const cy     = PAD_TOP + TRACK_W / 2 + radius;
        const fallbackCssH = cy + 14 + DIG_H + BOT_PAD;
        const size = this._getCachedCanvasSize(canvas, fallbackCssH, 140);
        if (!size) return;
        const cssH   = size.cssH;
        const dpr    = size.dpr;

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
        // Allow caller to override zone colors/boundaries via zoneOpts
        if (zoneOpts) {
            const dark = document.documentElement.getAttribute('data-theme') !== 'light';
            pal.zones      = dark ? zoneOpts.zonesDark  : zoneOpts.zonesLight;
            pal.zoneLabel  = zoneOpts.zoneLabel(dark);
            pal.zoneColor  = zoneOpts.zoneColor(dark);
        }

        const S_ANG = Math.PI;
        const aAt   = p => S_ANG + Math.min(Math.max(p, 0), 1) * Math.PI;

        ctx.fillStyle = pal.bg;
        ctx.fillRect(0, 0, cssW, cssH);

        // ── Zone arc track
        pal.zones.forEach(z => {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, aAt(z.from), aAt(z.to), false);
            ctx.strokeStyle = z.dim;
            ctx.lineWidth   = TRACK_W;
            ctx.lineCap     = 'butt';
            ctx.stroke();
        });

        // ── Bright fill
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
        const dividers = zoneOpts ? zoneOpts.dividers : [0.60, 0.80];
        dividers.forEach(bp => {
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

        // ── Tick marks + labels
        const outerEdge = radius + TRACK_W / 2;

        // Explicit tick positions — tickDefs: [{p, label, major}]
        for (const td of (tickDefs || [])) {
            const p     = td.p;
            const angle = aAt(p);
            const cosA  = Math.cos(angle);
            const sinA  = Math.sin(angle);
            const isMaj = !!td.major;
            const tLen  = isMaj ? Math.max(10, Math.round(19 * sc)) : Math.max(7, Math.round(12 * sc));
            const r1    = outerEdge + 2;
            const r2    = outerEdge + tLen;

            ctx.beginPath();
            ctx.moveTo(cx + cosA * r1, cy + sinA * r1);
            ctx.lineTo(cx + cosA * r2, cy + sinA * r2);
            ctx.strokeStyle = isMaj ? pal.tickMaj : pal.tickMin;
            ctx.lineWidth   = isMaj ? Math.max(1.5, 2.5 * sc) : Math.max(1, 1.5 * sc);
            ctx.lineCap     = 'round';
            ctx.stroke();

            if (td.label) {
                const tickLabelGap = Math.max(3, Math.round(5 * sc));
                const lx     = cx + cosA * (r2 + tickLabelGap);
                const ly     = cy + sinA * (r2 + tickLabelGap);
                const fSize  = isMaj ? Math.max(9, Math.round(22 * sc)) : Math.max(7, Math.round(17 * sc));
                ctx.fillStyle    = pal.zoneLabel(p);
                ctx.font         = `bold ${fSize}px monospace`;
                ctx.textAlign    = cosA < -0.12 ? 'right' : cosA > 0.12 ? 'left' : 'center';
                ctx.textBaseline = sinA < -0.12 ? 'bottom' : sinA > 0.12 ? 'top' : 'middle';
                ctx.fillText(td.label, lx, ly);
            }
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
        ctx.lineWidth   = Math.max(1.5, 2.5 * sc);
        ctx.lineCap     = 'round';
        ctx.stroke();
        ctx.shadowBlur  = 0;

        // ── Pivot
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(4,   Math.round(9   * sc)), 0, Math.PI * 2); ctx.fillStyle = pal.pivotOuter; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(2.5, 5.5 * sc),              0, Math.PI * 2); ctx.fillStyle = pal.pivotMid;   ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(1,   2   * sc),              0, Math.PI * 2); ctx.fillStyle = pal.pivotInner; ctx.fill();

        // ── Overlay message (e.g. "No FWD Power") — drawn in arc center, hides needle area
        if (overlayMsg) {
            const msgFS = Math.max(14, Math.min(28, Math.floor((cssW - PAD_SIDE * 0.6) / Math.max(overlayMsg.length, 1) * 1.1)));
            ctx.fillStyle    = pal.digBg;
            ctx.fillRect(cx - radius * 0.88, cy - radius * 0.55, radius * 1.76, radius * 0.72);
            ctx.fillStyle    = 'rgba(200,80,80,0.88)';
            ctx.font         = `bold ${msgFS}px sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(overlayMsg, cx, cy - radius * 0.20);
        }

        // ── Digital readout strip
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

            const metricFS = Math.max(11, Math.min(Math.round(34 * sc), Math.floor(digH * 0.35)));
            ctx.fillStyle    = pal.zoneColor(pct);
            ctx.font         = `bold ${metricFS}px sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'top';
            const labelTop = digTop + Math.round(4 * sc);
            ctx.fillText(metricLabel, cx, labelTop);
            const labelBot = labelTop + metricFS;

            // SWR/RL max string ~7 chars (e.g. "10.00:1", "≥ 50 dB"); size from sc only for consistency
            const refLen    = 7;
            const valFSMaxW = Math.floor((cssW - 20) / refLen * 1.1);
            const valSpace  = digTop + digH - labelBot;
            const valFS     = Math.max(Math.round(14 * sc), Math.min(Math.round(64 * sc), valFSMaxW, Math.floor(valSpace * 0.78)));
            ctx.fillStyle    = pal.readout;
            ctx.font         = `bold ${valFS}px monospace`;
            ctx.textBaseline = 'middle';
            ctx.fillText(valStr, cx, labelBot + valSpace * 0.52);
        }

        ctx.restore();
    };

})();
