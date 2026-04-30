// Control tab methods — canvas gauge drawing
(function attachControlModuleGauges() {
    if (typeof DWMControl === 'undefined') {
        console.error('DWMControl not defined before control module loaded');
        return;
    }
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

        const TRACK_W  = 14;
        const PAD_SIDE = 110;   // horizontal inset; keeps tick labels clear of canvas edges
        const PAD_TOP  = 80;
        const DIG_H    = 110;
        const BOT_PAD  = 6;

        const sizeProbe = this._getCachedCanvasSize(canvas, 300, 140);
        if (!sizeProbe) return;
        const cssW   = sizeProbe.cssW;
        const radius = Math.max(30, Math.floor((cssW - PAD_SIDE * 2) / 2));
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
        if (!canvas) return;

        const sizeProbe = this._getCachedCanvasSize(canvas, 220, 140);
        if (!sizeProbe) return;
        const cssW = sizeProbe.cssW;
        const fallbackCssH = Math.max(190, Math.floor(cssW * 0.62));
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

        const TRACK_W  = 14;
        const PAD_SIDE = 140;
        const PAD_TOP  = 80;
        const DIG_H    = 110;
        const BOT_PAD  = 6;

        const sizeProbe = this._getCachedCanvasSize(canvas, 300, 140);
        if (!sizeProbe) return;
        const cssW = sizeProbe.cssW;
        const radius = Math.max(30, Math.floor((cssW - PAD_SIDE * 2) / 2));
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

            if (td.label) {
                const lx     = cx + cosA * (r2 + 5);
                const ly     = cy + sinA * (r2 + 5);
                const fSize  = isMaj ? 30 : 27;
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
        ctx.lineWidth   = 2.5;
        ctx.lineCap     = 'round';
        ctx.stroke();
        ctx.shadowBlur  = 0;

        // ── Pivot
        ctx.beginPath(); ctx.arc(cx, cy, 9,   0, Math.PI * 2); ctx.fillStyle = pal.pivotOuter; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fillStyle = pal.pivotMid;   ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, 2,   0, Math.PI * 2); ctx.fillStyle = pal.pivotInner; ctx.fill();

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

})();
