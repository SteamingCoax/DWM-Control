const { spawnSync } = require('child_process');

const shouldSkip =
  process.env.SKIP_ELECTRON_BUILDER_INSTALL_APP_DEPS === '1' ||
  process.env.CI === 'true';

if (shouldSkip) {
  console.log('[postinstall] Skipping electron-builder install-app-deps on CI');
  process.exit(0);
}

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(cmd, ['electron-builder', 'install-app-deps'], {
  stdio: 'inherit',
});

if (result.error) {
  console.error('[postinstall] Failed to run electron-builder install-app-deps:', result.error.message);
  process.exit(1);
}

process.exit(result.status || 0);
