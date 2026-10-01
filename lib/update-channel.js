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

// Mirrors electron-updater's default when channel is null (automatic).
function resolveAllowPrerelease(channel, currentVersion) {
  const c = normalizeUpdateChannel(channel);
  if (c === 'beta') return true;
  if (c === 'stable') return false;
  return isPrereleaseVersion(currentVersion);
}

module.exports = { normalizeUpdateChannel, isPrereleaseVersion, resolveAllowPrerelease };
