# Windows DFU Device Detection - Troubleshooting Guide

## 🚨 Problem
DWM Control app not showing DFU devices on Windows, even though they're connected.

## 🔍 Most Common Causes on Windows

### 1. **Device Not in DFU Mode**
- Many devices need to be manually put into DFU mode
- Usually involves holding a button while connecting USB

### 2. **Missing USB Drivers**
- Windows doesn't include DFU drivers by default
- Device appears as "Unknown Device" in Device Manager

### 3. **Wrong USB Cable**
- Charge-only cables won't work (need data cables)
- USB 3.0 ports sometimes cause issues

### 4. **Windows Security/Permissions**
- Antivirus blocking USB access
- Need Administrator privileges for some USB operations

## 🛠️ Step-by-Step Windows Solution

### **Step 1: Run Diagnostics**
```cmd
windows-dfu-diagnostics.bat
```
This will test dfu-util and scan for devices.

### **Step 2: Put Device in DFU Mode**

**For STM32-based devices:**
1. Power off the device
2. Hold the **BOOT0** button (or DFU button)
3. Connect USB cable while holding button
4. Release button after 2-3 seconds
5. Device should appear as DFU device

**For other devices:**
- Check device manual for DFU mode instructions
- Common: Hold button while plugging in USB

### **Step 3: Install DFU Drivers with Zadig**

1. **Run Zadig as Administrator:**
   ```cmd
   Programs\zadig-2.9.exe
   ```

2. **In Zadig:**
   - Select your DFU device from dropdown
   - Choose **WinUSB** or **libusbK** driver
   - Click **"Install Driver"**

3. **Verify in Device Manager:**
   - Open Device Manager (devmgmt.msc)
   - Look under "Universal Serial Bus devices"
   - Should see your device without yellow warning

### **Step 4: Test Again**
- Restart DWM Control app
- Click "Refresh" button in firmware upload tab
- Should now detect DFU devices

## 🔧 Advanced Troubleshooting

### **Manual dfu-util Test**
```cmd
Programs\dfu-util\dfu-util.exe -l
```
This bypasses the app and tests dfu-util directly.

### **Check Windows Event Logs**
1. Open Event Viewer
2. Go to Windows Logs → System
3. Look for USB-related errors

### **Try Different USB Setup**
- Use USB 2.0 port instead of USB 3.0
- Try different USB cable (ensure it's a data cable)
- Try different computer to verify device works

### **Run as Administrator**
- Right-click Command Prompt → "Run as Administrator"
- Run the DWM Control app from admin command prompt

## 📋 Common DFU Device IDs

| Device Type | VID | PID | Notes |
|-------------|-----|-----|-------|
| STM32 DFU | 0483 | DF11 | Most common STM32 devices |
| Generic DFU | Various | Various | Check device documentation |

## ✅ Success Indicators

You'll know it's working when:
1. **Device Manager** shows DFU device without warnings
2. **Command line test** shows devices:
   ```
   Found DFU: [0483:df11] ver=2200, devnum=X, cfg=1, intf=0, path="..."
   ```
3. **DWM Control app** shows devices in dropdown

## 🆘 If Still Not Working

1. **Try on different Windows computer** to verify device is functional
2. **Check device manual** for specific DFU mode instructions
3. **Contact device manufacturer** for Windows driver support
4. **Use USB analyzer tool** to verify device is actually in DFU mode

## 📁 Included Tools

- `windows-dfu-diagnostics.bat` - Complete diagnostic script
- `Programs/zadig-2.9.exe` - USB driver installer
- `Programs/dfu-util/` - Complete dfu-util toolkit

Run the diagnostics script first, then follow the solutions based on what it finds!
