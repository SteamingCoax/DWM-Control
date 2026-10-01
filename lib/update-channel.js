// Pure update-channel helpers (no Electron). The renderer keeps an inline copy of
// normalizeUpdateChannel / the prerelease test in renderer/modules/extensions.js.

function normalizeUpdateChannel(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  return s === 'beta' || s === 'stable' ? s : null;
}

function isPrereleaseVersion(version) {
  if (typeof version !== 'string') return false;
  return /^v?\d+\.\d+\.\d+-[0-9A-Za-z]/.test(version.trim());
}

// Beta updates are opt-in: only an explicit 'beta' channel allows pre-releases.
// null/unset/unknown means stable only, even when the installed version is itself a
// pre-release (overriding electron-updater's own default, which would follow the version).
// currentVersion is accepted for call-site compatibility but no longer changes the result.
// eslint-disable-next-line no-unused-vars
function resolveAllowPrerelease(channel, currentVersion) {
  return normalizeUpdateChannel(channel) === 'beta';
}

module.exports = { normalizeUpdateChannel, isPrereleaseVersion, resolveAllowPrerelease };
