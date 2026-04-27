# DWM Control Project Checklist

## Overall Application
- [ ] Add back in the app icon next to the App title
- [ ] Put in a professional looking icon for the light/dark mode button.
- [ ] Put the Control Tab first and the Firmware Upload tab second


## Control Tab (USB API)
- [x] Enable Control tab in app configuration
- [x] Render new Control tab UI structure
- [x] Add framed USB API command builder (`proto=1 type=cmd ...`) 
- [x] Add serial frame parser for `type=resp` / `type=err`
- [x] Add req/id request correlation with timeout handling
- [x] Implement `system.identity` read flow
- [x] Implement `system.name.get` read flow
- [x] Implement `system.name.set` write flow
- [x] Implement `system.commands` read flow
- [x] Implement `power.info` read flow
- [x] Implement `power.get` metric probe flow
- [x] Implement `power.snapshot` one-shot read flow
- [x] Implement 500ms polling (start/stop by button)
- [x] Stop polling automatically when serial disconnects
- [x] Add Control tab styles for status/cards/chips/snapshot section
- [x] Resolve renderer/style compile errors after integration
- [x] Make gauges and history graph follow the darkmode/lightmode setting for good contrast
- [x] Add into the gauges, a finer subset of scale ticks that do not have numerical labels (every 2.5% of FS)
- [x] Add in the ability to chose the power types for the history graph (up to 4).
- [x] Add multiple meter card layout configurations (single gauge, dual gauge, different positioning schemes of gauges and dropdowns)
- [ ] Ensure that no code files are getting to large and see if they should be subdivided.
- [ ] Design a meter card for using the data from two meter cards for returnloss/SWR metering and graphing. The meters cards used for forward power and reflected power are to be selectable.

## Hardware Validation
- [ ] Connect to real DWM device over serial
- [ ] Verify `Refresh All` populates identity, name, commands, power info, snapshot
- [ ] Verify `system.name.set` persists and round-trips correctly
- [ ] Verify metric probe values (`instantaneous`, `average`, `peak`, etc.)
- [ ] Verify snapshot voltages (`power_voltage`, `supply_voltage`) and units
- [ ] Verify monitor poll stability at 500ms for at least 2 minutes
- [ ] Verify parser behavior with mixed terminal output + API frames
- [ ] Capture one successful and one error frame in logs for regression reference

## Runtime / Environment
- [ ] Confirm Node runtime is healthy (`node -v`, `npm -v`)
- [ ] Run app successfully (`npm run start`)
- [ ] Smoke test tab switching and serial connect/disconnect behavior

## Nice-To-Have (Next)
- [ ] Add per-command latency display in Control tab
- [ ] Add explicit timeout/retry control in UI
- [ ] Add exportable device diagnostics snapshot
- [ ] Add small integration test harness for frame parsing
