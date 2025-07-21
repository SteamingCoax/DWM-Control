#!/usr/bin/env python3
"""
Windows Build Script for DWM-Control
Builds the application with PyInstaller, including icon support with fallback.
"""

import os
import sys
import subprocess
import shutil

def check_environment():
    """Check if we're in the correct environment"""
    # Check for different possible virtual environment names
    venv_names = ["venv", "dwm_env", ".venv"]
    found_venv = None
    
    for venv_name in venv_names:
        if os.path.exists(venv_name):
            found_venv = venv_name
            print(f"✅ Found virtual environment: {venv_name}")
            break
    
    if not found_venv:
        print("❌ Error: No virtual environment found!")
        print(f"Please create a virtual environment with one of these names: {', '.join(venv_names)}")
        return False, None
    
    if not os.path.exists("DWM-Control.py"):
        print("❌ Error: DWM-Control.py not found!")
        return False, None
    
    return True, found_venv
    
def find_icon():
    """Find icon file with fallback"""
    icon_files = [
        "build/icon.ico",
        "icon.ico",
        "build/icon.icns", 
        "icon.icns"
    ]
    
    for icon_path in icon_files:
        if os.path.exists(icon_path):
            print(f"✅ Found icon: {icon_path}")
            return icon_path
    
    print("⚠️  No icon file found, building without icon")
    return None

def find_dfu_util():
    """Find dfu-util binary"""
    dfu_paths = [
        "Programs/dfu-util/dfu-util.exe",
        "dfu-util.exe"
    ]
    
    for dfu_path in dfu_paths:
        if os.path.exists(dfu_path):
            print(f"✅ Found dfu-util: {dfu_path}")
            return dfu_path
    
    print("❌ Error: dfu-util.exe binary not found!")
    print("Please ensure dfu-util.exe is available in one of these locations:")
    for path in dfu_paths:
        print(f"  - {path}")
    return None

def find_zadig():
    """Find zadig executable"""
    zadig_paths = [
        "Programs/zadig-2.9.exe",
        "zadig-2.9.exe"
    ]
    
    for zadig_path in zadig_paths:
        if os.path.exists(zadig_path):
            print(f"✅ Found zadig: {zadig_path}")
            return zadig_path
    
    print("❌ Error: zadig-2.9.exe not found!")
    print("Please ensure zadig-2.9.exe is available in one of these locations:")
    for path in zadig_paths:
        print(f"  - {path}")
    return None

def build_app():
    """Build the application with PyInstaller"""
    print("🔨 Building DWM-Control for Windows...")
    
    # Check environment
    env_check, venv_name = check_environment()
    if not env_check:
        return False
    
    # Find icon
    icon_path = find_icon()
    
    # Find dfu-util
    dfu_util_path = find_dfu_util()
    if not dfu_util_path:
        return False
    
    # Find zadig
    zadig_path = find_zadig()
    if not zadig_path:
        return False
    
    try:
        # Activate virtual environment and run PyInstaller
        # Use the simple command approach with specific PyQt6 modules
        cmd = [
            "pyinstaller",
            "--onefile", 
            "--windowed",
            f"--add-binary={dfu_util_path};.",
            f"--add-binary={zadig_path};.",
            "--hidden-import=PyQt6.QtWidgets",
            "--hidden-import=PyQt6.QtCore",
            "--hidden-import=PyQt6.QtGui",
            "--hidden-import=PyQt6.QtSerialPort",
            "--clean",
            "--noconfirm",
            "--name=DWM-Control",
            "--noconsole"
        ]
        
        # Add icon if found
        if icon_path:
            cmd.append(f"--icon={icon_path}")
        
        # Add the main script
        cmd.append("DWM-Control.py")
        
        print(f"📋 Command: {' '.join(cmd)}")
        
        activate_script = f"{venv_name}\\Scripts\\activate.bat"
        full_cmd = f'call "{activate_script}" && {" ".join(cmd)}'
        
        result = subprocess.run(full_cmd, shell=True, check=True)
        
        if result.returncode == 0:
            print("✅ Build completed successfully!")
            print("📁 Application can be found in: dist/DWM-Control.exe")
            return True
        else:
            print("❌ Build failed!")
            return False
            
    except subprocess.CalledProcessError as e:
        print(f"❌ Build failed with error: {e}")
        return False

if __name__ == "__main__":
    print("🪟 DWM-Control Windows Build Script")
    print("=" * 40)
    
    success = build_app()
    
    if success:
        print("\n🎉 Build completed successfully!")
        sys.exit(0)
    else:
        print("\n💥 Build failed!")
        sys.exit(1)
