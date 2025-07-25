#!/usr/bin/env python3
"""
macOS Build Script for DWM-Control
Builds the application with PyInstaller, including icon support with fallback.
"""

import os
import sys
import subprocess
import shutil

def check_environment():
    """Check if we're in the correct environment"""
    # Check for different possible virtual environment names
    venv_names = ["dwm_env", "venv", ".venv"]
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
        "build/icon.icns",
        "icon.icns", 
        "build/icon.ico",
        "icon.ico"
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
        "Programs/dfu-util/dfu-util",
        "/usr/local/bin/dfu-util",
        "/opt/homebrew/bin/dfu-util"
    ]
    
    for dfu_path in dfu_paths:
        if os.path.exists(dfu_path):
            print(f"✅ Found dfu-util: {dfu_path}")
            return dfu_path
    
    print("❌ Error: dfu-util binary not found!")
    print("Please ensure dfu-util is available in one of these locations:")
    for path in dfu_paths:
        print(f"  - {path}")
    return None

def sign_application(app_path):
    """Provide instructions for manual code signing"""
    print("🔏 Code signing skipped - manual signing required")
    print("📝 Use the provided script for easy signing:")
    print("   ./clean_and_sign.sh")
    print("")
    print("📝 Or run these commands manually:")
    print(f"   dot_clean '{app_path}'")
    print(f"   xattr -cr '{app_path}'")
    print(f"   find '{app_path}' -name '.DS_Store' -delete")
    print(f"   find '{app_path}' -name '._*' -delete")
    print(f"   codesign --sign 'SteamingCoax' --force --timestamp --options runtime '{app_path}'")
    print("")
    print("💡 First create a self-signed certificate:")
    print("   1. Open Keychain Access")
    print("   2. Certificate Assistant → Create a Certificate")
    print("   3. Name: 'SteamingCoax'")
    print("   4. Identity Type: Self Signed Root")
    print("   5. Certificate Type: Code Signing")
    print("   6. Let me override defaults: Yes")
    print("   7. Set validity period and save to login keychain")
    print("")
    print("✅ Application built successfully - ready for manual signing")
    return True

def build_app():
    """Build the application with PyInstaller"""
    print("🔨 Building DWM-Control for macOS...")
    
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
    
    try:
        # Activate virtual environment and run PyInstaller
        # Use onedir for better macOS compatibility and signing
        cmd = [
            "pyinstaller",
            "--onedir",  # Use onedir for better macOS compatibility
            "--windowed",
            f"--add-binary={dfu_util_path}:.",
            "--hidden-import=PyQt6.QtWidgets",
            "--hidden-import=PyQt6.QtCore",
            "--hidden-import=PyQt6.QtGui",
            "--hidden-import=PyQt6.QtSerialPort",
            "--clean",
            "--noconfirm",
            "--name=DWM-Control"
        ]
        
        # Add icon if found
        if icon_path:
            cmd.append(f"--icon={icon_path}")
        
        # Add the main script
        cmd.append("DWM-Control.py")
        
        print(f"📋 Command: {' '.join(cmd)}")
        
        activate_script = f"{venv_name}/bin/activate"
        full_cmd = f"source {activate_script} && {' '.join(cmd)}"
        
        result = subprocess.run(full_cmd, shell=True, check=True)
        
        if result.returncode == 0:
            print("✅ Build completed successfully!")
            app_path = "dist/DWM-Control.app"
            print(f"📁 Application can be found in: {app_path}")
            
            # Provide signing instructions
            sign_application(app_path)
            
            return True
        else:
            print("❌ Build failed!")
            return False
            
    except subprocess.CalledProcessError as e:
        print(f"❌ Build failed with error: {e}")
        return False

if __name__ == "__main__":
    print("🍎 DWM-Control macOS Build Script")
    print("=" * 40)
    
    success = build_app()
    
    if success:
        print("\n🎉 Build completed successfully!")
        sys.exit(0)
    else:
        print("\n💥 Build failed!")
        sys.exit(1)
