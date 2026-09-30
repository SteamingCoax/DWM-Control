# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DWM Control is an Electron desktop app (plain CommonJS, no bundler, no framework, no TypeScript) for the DWM V2 RF power meter. It talks to meters over USB CDC serial using a `key=value` line protocol, flashes firmware via a bundled `dfu-util`, and self-updates from GitHub Releases via `electron-updater`.

## Commands

```bash
npm ci                      # use Node 22 (.nvmrc); no native compile step, serialport ships an N-API prebuild
npm start                   # electron-forge start
npm run dev                 # npx electron .  (plain)
npm run dev:safe            # --safe-mode --disable-gpu --no-sandbox (use if the window is blank/crashes)
DWM_OPEN_DEVTOOLS=1 npm run dev   # open DevTools on launch

npm test                    # node --test "test/**/*.spec.js" (built-in node:test runner)
```

Notes on tests: the suite lives in `test/*.spec.js` and is picked up by the glob, so no registration is needed. `.gitignore` excludes `test-*.js`, so never name a test file that way. Renderer code is tested under plain Node through `test/helpers/renderer-harness.js`, which installs browser-shaped globals and runs `renderer.js` plus every module through `vm` in `index.html` order; `makeControlStub()` gives a `this` for calling `DWMControl.prototype` methods without the constructor. Pure main-process helpers in `lib/` are required directly. `RELEASE_CHECKLIST.md` lists the manual tiers that run against hardware and packaged builds.

Builds (output in `dist/`; mac targets write to `/tmp/dwm-dist`):

```bash
npm run build:mac:unsigned  # local mac build without signing (CSC_IDENTITY_AUTO_DISCOVERY=false)
npm run build:mac | build:win | build:linux | build:all
```

Release (bumps version, commits, tags `vX.Y.Z`, pushes, creates the GitHub release, and triggers `.github/workflows/release.yml`):

```bash
npm run release:publish -- 1.2.3
npm run release:republish -- 1.2.3   # re-run CI on an existing tag
```

Requires a clean tree and an authenticated `gh`. Maintainer details are in `.internal/release-reference.md`.

CI: `.github/workflows/ci.yml` runs on every PR and push to `main` (GitHub-hosted only): syntax check of every renderer/main file, `npm test`, and an unpacked Linux packaging dry run that verifies the `files`/`asarUnpack` config. `release.yml` runs only on `v*` tags and manual dispatch.

## Architecture

### Process split

- `main.js` is the entire main process: window creation, native app menu, all `ipcMain.handle` handlers, serial port ownership, dfu-util spawning, auto-updater, and Site View file/workspace/log I/O.
- `preload.js` exposes `window.electronAPI` via `contextBridge`. It is the only bridge; `nodeIntegration` is off and `contextIsolation` is on. Every IPC channel must be listed here, and event channels must also be added to the allowlists in `onMenuAction` and `removeAllListeners`.
- Renderer is classic `<script>` tags loaded in order from `index.html`. There are no ES modules or imports in the renderer.
- Pure, Electron-free helpers used by `main.js` (the polynomial regression math for De-Embed, dfu-util path resolution) live in `lib/` and are unit-tested directly with `node:test`.

### Renderer: one class, many prototype-extension files

`renderer.js` defines `class DWMControl` (core: tab switching, theme, meter discovery loop, serial connect/disconnect) and instantiates it on `DOMContentLoaded`. Every file in `renderer/modules/` is an IIFE that attaches more methods to `DWMControl.prototype`. Load order in `index.html` matters: dwm-core's browser bundle (`node_modules/dwm-core/dist/dwm-protocol.browser.js`, which defines `window.DWMProtocol`) before `renderer.js`, then the modules, with `site-view-components.js` before `site-view.js`.

Module responsibilities:

