# Release Checklist

Every release, beta or stable, goes through all four tiers. Tiers 1 and 2 run on
every pull request; tiers 3 and 4 are run by hand and their results are pasted into
the release PR or the GitHub release notes. Nothing ships with an unchecked box.

## Tier 1: automated, on every PR (`ci.yml`)

- [ ] `npm test` passes (unit suite under `test/`).
- [ ] Syntax check of every main and renderer file passes.
- [ ] Linux packaging dry run passes: `app.asar` contains the entry files and the
      dwm-core browser bundle, the serialport prebuild and `Programs/dfu-util` are
      asar-unpacked.

## Tier 2: dev mode against real hardware (`npm run dev`)

Run from the VS Code terminal only after `unset ELECTRON_RUN_AS_NODE`, otherwise
Electron starts as plain Node and crashes on `app.getVersion()`.

Two meters attached, ideally one on protocol 1 firmware and one on protocol 2.

- [ ] Both meters are discovered and auto-connect within a few seconds.
- [ ] Polling runs at the configured refresh rate with zero consecutive failures
      on each meter for at least one minute.
- [ ] The protocol-1 meter negotiates `proto=1` via the fallback; the other stays on 2.
- [ ] Identify pauses polling on that meter and polling resumes within 10 s.
- [ ] Unplug one meter: its card shows disconnected, the other keeps polling.
      Plug it back in: it reconnects on the same device key and polling resumes.
- [ ] History view draws and follows live values.
- [ ] Site View: the example workspace loads, a meter card bound to a live meter
      updates, save and reload of a workspace round-trips.
- [ ] Firmware tab: Refresh with no meter in DFU mode reports "No DFU devices found"
      without errors.

## Tier 3: packaged build on this Mac (`npm run build:mac:unsigned`)

Run the `.app` from `/tmp/dwm-dist/mac` (Intel) or `/tmp/dwm-dist/mac-arm64`
(Apple Silicon). Dev mode cannot cover these: the updater is skipped when running
from source, and `getDfuUtilPath` uses the PATH binary instead of the bundled one.

- [ ] App launches, both meters connect, gauges live.
- [ ] Main-process log shows `getDfuUtilPath - Using bundled dfu-util:` with a
      path inside the `.app`, not `/usr/local/bin`.
- [ ] On launch the auto-updater checks GitHub and reports the current version as
      up to date (or offers the newer stable, if one exists).
- [ ] Per-meter "Check Updates" reports the installed firmware and the latest
      release from `SteamingCoax/DWM-V2_Firmware`.
- [ ] Full flash on a test meter: "Enter DFU Mode & Update Firmware", the meter's
      serial port disappears, Refresh lists it as a DFU device with its serial
      number, "Download Latest Firmware" fetches the `.hex`, Upload reaches 100%
      and ends with "Firmware upload successful."
- [ ] Power-cycle the meter by hand (required; it does not restart itself).
      It reconnects on the same device key, "Check Updates" shows the new version
      as up to date, element rating, range and brightness are unchanged.
- [ ] The meter's stored name resets to `DWM_V2` after a flash. Rename it from the
      card header and confirm the name persists across a reconnect.

Reference run, 2026-09-26, v1.3.6 + dwm-core, x64 build: all boxes passed;
flash v2.6.3 -> v2.6.5 wrote 399,536 bytes; dfu-util reported "Error during
download get_status" at the leave request, which the app correctly treats as
success.

## Tier 4: pre-release rehearsal (`npm run release:publish -- X.Y.Z-beta.N`)

The only tier that covers signing, notarization, the Windows installer and WinUSB
step, the three Linux architectures, and the update path itself.

- [ ] `release.yml` finished all three jobs; the release holds the mac DMG and ZIP
      for x64 and arm64, the Windows Setup EXE, Linux AppImage and deb for x64,
      arm64 and armv7l, and every `latest*.yml`.
- [ ] The GitHub release is flagged as a pre-release and is not marked "Latest".
- [ ] Install beta.N on the Mac, Windows and Linux test machines. On each, run the
      Tier 3 boxes that apply (at minimum: launch, connect, bundled dfu-util path,
      one flash on Windows to exercise the WinUSB driver step).
- [ ] Publish beta.N+1 (no code change needed). Every beta install offers it,
      downloads it, and restarts into it.
- [ ] Only then publish the stable X.Y.Z. Confirm a stable-channel install offers it.

There is no rollback. A bad stable release is fixed by publishing a higher version.
