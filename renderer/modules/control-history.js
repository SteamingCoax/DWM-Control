// Control tab methods — history tracking and graph
(function attachControlModuleHistory() {
    if (typeof DWMControl === 'undefined') {
        console.error('DWMControl not defined before control module loaded');
        return;
    }
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

    // ─── SWR / Return Loss history ────────────────────────────────────────────

    DWMControl.prototype._pushSwrHistory = function(id, metrics) {
        const rec = this._getSwrRegistry().get(id);
        if (!rec?.state) return;
        const h = rec.state.history;
        const now = Date.now();
        h.push({ t: now, swr: metrics.swr, rl: metrics.rl, gamma: metrics.gamma });
        const windowMs = rec.state.historyWindowMs || 30000;
        const cutoff = now - windowMs * 2;
        while (h.length > 0 && h[0].t < cutoff) h.shift();
        if (h.length > 200000) h.shift();
    };

    DWMControl.prototype._drawSwrHistory = function(id) {
        const rec = this._getSwrRegistry().get(id);
        if (!rec?.state) return;

        const sid  = this.swrSafeId(id);
        const histView = document.getElementById(`swr-${sid}-history-view`);
        if (!histView || histView.style.display === 'none') return;

        const canvas = document.getElementById(`swr-${sid}-history-canvas`);
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

        const FONT_TICK = 'bold 13px monospace';
        const margin = { left: 60, right: 60, top: 48, bottom: 30 };
        const plotX = margin.left;
        const plotY = margin.top;
        const plotW = Math.max(10, cssW - margin.left - margin.right);
        const plotH = Math.max(10, cssH - margin.top - margin.bottom);

        ctx.clearRect(0, 0, cssW, cssH);
        ctx.fillStyle = pal.plotBg;
        ctx.fillRect(0, 0, cssW, cssH);

        const hist        = rec.state.history;
        const windowMs    = rec.state.historyWindowMs || 30000;
        const swrMax      = 10;
        const rlMax       = 40; // dB

        // Left Y-axis: SWR (1 → swrMax)
        const yForSwr = swr => plotY + plotH - ((Math.min(Math.max(swr, 1), swrMax) - 1) / (swrMax - 1)) * plotH;
        // Right Y-axis: RL dB (0 → rlMax), higher = better (top of graph)
        const yForRl  = rl  => plotY + plotH - (Math.min(Math.max(rl, 0), rlMax) / rlMax) * plotH;

        // ── Left Y-axis (SWR)
        ctx.font = FONT_TICK;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const swrTicks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        swrTicks.forEach(v => {
            const y = yForSwr(v);
            ctx.strokeStyle = pal.gridLine;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW, y); ctx.stroke();
            ctx.fillStyle = pal.axisLabel;
            ctx.fillText(`${v}:1`, plotX - 6, y);
        });
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = pal.axisLabelFaint;
        ctx.fillText('SWR', plotX - 6, plotY - 4);

        // ── Right Y-axis (RL dB)
        ctx.font = FONT_TICK;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        [0, 10, 20, 30, 40].forEach(v => {
            const y = yForRl(v);
            ctx.fillStyle = pal.axisLabelFaint;
            ctx.fillText(`${v}dB`, plotX + plotW + 6, y);
        });
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = pal.axisLabelFaint;
        ctx.fillText('RL', plotX + plotW + 6, plotY - 4);

        // ── Plot border
        ctx.strokeStyle = pal.plotBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(plotX, plotY, plotW, plotH);

        // ── X-axis ticks
        const xForAgo = msAgo => plotX + plotW - (msAgo / windowMs) * plotW;
        const CLEAN_INTERVALS_MS = [
            500, 1000, 2000, 5000, 10000, 15000, 30000,
            60000, 120000, 300000, 600000, 900000, 1800000,
            3600000, 7200000, 10800000, 21600000, 43200000, 86400000,
        ];
        const tickIntervalMs = CLEAN_INTERVALS_MS.find(c => c >= windowMs / 6)
            || CLEAN_INTERVALS_MS[CLEAN_INTERVALS_MS.length - 1];
        const formatTimeLabel = msAgo => {
            if (msAgo === 0) return 'now';
            if (msAgo < 60000)   return `-${msAgo / 1000}s`;
            if (msAgo < 3600000) return `-${Math.round(msAgo / 60000)}m`;
            return `-${(msAgo / 3600000).toFixed(1)}h`;
        };
        ctx.font = FONT_TICK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.strokeStyle = pal.gridLineFaint;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(plotX + plotW, plotY); ctx.lineTo(plotX + plotW, plotY + plotH); ctx.stroke();
        ctx.fillStyle = pal.axisLabelFaint;
        ctx.fillText('now', plotX + plotW, plotY + plotH + 5);
        for (let msAgo = tickIntervalMs; msAgo < windowMs; msAgo += tickIntervalMs) {
            const x = xForAgo(msAgo);
            if (x < plotX + 10) continue;
            ctx.strokeStyle = pal.gridLineFaint;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, plotY); ctx.lineTo(x, plotY + plotH); ctx.stroke();
            ctx.fillStyle = pal.axisLabelFaint;
            ctx.fillText(formatTimeLabel(msAgo), x, plotY + plotH + 5);
        }

        if (hist.length < 2) {
            ctx.font = '14px sans-serif';
            ctx.fillStyle = pal.noData;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Waiting for data…', plotX + plotW / 2, plotY + plotH / 2);
            return;
        }

        const tNow         = Date.now();
        const tWindowStart = tNow - windowMs;
        const visiblePts   = [];
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
            ctx.lineCap  = 'round';
            ctx.beginPath();
            visiblePts.forEach((pt, i) => {
                const x = xForAgo(tNow - pt.t);
                const y = getter(pt);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.restore();
        };

        // SWR line (blue) — left axis
        drawLine(pal.histColors.avg, pt => yForSwr(Number.isFinite(pt.swr) ? pt.swr : 1));
        // RL line (orange, dashed) — right axis
        ctx.save();
        ctx.setLineDash([6, 4]);
        drawLine(pal.histColors.peak, pt => yForRl(Number.isFinite(pt.rl) ? pt.rl : 0));
        ctx.restore();

        // ── Legend
        const legendY = plotY - 28;
        const swrColor = pal.histColors.avg;
        const rlColor  = pal.histColors.peak;
        ctx.font = 'bold 13px monospace';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = swrColor;
        ctx.fillRect(plotX, legendY - 5, 20, 10);
        ctx.fillStyle = pal.axisLabel;
        ctx.textAlign = 'left';
        ctx.fillText('SWR', plotX + 26, legendY);
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = rlColor;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(plotX + 80, legendY); ctx.lineTo(plotX + 100, legendY); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = pal.axisLabel;
        ctx.fillText('RL (dB)', plotX + 106, legendY);
    };

})();
