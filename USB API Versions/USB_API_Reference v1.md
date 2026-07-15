# USB API Reference (v1)

This document is the host-facing quick reference for the current USB CDC command API.

---

## Transport And Framing

- Transport: USB CDC (virtual COM port)
- Frame format: space-separated `key=value` tokens
- Frame terminator: `\r\n` (CR LF)
- Keys must be lowercase and are case-sensitive
- Maximum frame length: 384 bytes (including the `\r\n`)
- Receive line buffer: 512 bytes. Frames that arrive split across USB FS packets (max 64 bytes each) are reassembled automatically. If a partial frame exceeds 512 bytes without a `\n` terminator it is silently discarded.

---

## Envelope

**Request frame**
```
proto=1 type=cmd cmd=<command> [req=<id>] [other keys]\r\n
```

**Successful response**
```
proto=1 type=resp status=ok cmd=<command> [req=<id>] <payload keys>\r\n
```

**Error response**
```
proto=1 type=err status=error cmd=<command> [req=<id>] code=<error> msg=<detail>\r\n
```

`req` is an optional correlation id. When provided the device echoes it back unchanged, so the host can match async responses to requests.

---

## Commands

---

### 1. `pwr.get`

Read a single named power metric.

**Required keys:** `met`

**Accepted `met` values:** `inst`, `avg`, `peak`, `max`, `min`, `dev`

**Request**
```
proto=1 type=cmd cmd=pwr.get req=101 met=avg\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=pwr.get req=101 met=avg value=1.234567 elem=1 etype=30ua eval=0.033 range=2x\r\n
```

- `value` — the requested metric as a float, in watts
- `elem` — currently selected shunt element index (integer, 1-8)
- `etype` — calibration type of that element (`30ua` or `100ua`)
- `eval` — calibration (resistance) value of that element in ohms (float)
- `range` — ADC gain range in use (`2x` or `4x`)

**Error example** (unknown metric name)
```
proto=1 type=err status=error cmd=pwr.get req=101 code=ERR_UNKNOWN_METRIC msg=unsupported_metric\r\n
```

---

### 2. `pwr.snap`

Read all six power metrics plus both voltages in a single compact frame. The eight measurement values are delivered as a comma-separated list in the fixed order below under the key `d`, eliminating per-value key overhead.

**Required keys:** none

**Request**
```
proto=1 type=cmd cmd=pwr.snap req=102\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=pwr.snap req=102 d=1.234567,1.180000,2.100000,2.500000,0.900000,0.043210,3299.00,5.0 elem=1 etype=30ua eval=250.000 range=2x\r\n
```

**`d` field — fixed CSV order:**

| Index | Value | Unit | Precision |
|---|---|---|---|
| 0 | inst | W | 6 dp |
| 1 | avg | W | 6 dp |
| 2 | peak | W | 6 dp |
| 3 | max | W | 6 dp |
| 4 | min | W | 6 dp |
| 5 | dev | W | 6 dp |
| 6 | pvolt | mV | 2 dp |
| 7 | svolt | V | 1 dp |

- `elem` — currently selected element number (integer) (1-8)
- `etype` — Output type of that element (`30ua` or `100ua`)
- `eval` — Rating of that element in watts (float) (e.g: 0.1, 250, or 50000)
- `range` — ADC gain range in use (`2x` or `4x`)

---

### 3. `pwr.info`

Read the current power configuration: selected element, its type, rating value, and gain range.

**Required keys:** none

**Request**
```
proto=1 type=cmd cmd=pwr.info req=103\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=pwr.info req=103 elem=1 etype=30ua eval=0.033 range=2x\r\n
```

- `elem` — currently selected element number (integer) (1-8)
- `etype` — Output type of that element (`30ua` or `100ua`)
- `eval` — Rating of that element in watts (float) (e.g: 0.1, 250, or 50000)
- `range` — ADC gain range (`2x` or `4x`)

Use `cfg.get key=avgw` / `cfg.set key=avgw` for averaging window settings.

---

### 4. `sys.id`

Read the immutable hardware UID and user-assigned friendly name. Use this during enumeration to uniquely identify the device.

**Required keys:** none

**Request**
```
proto=1 type=cmd cmd=sys.id req=104\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=sys.id req=104 uid=1A2B3C4D5E6F7A8B9C0D1E2F dname=bench_meter_a\r\n
```

- `uid` — 96-bit MCU unique ID as a 24-character uppercase hex string; never changes
- `dname` — mutable friendly name stored in device configuration

---

### 5. `sys.fw`

Read the firmware version token sourced from `FIRMWARE_VERSION` in the firmware build.

**Required keys:** none

