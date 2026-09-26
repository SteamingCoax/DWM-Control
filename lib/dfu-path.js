// Pure dfu-util binary path resolution, extracted from main.js's
// getDfuUtilPath(). Behaviour (candidate lists, order, and dev fallbacks)
// is unchanged; only the platform/fs/logging dependencies are now passed
// in instead of read from globals, so this is testable without Electron.

const path = require('path');

// resolveDfuUtilPath({ platform, arch, isDev, basePath, exists, chmod, log })
//
// - platform: process.platform ('win32' | 'darwin' | anything else treated as Linux)
// - arch: process.arch (only used on the Linux branch)
// - isDev: boolean, already computed by the caller
// - basePath: string, already computed by the caller
// - exists: fs.existsSync-like predicate (path) => boolean
// - chmod: fs.chmodSync-like function (path, mode) => void; may throw
// - log: console.log-like function (default: console.log)
//
// Returns the same string getDfuUtilPath() returned for every branch.
function resolveDfuUtilPath({ platform, arch, isDev, basePath, exists, chmod, log = console.log }) {
  if (platform === 'win32') {
    // Try multiple possible paths for Windows
    const possiblePaths = [
      path.join(basePath, 'app.asar.unpacked', 'Programs', 'dfu-util', 'dfu-util.exe'),
      path.join(basePath, 'Programs', 'dfu-util', 'dfu-util.exe'),
      path.join(basePath, 'app', 'Programs', 'dfu-util', 'dfu-util.exe'),
      path.join(basePath, 'resources', 'app.asar.unpacked', 'Programs', 'dfu-util', 'dfu-util.exe'),
      path.join(basePath, 'resources', 'Programs', 'dfu-util', 'dfu-util.exe'),
    ];

    for (const testPath of possiblePaths) {
      log('getDfuUtilPath - Testing Windows path:', testPath);
      if (exists(testPath)) {
        log('getDfuUtilPath - Found dfu-util at:', testPath);
        return testPath;
      }
    }

    // Default to first path for error reporting
    const defaultPath = possiblePaths[0];
    log('getDfuUtilPath - No dfu-util found, using default:', defaultPath);
    return defaultPath;
  } else if (platform === 'darwin') {
    // On macOS, try bundled version first when packaged, then system.
    // asarUnpack files land in app.asar.unpacked/, NOT directly under resourcesPath.
    if (!isDev) {
      const possiblePaths = [
        // Correct location for asarUnpacked files (should always be here when packaged)
        path.join(basePath, 'app.asar.unpacked', 'Programs', 'dfu-util', 'dfu-util'),
        // Legacy fallback — older builds or non-asar packaging
        path.join(basePath, 'Programs', 'dfu-util', 'dfu-util'),
      ];
      for (const testPath of possiblePaths) {
        log('getDfuUtilPath - macOS testing path:', testPath);
        if (exists(testPath)) {
          try {
            chmod(testPath, 0o755);
          } catch (error) {
            log('getDfuUtilPath - chmod failed:', error.message);
          }
          log('getDfuUtilPath - Using bundled dfu-util:', testPath);
          return testPath;
        }
      }
      log('getDfuUtilPath - Bundled dfu-util not found, falling back to system');
    } else {
      log('getDfuUtilPath - Development mode, using system dfu-util');
    }
    // Fallback to system dfu-util (dev mode, or bundled binary missing)
    log('getDfuUtilPath - Using system dfu-util');
    return 'dfu-util';
  } else {
    // For Linux, use an arch-specific bundled binary.
    // process.arch is 'x64', 'arm64', or 'arm' (for armv7l/armhf).
    log('getDfuUtilPath - Linux arch:', arch);
    const possiblePaths = [
      // Correct location for asarUnpacked files
      path.join(basePath, 'app.asar.unpacked', 'Programs', 'dfu-util', `linux-${arch}`, 'dfu-util'),
      // Legacy fallback
      path.join(basePath, 'Programs', 'dfu-util', `linux-${arch}`, 'dfu-util'),
    ];
    for (const testPath of possiblePaths) {
      log('getDfuUtilPath - Linux testing path:', testPath);
      if (exists(testPath)) {
        try {
          chmod(testPath, 0o755);
        } catch (e) {
          log('getDfuUtilPath - chmod failed:', e.message);
        }
        log('getDfuUtilPath - Using bundled dfu-util:', testPath);
        return testPath;
      }
    }
    log('getDfuUtilPath - Bundled dfu-util not found, falling back to system');
    return 'dfu-util';
  }
}

module.exports = { resolveDfuUtilPath };
