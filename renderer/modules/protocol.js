// Shared USB API protocol helpers.
(function attachDwmProtocol(globalScope) {
    const PROTOCOL_VERSION = '2';
    const LEGACY_PROTOCOL_VERSION = '1';
    function normalizeToken(value) {
        return String(value ?? '').trim();
    }

    function buildFrame(command, requestId, fields = {}, protocolVersion = PROTOCOL_VERSION) {
        const version = normalizeToken(protocolVersion) || PROTOCOL_VERSION;
        const tokens = [
            ['proto', isSupportedProto(version) ? version : PROTOCOL_VERSION],
            ['type', 'cmd'],
            ['cmd', String(command || '')],
        ];

        if (requestId !== undefined && requestId !== null && String(requestId).length > 0) {
            tokens.push(['req', String(requestId)]);
        }

        Object.entries(fields).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            tokens.push([key, String(value)]);
        });

        return `${tokens.map(([key, value]) => `${key}=${value}`).join(' ')}\r\n`;
    }

    function isSupportedProto(proto) {
        const normalized = normalizeToken(proto);
        return normalized === PROTOCOL_VERSION || normalized === LEGACY_PROTOCOL_VERSION;
    }

    function parseRangeMultiplier(rangeValue) {
        const normalized = normalizeToken(rangeValue).toLowerCase();
        if (normalized === '1x' || normalized === '0') return 1;
        if (normalized === '2x' || normalized === '1') return 2;
        if (normalized === '4x' || normalized === '2') return 4;

        const numeric = Number.parseFloat(normalized);
        if (Number.isFinite(numeric)) {
            if (numeric === 0) return 1;
            if (numeric === 1) return 2;
            if (numeric === 2 || numeric === 4) return 4;
        }

        return 2;
    }

    function parseRangeCfg(rangeCfg) {
        const normalized = normalizeToken(rangeCfg).toLowerCase();
        if (normalized === '') return null;

        if (normalized === '1x' || normalized === '0') return 0;
        if (normalized === '2x' || normalized === '1') return 1;
        if (normalized === '4x' || normalized === '2') return 2;

        const numeric = Number.parseInt(normalized, 10);
        if (numeric === 0 || numeric === 1 || numeric === 2) return numeric;
        return null;
    }

    function cfgToRangeMultiplier(rangeCfg) {
        const normalized = parseRangeCfg(rangeCfg);
        if (normalized === 0) return 1;
        if (normalized === 1) return 2;
        if (normalized === 2) return 4;
        return 2;
    }

    function normalizeRange(rangeValue) {
        const cfg = parseRangeCfg(rangeValue);
        if (cfg === null) return null;
        const multiplier = cfgToRangeMultiplier(cfg);
        return {
            cfg,
            multiplier,
            label: `${multiplier}x`,
        };
    }

    const api = {
        PROTOCOL_VERSION,
        LEGACY_PROTOCOL_VERSION,
        buildFrame,
        isSupportedProto,
        parseRangeMultiplier,
        parseRangeCfg,
        cfgToRangeMultiplier,
        normalizeRange,
    };

    globalScope.DWMProtocol = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);