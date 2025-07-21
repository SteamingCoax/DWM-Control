#!/usr/bin/env python3
"""
Windows Build Script for DWM-Control
Builds the application with PyInstalle    try:
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
            "--name=DWM-Control"
        ]
        
        # Add icon if found
        if icon_path:
            cmd.append(f"--icon={icon_path}")
        
        # Add the main script
        cmd.append("DWM-Control.py")
        
        print(f"📋 Command: {' '.join(cmd)}")
        
        activate_script = "dwm_env\\Scripts\\activate.bat"
        full_cmd = f"{activate_script} && {' '.join(cmd)}"
        
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
        return Falsesupport with fallback.
"""

import os
import sys
import subprocess
import shutil

def check_environment():
    """Check if we're in the correct environment"""
    if not os.path.exists("dwm_env"):
        print("❌ Error: dwm_env virtual environment not found!")
        print("Please create the virtual environment first.")
        return False
    
    if not os.path.exists("DWM-Control.py"):
        print("❌ Error: DWM-Control.py not found!")
        return False
    
    return True

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

def build_app():
    """Build the application with PyInstaller"""
    print("🔨 Building DWM-Control for Windows...")
    
    # Check environment
    if not check_environment():
        return False
    
    # Find icon
    icon_path = find_icon()
    
    # Find dfu-util
    dfu_util_path = find_dfu_util()
    if not dfu_util_path:
        return False
    
    # Build PyInstaller command
    cmd = [
        "pyinstaller",
        "--onefile",
        "--windowed",
        f"--add-binary={dfu_util_path};.",
        "--hidden-import=intelhex",
        "--hidden-import=serial",
        "--hidden-import=serial.tools.list_ports",
        "--hidden-import=PyQt6",
        "--hidden-import=PyQt6.QtWidgets",
        "--hidden-import=PyQt6.QtCore", 
        "--hidden-import=PyQt6.QtGui",
        "--collect-all=PyQt6",
        "--clean",
        "--name=DWM-Control"
    ]
    
    # Add icon if found
    if icon_path:
        cmd.append(f"--icon={icon_path}")
    
    # Add the main script
    cmd.append("DWM-Control.py")
    
    print(f"📋 Command: {' '.join(cmd)}")
    
    try:
        # Activate virtual environment and run PyInstaller
        activate_script = "dwm_env\\Scripts\\activate.bat"
        full_cmd = f'call "{activate_script}" && {" ".join(cmd)}'
        
        result = subprocess.run(full_cmd, shell=True, check=True)
        
        if result.returncode == 0:
            print("✅ Build completed successfully!")
            print("📁 Application can be found in: dist\\DWM-Control.exe")
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
        print("\\n🎉 Build completed successfully!")
        sys.exit(0)
    else:
        print("\\n💥 Build failed!")
        sys.exit(1)