**Request**
```
proto=1 type=cmd cmd=sys.fw req=105\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=sys.fw req=105 fver=FW:_2.6.0_-_COMMS\r\n
```

- `fver` — firmware version string normalized for key/value transport
- Spaces and unsupported token characters are replaced with `_`

---

### 6. `sys.nget`

Read the current device friendly name.

**Required keys:** none

**Request**
```
proto=1 type=cmd cmd=sys.nget req=105\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=sys.nget req=105 dname=bench_meter_a\r\n
```

---

### 7. `sys.nset`

Set the device friendly name. The new name is persisted to device configuration and echoed back in the response.

**Required keys:** `name`

**Request**
```
proto=1 type=cmd cmd=sys.nset req=106 name=lab_supply_monitor\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=sys.nset req=106 dname=lab_supply_monitor\r\n
```

The device echoes the name it actually stored. If the name was rejected (too long, invalid characters) the device returns an error instead of silently truncating:

**Error example**
```
proto=1 type=err status=error cmd=sys.nset req=106 code=ERR_SETTING_REJECTED msg=invalid_name\r\n
```

---

### 8. `sys.cmds`

Return a comma-separated list of all command IDs supported by the running firmware. Use this to detect capability differences across firmware versions without hardcoding a version number.

**Required keys:** none

**Request**
```
proto=1 type=cmd cmd=sys.cmds req=107\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=sys.cmds req=107 cmds=pwr.get,pwr.snap,pwr.info,sys.id,sys.fw,sys.nget,sys.nset,sys.cmds,cfg.get,cfg.elem,cfg.elems,cfg.set,sys.dfu,sys.save,sys.rst\r\n
```
---

### 9. `cfg.get`

Read one device configuration value.

**Required keys:** `key`

**Accepted `key` values:**

| `key` | Type | Description |
|---|---|---|
| `bright` | integer | Display backlight level |
| `elem` | integer | Active shunt element (1–8) |
| `eval` | float | Rating (watts) of the active element, or of `elem` when provided |
| `range` | integer | ADC gain range (`0` = 2×, `1` = 4×) |
| `avgw` | float | Averaging window in seconds |

For `key=eval`, `elem` may be supplied to read a specific element instead of the currently selected one.

**Request**
```
proto=1 type=cmd cmd=cfg.get req=108 key=bright\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=cfg.get req=108 key=bright val=7\r\n
```

**Element rating request**
```
proto=1 type=cmd cmd=cfg.get req=109 key=eval elem=3\r\n
```

**Element rating response**
```
proto=1 type=resp status=ok cmd=cfg.get req=109 key=eval elem=3 val=100.000000\r\n
```

**Error example**
```
proto=1 type=err status=error cmd=cfg.get req=108 code=ERR_BAD_ENUM msg=unknown_setting_key\r\n
```

---

### 10. `cfg.elems`

Read all 8 element definitions in one response.

**Required keys:** none

**Request**
```
proto=1 type=cmd cmd=cfg.elems req=109\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=cfg.elems req=109 e1v=100.000 e1t=30ua e2v=100.000 e2t=30ua e3v=100.000 e3t=30ua e4v=100.000 e4t=30ua e5v=100.000 e5t=30ua e6v=100.000 e6t=30ua e7v=100.000 e7t=30ua e8v=100.000 e8t=30ua\r\n
```

- `e<n>v` - element rating value (float)
- `e<n>t` - element type (`30ua` or `100ua`)

---

### 11. `cfg.elem`

Read one specific element definition.

**Required keys:** `elem`

**Request**
```
proto=1 type=cmd cmd=cfg.elem req=110 elem=3\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=cfg.elem req=110 elem=3 eval=100.000000 etype=30ua\r\n
```

- `elem` - element number (`1` to `8`)
- `eval` - element rating value (float)
- `etype` - element type (`30ua` or `100ua`)

**Error example**
```
proto=1 type=err status=error cmd=cfg.elem req=110 code=ERR_VALUE_RANGE msg=elem_out_of_range\r\n
```

---

### 12. `cfg.set`

Set a device configuration value. Changes are applied immediately and persisted to device configuration.

**Required keys:** `key`, `val`

For `key=eval` and `key=etype`, `elem` is required to select which element to update.

**Accepted `key` values:**

| `key` | Type | Range | Description |
|---|---|---|---|
| `bright` | integer | 0–10 | Display backlight level |
| `elem` | integer | 1–8 | Select active shunt element |
| `eval` | float | any | Set the rating (watts) of a specific element; requires `elem` |
| `etype` | enum | `30ua`, `100ua` | Set the type of a specific element; requires `elem` |
| `range` | integer | 0–1 | ADC gain range (`0` = 2×, `1` = 4×) |
| `avgw` | float | 0.5–10.0 | Averaging window in seconds |