- `extensions.js`: auto-updater UI, `loadConfig`/`saveConfig` (persisted in `localStorage` under `dwm-control-config`), output log, native menu wiring.
- `control.js`: per-meter state factory (`createMeterState`) and meter card rendering/layouts.
- `control-api.js`: serial line parsing, request/response correlation, `sendApiCommand`.
- `control-monitor.js`: polling loop, snapshot refresh, watchdog reconnect.
- `control-gauges.js` / `control-history.js`: canvas gauge and history graph drawing.
- `control-events.js`: DOM event handlers for meter and SWR cards.
- `firmware.js`: DFU tab (device refresh, hex selection, upload, Windows driver install).
- `deembed.js`: De-Embed tab.
- `site-view.js` + `site-view-components.js`: SVG schematic editor (Site View tab); components export `window.SiteViewComponents`.

Tabs are toggled by `tabSettings` in the `DWMControl` constructor (the terminal tab is currently off).

### Multi-meter model

The app supports many meters at once. `this.meterRegistry` is a `Map` keyed by a device key from `buildMeterKey`: `usbmodem:<uid>` from the port path on macOS, `usbserial:<sn>` from the tail of a backslash-separated Windows `pnpId` when it is 4+ alphanumeric characters, else `port:<path>`. On Linux the key is therefore the path, which is not stable across re-enumeration; `port.serialNumber` is not consulted. `isMeterPort` in `renderer.js` decides what counts as a DWM V2: the USB product string "DWM V2 ComPort" wherever serialport surfaces it (`manufacturer`, Windows `friendlyName`, or the Linux `pnpId`, where it appears as `DWM_V2_ComPort`), else VID 0483 with one of the PIDs in `DWM_V2_APP_PIDS` (5740 for older firmware, A59C assigned by ST). macOS listings carry no product string, so there the PID is the only signal; a new PID must be added to that list and to the udev rules in `build/linux-postinstall.sh` and `docs/site/linux-install.html`. A 2 s discovery loop calls `scanAndSyncMeters` and auto-connects. Each record carries its own `state` (request ids, pending requests, serial buffer, polling timers, protocol version). The main process owns ports through dwm-core's `SerialManager` (one connection per path) and forwards `serial-data` events tagged with `portPath`; the renderer routes them by looking up the record for that path.

### USB API protocol

Reference docs live in `USB API Versions/USB_API_Reference v2.md` (current) and `v1.md` (legacy). Frames are space-separated `key=value` tokens ending in `\r\n`, for example `proto=2 type=cmd cmd=pwr.snap req=101`. Responses echo `req`, which is how `handleControlSerialLine` resolves the matching promise in `state.pendingRequests`.

