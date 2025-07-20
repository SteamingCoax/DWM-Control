# Building libwdi for Python Integration

This document explains how to build libwdi.dll for use with the Python wrapper.

## Prerequisites

1. **Visual Studio 2019 or later** with C++ development tools
2. **Windows SDK** (usually installed with Visual Studio)
3. **Python 3.8+** with ctypes support

## Building libwdi.dll

### Option 1: Using Visual Studio (Recommended)

1. Open `libwdi/libwdi.sln` in Visual Studio
2. Select the `libwdi_dll` project as the startup project
3. Choose the configuration:
   - For 64-bit: Select `x64` platform and `Release` configuration
   - For 32-bit: Select `x86` platform and `Release` configuration
4. Build the solution (Build → Build Solution)
5. The compiled `libwdi.dll` will be in:
   - `libwdi/libwdi/.msvc/x64/Release/dll/libwdi.dll` (64-bit)
   - `libwdi/libwdi/.msvc/Win32/Release/dll/libwdi.dll` (32-bit)

### Option 2: Using MSBuild from Command Line

Open a "Developer Command Prompt" and run:

```batch
cd libwdi
msbuild libwdi.sln /p:Configuration=Release /p:Platform=x64
```

For 32-bit:
```batch
msbuild libwdi.sln /p:Configuration=Release /p:Platform=x86
```

## Installation

1. Copy the built `libwdi.dll` to the `Programs` folder in your project directory
2. Alternatively, place it in the `Programs/libwdi` subdirectory
3. The Python wrapper will automatically find and load the DLL from these locations

## Usage

```python
from libwdi_wrapper import install_dfu_driver_seamlessly

# Install drivers seamlessly
success, message = install_dfu_driver_seamlessly(parent_widget)
if success:
    print("Drivers installed successfully!")
else:
    print(f"Driver installation failed: {message}")
```

## Troubleshooting

### DLL Not Found
- Ensure `libwdi.dll` is in the correct location
- Check that you're using the correct architecture (32-bit vs 64-bit)
- Verify all dependencies are available

### Access Denied
- Run the application as Administrator
- Ensure Windows User Account Control (UAC) allows driver installation

### Driver Installation Fails
- Check Windows Driver Signature Enforcement settings
- Ensure the target device is connected and in DFU mode
- Verify Windows Update hasn't installed conflicting drivers

## Architecture Notes

- Use 64-bit `libwdi.dll` for 64-bit Python
- Use 32-bit `libwdi.dll` for 32-bit Python
- The wrapper automatically detects the platform

## Integration with DWM-Control

The libwdi wrapper replaces the Zadig-based driver installation with a seamless, integrated solution:

1. **Automatic Detection**: Finds DFU devices that need drivers
2. **Silent Installation**: Installs WinUSB drivers without external tools
3. **Progress Feedback**: Shows installation progress to users
4. **Error Handling**: Provides detailed error messages and fallback options

This provides a much better user experience compared to downloading and running Zadig manually.