**Request**
```
proto=1 type=cmd cmd=cfg.set req=108 key=bright val=7\r\n
```

**Response** — echoes the key and value that was stored:
```
proto=1 type=resp status=ok cmd=cfg.set req=108 key=bright val=7\r\n
```

**Element type request**
```
proto=1 type=cmd cmd=cfg.set req=109 key=etype elem=3 val=100ua\r\n
```

**Element type response**
```
proto=1 type=resp status=ok cmd=cfg.set req=109 key=etype elem=3 val=100ua\r\n
```

**Element rating request**
```
proto=1 type=cmd cmd=cfg.set req=110 key=eval elem=3 val=250.000000\r\n
```

**Element rating response**
```
proto=1 type=resp status=ok cmd=cfg.set req=110 key=eval elem=3 val=250.000000\r\n
```

**Error examples**
```
proto=1 type=err status=error cmd=cfg.set req=108 code=ERR_BAD_ENUM msg=unknown_setting_key\r\n
proto=1 type=err status=error cmd=cfg.set req=108 code=ERR_VALUE_RANGE msg=bright_out_of_range\r\n
proto=1 type=err status=error cmd=cfg.set req=108 code=ERR_BAD_VALUE msg=avgw_not_a_number\r\n
proto=1 type=err status=error cmd=cfg.set req=109 code=ERR_MISSING_KEY msg=missing_elem\r\n
proto=1 type=err status=error cmd=cfg.set req=109 code=ERR_BAD_ENUM msg=etype_invalid\r\n
proto=1 type=err status=error cmd=cfg.set req=110 code=ERR_BAD_VALUE msg=eval_not_a_number\r\n
```

---

### 13. `sys.dfu`

Put the meter into DFU mode using the same mechanism as `Menu::updater` (set bootloader flag, then MCU reset). No additional confirmation is required.

**Required keys:** none

**Request**
```
proto=1 type=cmd cmd=sys.dfu req=109\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=sys.dfu req=109\r\n
```

After the response is emitted, the device reboots and enters DFU mode.

---

### 14. `sys.save`

Persist the current in-memory configuration to non-volatile storage.

**Required keys:** none

**Request**
```
proto=1 type=cmd cmd=sys.save req=110\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=sys.save req=110\r\n
```

**Error example**
```
proto=1 type=err status=error cmd=sys.save req=110 code=ERR_SETTING_REJECTED msg=save_failed\r\n
```

---

### 15. `sys.rst`

Reboot the meter immediately.

**Required keys:** none

**Request**
```
proto=1 type=cmd cmd=sys.rst req=111\r\n
```

**Response**
```
proto=1 type=resp status=ok cmd=sys.rst req=111\r\n
```

After the response is emitted, the device performs `HAL_NVIC_SystemReset()`.

---

## Error Codes
| `ERR_MISSING_KEY` | A required key was absent from the frame |
| `ERR_UNKNOWN_CMD` | `cmd` value is not a recognized command |
| `ERR_UNKNOWN_METRIC` | `met` value is not a recognized metric name |
| `ERR_BAD_ENUM` | A key had an unsupported value (e.g. `proto=2`) |
| `ERR_BAD_VALUE` | A value could not be parsed (e.g. non-numeric where float expected) |
| `ERR_VALUE_RANGE` | A numeric value was out of the accepted range |
| `ERR_SETTING_REJECTED` | The firmware rejected the setting (name too long, invalid chars, etc.) |
| `ERR_BUSY` | Device is temporarily unable to service the command |
| `ERR_INTERNAL` | Internal firmware error (e.g. response would exceed 384 bytes) |

---

## Device Identity Strategy

Use both of these values together to track devices on the host:

- `uid` — immutable 96-bit hardware UID; never changes even after firmware updates
- `dname` — user-friendly mutable label stored in device config

**Host recommendations:**
- Use `uid` as the primary map/database key
- Display `dname` as the human label
- If two devices share the same name, append a short UID suffix in the UI

Example display labels:
```
DWM_V2  (1A2B3C4D)
DWM_V2  (7F9E1A20)   ← collision resolved with UID suffix
```

---

## Multi-Device Enumeration Best Practice

On host startup:
1. Enumerate all matching USB CDC devices.
2. Send `sys.id` to each one.
3. Build an in-memory map keyed by `uid`.
4. Persist user preferences by `uid`, not by COM port path or OS-assigned name.

This remains stable when:
- Two meters have the same friendly name
- USB port ordering changes between reboots
- The operating system reassigns serial port paths (`/dev/ttyACM1` → `ttyACM0`, etc.)