- The protocol layer (frame builder, range parser, snapshot decoding) lives in the [dwm-core](https://github.com/SteamingCoax/dwm-core) package, pinned to a commit in `package.json`. The main process requires it; the renderer gets the same code as `window.DWMProtocol` from the package's browser bundle. `test/protocol.spec.js` covers it from the app's side.
- Error frames reject the pending promise with an `Error` whose `code` property carries the `ERR_*` code; the message is the human description from `describeApiError`. Fallback logic must check `error.code`, not the message.
- `sendApiCommand` serializes commands per meter through `state.apiCommandQueue`, applies `globalApiPacingMs` between sends, and on timeout / `ERR_UNKNOWN_CMD` / `ERR_BAD_FRAME` / `ERR_BAD_ENUM` falls back to `proto=1` for that meter and remembers it in `state.protocolVersion`.
- Range values: config `0/1/2` map to multipliers `1x/2x/4x`. Both forms appear on the wire, so always go through the `DWMProtocol` range helpers.

### Firmware upload (DFU)

`get-dfu-devices` and `upload-firmware` in `main.js` spawn `dfu-util`. `getDfuUtilPath` resolves the binary per platform: bundled under `Programs/dfu-util/` for packaged builds (unpacked from asar via `asarUnpack`), with `linux-<arch>/` subfolders that CI downloads at build time (gitignored). In dev on macOS/Linux it falls back to a system `dfu-util` on PATH. Intel HEX files are converted to `.bin` before flashing. Windows needs a WinUSB driver for the DFU device (VID 0483 / PID DF11). The in-app "install driver" action (`install-winusb-driver` in `main.js`) launches `zadig.exe`, which the NSIS installer (`build/installer.nsh`) copies from `build/zadig.exe` into the install directory. `build/install-winusb-driver.ps1` and `build/dwm-dfu-winusb.inf` are a standalone elevated install script that nothing in the app or installer invokes.

### Auto-update

Update checks are skipped only when `NODE_ENV=development` AND the app is not packaged. Release assets come from the `publish` block in `package.json` (GitHub, `SteamingCoax/DWM-Control`). macOS builds must be signed and notarized for the updater to work; CI imports the cert from `MAC_CERT_P12` / `MAC_CERT_PASSWORD` secrets. Windows and Linux are cross-built on a self-hosted Linux runner (Windows via Wine + NSIS).

## Workflow

- Never commit directly to `main`. Branch per change (`fix/...`, `feat/...`, `chore/...`, `ci/...`), open a PR with `gh pr create`, squash-merge.
- Commit messages use `type(scope): summary` (`fix:`, `feat:`, `refactor:`, `docs:`, `ci:`, `chore:`). Release notes are generated from them.
- Test tiers: `npm test` for pure logic; `npm run dev` against a real meter for UI and serial; `npm run build:mac:unsigned` and run the `.app` from `/tmp/dwm-dist` before merging anything that touches packaging, native modules, or DFU.
- Releases are deliberate: `npm run release:publish -- X.Y.Z` from a clean `main`. Ship a pre-release first (`X.Y.Z-beta.N`), install it, verify it updates to the next beta, then publish the final. electron-updater decides by the version string: apps on a pre-release version accept pre-release updates, apps on a stable version skip any version with a pre-release suffix. Tags with a hyphen are additionally created as GitHub pre-releases so they never become the repo's "Latest" release. There is no rollback, so a bad stable release is fixed by publishing a higher version.
- The self-hosted Linux runner only builds Windows and Linux release artifacts and must never be targeted by a workflow that runs on `pull_request`, because a workflow triggered by a fork's pull request would execute that contributor's code on the build machine (`ci.yml` is GitHub-hosted only). Operational details for it live outside the repo in `CLAUDE.local.md`.

## Things to know before editing

- `package.json` `build.files` excludes `test-*.js`, `build/`, `dist/`, `.env*`, `*.bat`, `setup-*.sh`. Anything new that must ship in the app has to not match those patterns.
- `serialport` is never compiled locally or in CI: `build.npmRebuild` is `false` and the module's N-API prebuild works on any Electron. If a native rebuild is ever needed, `npm run rebuild` exists, but the node-gyp 9 that `electron-rebuild` pulls in needs Python < 3.12.
- Electron 42's npm package has no install script. The binary downloads lazily on the first `npx electron` run (or `npx install-electron`), and the package requires Node >= 22.12 (`engines` in `package.json`). On Node 26 that download's unzip step exits silently after one file, leaving `node_modules/electron/dist` half-extracted, so use Node 22. Both workflows read the Node version from `.nvmrc`.
- `Programs/` is in `build.files` and `dfu-util` is `asarUnpack`ed on every platform. The `mac` and `win` blocks also copy `Programs/` as `extraResources`; the `linux` block does not, so on Linux the binary exists only under `app.asar.unpacked`, which is where `getDfuUtilPath` looks first. If you add a binary, update both `getDfuUtilPath` and the packaging config.
- `deb.afterInstall` / `deb.afterRemove` in `package.json` point at `build/linux-postinstall.sh` and `build/linux-postremove.sh`, and electron-builder uses them **instead of** its default after-install/after-remove templates (it does not append). Those scripts therefore carry the default steps too: the `/usr/bin/dwm-control` launcher link (via `update-alternatives`), `chrome-sandbox` permissions, desktop/mime database refresh, and then the DWM udev rules. electron-builder substitutes `${executable}` and `${sanitizedProductName}` in them and errors on any other `${name}`, so shell variables in those scripts must be written without braces. `ci.yml` builds the deb and checks the generated `postinst`/`postrm`.
- User settings live in renderer `localStorage` (`dwm-control-config`, `dwm-siteview-*`), while Site View workspaces, recent files, and stream logs are written by the main process under the app's userData directory.
- `PROJECT_CHECKLIST.md` tracks feature status and open hardware-validation items; `AUTO_UPDATE_GUIDE.md` and `build/CODE_SIGNING_GUIDE.md` cover updater and signing setup.
