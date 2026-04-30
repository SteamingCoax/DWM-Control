# DWM Control Project Checklist

## Overall Application
- [x] Add back in the app icon next to the App title
- [x] Put in a professional looking icon for the light/dark mode button.
- [x] Put the Control Tab first and the Firmware Upload tab second
- [x] Make app and elements properly resize to fit nearly any display and make zooming in and out propely scale the elements.
- [ ] When closing the main app window, the app should fully quit.


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
- [x] Add in the ability to chose the power types for the history graph.
- [x] Add multiple meter card layout configurations (single gauge, dual gauge, different positioning schemes of gauges and dropdowns)
- [x] Ensure that no code files are getting to large and see if they should be subdivided.
- [x] Design a card for using the data from two meter cards for returnloss/SWR metering and graphing. The meters cards used for forward power and reflected power are to be selectable.
- [x] Make the expandable Global Settings bar arrow button work for the entire vertical range of the window along the bar.
- [ ] Reset Power Statistics (Setup on meter side API first).
- [ ] Add in meter version detection and recommend firmware update.

## Hardware Validation
- [x] Connect to real DWM device over serial
- [x] Verify `Refresh All` populates identity, name, commands, power info, snapshot
- [ ] Verify `system.name.set` persists and round-trips correctly
- [x] Verify metric probe values (`instantaneous`, `average`, `peak`, etc.)
- [x] Verify snapshot voltages (`power_voltage`, `supply_voltage`) and units
- [x] Verify monitor poll stability at 500ms for at least 2 minutes
- [ ] Verify parser behavior with mixed terminal output + API frames
- [ ] Capture one successful and one error frame in logs for regression reference 

## Runtime / Environment
- [ ] Confirm Node runtime is healthy (`node -v`, `npm -v`)
- [ ] Run app successfully (`npm run start`)
- [ ] Smoke test tab switching and serial connect/disconnect behavior

## Nice-To-Have (Next)
- [ ] Add exportable device diagnostics snapshot
