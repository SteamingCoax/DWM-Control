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

npm test                    # runs usb-protocol.spec.js; plain node + assert, no runner
```

Notes on tests: `.gitignore` excludes `test-*.js`, so any file named that way will be silently untracked. Use the `*.spec.js` naming for new tests and add them to the `test` script.

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

## Architecture

### Process split

- `main.js` is the entire main process: window creation, native app menu, all `ipcMain.handle` handlers, serial port ownership, dfu-util spawning, auto-updater, Site View file/workspace/log I/O, and the polynomial regression math for De-Embed.
- `preload.js` exposes `window.electronAPI` via `contextBridge`. It is the only bridge; `nodeIntegration` is off and `contextIsolation` is on. Every IPC channel must be listed here, and event channels must also be added to the allowlists in `onMenuAction` and `removeAllListeners`.
- Renderer is classic `<script>` tags loaded in order from `index.html`. There are no ES modules or imports in the renderer.

### Renderer: one class, many prototype-extension files

`renderer.js` defines `class DWMControl` (core: tab switching, theme, meter discovery loop, serial connect/disconnect) and instantiates it on `DOMContentLoaded`. Every file in `renderer/modules/` is an IIFE that attaches more methods to `DWMControl.prototype`. Load order in `index.html` matters: `renderer.js` first, then `protocol.js` before the `control-*.js` files, then `site-view-components.js` before `site-view.js`.

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

The app supports many meters at once. `this.meterRegistry` is a `Map` keyed by a stable device key (`usbmodem:<uid>` on macOS, `usbserial:<sn>` on Windows/Linux, else `port:<path>`). `isMeterPort` in `renderer.js` decides what counts as a DWM V2 (manufacturer string "DWM V2", or VID 0483 / PID 5740). A 2 s discovery loop calls `scanAndSyncMeters` and auto-connects. Each record carries its own `state` (request ids, pending requests, serial buffer, polling timers, protocol version). Main process keeps one `SerialPort` per path in a `Map` and forwards `serial-data` events tagged with `portPath`; the renderer routes them by looking up the record for that path.

### USB API protocol

Reference docs live in `USB API Versions/USB_API_Reference v2.md` (current) and `v1.md` (legacy). Frames are space-separated `key=value` tokens ending in `\r\n`, for example `proto=2 type=cmd cmd=pwr.snap req=101`. Responses echo `req`, which is how `handleControlSerialLine` resolves the matching promise in `state.pendingRequests`.

- `renderer/modules/protocol.js` (`window.DWMProtocol`) is the shared frame builder and range parser. It is the module tested by `usb-protocol.spec.js` and is written UMD-style so it loads in both the browser and `node`.
- `renderer/modules/control-protocol.js` (`DWMControlProtocol`) is a similar helper that is not loaded by `index.html` and not referenced anywhere. Prefer `protocol.js`.
- `sendApiCommand` serializes commands per meter through `state.apiCommandQueue`, applies `globalApiPacingMs` between sends, and on timeout / `ERR_UNKNOWN_CMD` / `ERR_BAD_FRAME` / `ERR_BAD_ENUM` falls back to `proto=1` for that meter and remembers it in `state.protocolVersion`.
- Range values: config `0/1/2` map to multipliers `1x/2x/4x`. Both forms appear on the wire, so always go through the `DWMProtocol` range helpers.

### Firmware upload (DFU)

`get-dfu-devices` and `upload-firmware` in `main.js` spawn `dfu-util`. `getDfuUtilPath` resolves the binary per platform: bundled under `Programs/dfu-util/` for packaged builds (unpacked from asar via `asarUnpack`), with `linux-<arch>/` subfolders that CI downloads at build time (gitignored). In dev on macOS/Linux it falls back to a system `dfu-util` on PATH. Intel HEX files are converted to `.bin` before flashing. Windows needs a WinUSB driver; `build/dwm-dfu-winusb.inf` plus `install-winusb-driver.ps1` handle that, and Zadig is bundled as a fallback.

### Auto-update

Update checks are skipped only when `NODE_ENV=development` AND the app is not packaged. Release assets come from the `publish` block in `package.json` (GitHub, `SteamingCoax/DWM-Control`). macOS builds must be signed and notarized for the updater to work; CI imports the cert from `MAC_CERT_P12` / `MAC_CERT_PASSWORD` secrets. Windows and Linux are cross-built on a self-hosted Linux runner (Windows via Wine + NSIS).

## Workflow

- Never commit directly to `main`. Branch per change (`fix/...`, `feat/...`, `chore/...`, `ci/...`), open a PR with `gh pr create`, squash-merge.
- Commit messages use `type(scope): summary` (`fix:`, `feat:`, `refactor:`, `docs:`, `ci:`, `chore:`). Release notes are generated from them.
- Test tiers: `npm test` for pure logic; `npm run dev` against a real meter for UI and serial; `npm run build:mac:unsigned` and run the `.app` from `/tmp/dwm-dist` before merging anything that touches packaging, native modules, or DFU.
- Releases are deliberate: `npm run release:publish -- X.Y.Z` from a clean `main`. Ship a pre-release first (`X.Y.Z-beta.N`), install it, verify it updates to the next beta, then publish the final. Apps on a pre-release version accept pre-release updates; apps on a stable version ignore them. Caveat: until `release.yml` and `publish-release.sh` pass `--prerelease` for tags containing a hyphen, a beta tag is published as a normal release and reaches every user, so do not publish beta tags before that fix lands. There is no rollback, so a bad stable release is fixed by publishing a higher version.
- The self-hosted Linux runner only builds Windows and Linux release artifacts and must never be targeted by a workflow that runs on `pull_request`. Operational details for it live outside the repo in `CLAUDE.local.md`.

## Things to know before editing

- `package.json` `build.files` excludes `test-*.js`, `build/`, `dist/`, `.env*`, `*.bat`, `setup-*.sh`. Anything new that must ship in the app has to not match those patterns.
- `serialport` is never compiled locally or in CI: `build.npmRebuild` is `false` and the module's N-API prebuild works on any Electron. If a native rebuild is ever needed, `npm run rebuild` exists, but the pinned node-gyp needs Python < 3.12.
- Electron 42's npm package has no install script. The binary downloads lazily on the first `npx electron` run (or `npx install-electron`), and the package requires Node >= 22.12. On Node 26 that download's unzip step exits silently after one file, leaving `node_modules/electron/dist` half-extracted, so use Node 22. CI still installs with Node 20, which works only because electron-builder fetches its own Electron for packaging.
- `Programs/` is copied as `extraResources` and `dfu-util` is `asarUnpack`ed; if you add a binary, update both `getDfuUtilPath` and the packaging config.
- User settings live in renderer `localStorage` (`dwm-control-config`, `dwm-siteview-*`), while Site View workspaces, recent files, and stream logs are written by the main process under the app's userData directory.
- `PROJECT_CHECKLIST.md` tracks feature status and open hardware-validation items; `AUTO_UPDATE_GUIDE.md` and `build/CODE_SIGNING_GUIDE.md` cover updater and signing setup.
