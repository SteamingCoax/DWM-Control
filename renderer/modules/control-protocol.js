// Shared helpers for USB API protocol framing and range enum handling.
(function initDwmControlProtocol(root, factory) {
    const api = factory();
    root.DWMControlProtocol = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createDwmControlProtocol() {
    function normalizeProtocolVersion(value, fallback = '2') {
        const version = String(value ?? '').trim();
        if (version === '1' || version === '2') return version;
        return String(fallback) === '1' ? '1' : '2';
    }

    function getAcceptedProtocolVersions(expected = '2', allowLegacyV1 = true) {
        const normalizedExpected = normalizeProtocolVersion(expected, '2');
        const accepted = [normalizedExpected];
        if (allowLegacyV1 && normalizedExpected !== '1') accepted.push('1');
        return accepted;
    }

    function isAcceptedProtocol(proto, expected = '2', allowLegacyV1 = true) {
        const value = String(proto ?? '').trim();
        if (!value) return false;
        return getAcceptedProtocolVersions(expected, allowLegacyV1).includes(value);
    }

    function serializeFrame({ protocolVersion = '2', type = 'cmd', command, requestId, fields = {} }) {
        const tokens = [
            ['proto', normalizeProtocolVersion(protocolVersion, '2')],
            ['type', String(type || 'cmd')],
            ['cmd', String(command || '')],
        ];

        if (requestId !== undefined && requestId !== null && String(requestId) !== '') {
            tokens.push(['req', String(requestId)]);
        }

        Object.entries(fields).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            tokens.push([key, String(value)]);
        });

        return `${tokens.map(([k, v]) => `${k}=${v}`).join(' ')}\r\n`;
    }

    function clampRangeConfig(value, fallback = 1) {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n) && n >= 0 && n <= 2) return n;
        const f = Number.parseInt(fallback, 10);
        if (Number.isFinite(f) && f >= 0 && f <= 2) return f;
        return 1;
    }

    function rangeConfigToMultiplier(configValue) {
        const cfg = clampRangeConfig(configValue, 1);
        if (cfg === 0) return 1;
        if (cfg === 1) return 2;
        return 4;
    }

    function rangeMultiplierToConfig(multiplier, options = {}) {
        const fallback = clampRangeConfig(options.fallback, 1);
        const n = Number.parseFloat(multiplier);
        if (!Number.isFinite(n) || n <= 0) return fallback;
        if (n >= 4) return 2;
        if (n >= 2) return 1;
        return 0;
    }

    function parseRangeConfig(rangeValue, options = {}) {
        const fallback = clampRangeConfig(options.fallback, 1);
        const legacyNumeric = options.legacyNumeric === true;

        if (rangeValue === undefined || rangeValue === null || rangeValue === '') {
            return fallback;
        }

        if (typeof rangeValue === 'number') {
            const n = Number.parseInt(rangeValue, 10);
            if (Number.isFinite(n) && n >= 0 && n <= 2) return n;
            if (legacyNumeric && n === 0) return 1;
            if (legacyNumeric && n === 1) return 2;
            return fallback;
        }

        const raw = String(rangeValue).trim().toLowerCase();
        if (!raw) return fallback;

        if (raw === '1x' || raw === 'x1') return 0;
        if (raw === '2x' || raw === 'x2') return 1;
        if (raw === '4x' || raw === 'x4') return 2;

        if (/^-?\d+$/.test(raw)) {
            const n = Number.parseInt(raw, 10);
            if (legacyNumeric && n === 0) return 1;
            if (legacyNumeric && n === 1) return 2;
            if (n >= 0 && n <= 2) return n;
        }

        return fallback;
    }

    function parseRangeMultiplier(rangeValue, options = {}) {
        const fallbackMultiplier = Number.isFinite(Number.parseFloat(options.fallback))
            ? Number.parseFloat(options.fallback)
            : 2;
        const fallbackConfig = rangeMultiplierToConfig(fallbackMultiplier, { fallback: 1 });
        const cfg = parseRangeConfig(rangeValue, {
            fallback: fallbackConfig,
            legacyNumeric: options.legacyNumeric === true,
        });
        return rangeConfigToMultiplier(cfg);
    }

    function rangeConfigToLabel(configValue) {
        const cfg = clampRangeConfig(configValue, 1);
        if (cfg === 0) return '1x';
        if (cfg === 1) return '2x';
        return '4x';
    }

    function normalizeRangeLabel(rangeValue, options = {}) {
        const cfg = parseRangeConfig(rangeValue, options);
        return rangeConfigToLabel(cfg);
    }

    return {
        normalizeProtocolVersion,
        getAcceptedProtocolVersions,
        isAcceptedProtocol,
        serializeFrame,
        parseRangeConfig,
        parseRangeMultiplier,
        rangeConfigToMultiplier,
        rangeMultiplierToConfig,
        rangeConfigToLabel,
        normalizeRangeLabel,
    };
}));
