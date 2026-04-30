const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runTool(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
  };
}

module.exports = async function beforeSignCleanup(context) {
  if (process.platform !== 'darwin') {
    return;
  }

  const appOutDir = context && context.appOutDir ? context.appOutDir : null;
  const packager = context && context.packager ? context.packager : null;
  const appInfo = packager && packager.appInfo ? packager.appInfo : null;
  const productName = appInfo && appInfo.productFilename ? appInfo.productFilename : null;

  if (!appOutDir || !productName) {
    console.warn('[beforeSign] Missing appOutDir/productName; skipping extended-attribute cleanup.');
    return;
  }

  const appBundlePath = path.join(appOutDir, `${productName}.app`);
  if (!fs.existsSync(appBundlePath)) {
    console.warn(`[beforeSign] App bundle not found at ${appBundlePath}; skipping.`);
    return;
  }

  const xattrCmd = fs.existsSync('/usr/bin/xattr') ? '/usr/bin/xattr' : 'xattr';
  const findCmd = fs.existsSync('/usr/bin/find') ? '/usr/bin/find' : 'find';
  const chmodCmd = fs.existsSync('/bin/chmod') ? '/bin/chmod' : 'chmod';

  // Ensure owner-writable so xattr cleanup can modify readonly bundled binaries.
  const writable = runTool(chmodCmd, ['-R', 'u+w', appBundlePath]);
  if (!writable.ok) {
    const reason = writable.error ? writable.error.message : writable.stderr.trim() || `exit code ${writable.status}`;
    console.warn(`[beforeSign] chmod warning: ${reason}`);
  }

  // Remove Finder/resource metadata that breaks codesign.
  let cleaned = runTool(xattrCmd, ['-cr', appBundlePath]);
  if (!cleaned.ok) {
    const reason = cleaned.error ? cleaned.error.message : cleaned.stderr.trim() || `exit code ${cleaned.status}`;
    console.warn(`[beforeSign] xattr -cr failed, trying fallback cleanup: ${reason}`);

    // Fallback: clear attributes entry-by-entry, which can succeed when recursive mode fails.
    cleaned = runTool(findCmd, [appBundlePath, '-exec', xattrCmd, '-c', '{}', '+']);
  }

  if (!cleaned.ok) {
    const reason = cleaned.error ? cleaned.error.message : cleaned.stderr.trim() || `exit code ${cleaned.status}`;
    console.warn(`[beforeSign] Extended-attribute cleanup did not fully complete: ${reason}`);
  }

  // Optional cleanup of AppleDouble sidecar files if present.
  const sidecarCleanup = runTool(findCmd, [appBundlePath, '-name', '._*', '-delete']);
  if (!sidecarCleanup.ok) {
    const reason = sidecarCleanup.error
      ? sidecarCleanup.error.message
      : sidecarCleanup.stderr.trim() || `exit code ${sidecarCleanup.status}`;
    console.warn(`[beforeSign] AppleDouble sidecar cleanup warning: ${reason}`);
  }

  console.log(`[beforeSign] Cleanup complete for ${appBundlePath}`);
};
