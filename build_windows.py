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

def sign_executable(exe_path):
    """Attempt to sign the executable to reduce antivirus false positives"""
    print("🔏 Attempting to self-sign the executable...")
    
    # Check if signtool is available
    signtool_paths = [
        r"C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe",
        r"C:\Program Files (x86)\Windows Kits\10\bin\x86\signtool.exe",
        r"C:\Program Files\Microsoft SDKs\Windows\v7.1\Bin\signtool.exe",
        "signtool.exe"  # If it's in PATH
    ]
    
    signtool_path = None
    for path in signtool_paths:
        if shutil.which(path) or os.path.exists(path):
            signtool_path = path
            break
    
    if not signtool_path:
        print("⚠️  signtool not found - skipping code signing")
        print("   To enable code signing, install Windows SDK:")
        print("   https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/")
        print("   Or Visual Studio with C++ tools")
        return False
    
    try:
        # Prepare signing command
        sign_cmd = [
            signtool_path,
            "sign",
            "/fd", "SHA256",
            "/t", "http://timestamp.digicert.com",
            exe_path
        ]
        
        # Try to use a certificate store first (if available)
        # Otherwise create a temporary self-signed certificate
        cert_path = "temp_cert.pfx"
        
        # Check if we can create a certificate (requires older SDK tools)
        makecert_path = shutil.which("makecert")
        pvk2pfx_path = shutil.which("pvk2pfx")
        
        if makecert_path and pvk2pfx_path and not os.path.exists(cert_path):
            print("📜 Creating temporary self-signed certificate...")
            
            makecert_cmd = [
                makecert_path,
                "-sv", "temp_key.pvk",
                "-n", "CN=DWM-Control Self-Signed",
                "-b", "01/01/2024",
                "-e", "01/01/2030",
                "-r",
                "temp_cert.cer"
            ]
            
            pvk2pfx_cmd = [
                pvk2pfx_path,
                "-pvk", "temp_key.pvk",
                "-spc", "temp_cert.cer",
                "-pfx", cert_path,
                "-po", "password"
            ]
            
            try:
                # Create certificate with automatic password entry
                result1 = subprocess.run(makecert_cmd, input="\npassword\npassword\n", 
                                       text=True, capture_output=True)
                if result1.returncode == 0:
                    result2 = subprocess.run(pvk2pfx_cmd, capture_output=True)
                    if result2.returncode == 0:
                        print("✅ Created temporary certificate")
                        # Update sign command to use the certificate
                        sign_cmd = [
                            signtool_path,
                            "sign",
                            "/f", cert_path,
                            "/p", "password",
                            "/fd", "SHA256",
                            "/t", "http://timestamp.digicert.com",
                            exe_path
                        ]
                    else:
                        print(f"⚠️  Failed to create PFX, using default signing")
                else:
                    print(f"⚠️  Failed to create certificate, using default signing")
            except Exception as e:
                print(f"⚠️  Certificate creation failed, using default signing: {e}")
        
        # Attempt to sign the executable
        print(f"🔏 Signing: {exe_path}")
        result = subprocess.run(sign_cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅ Successfully signed the executable")
            return True
        else:
            print(f"⚠️  Code signing failed: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"⚠️  Code signing error: {e}")
        return False

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
            exe_path = "dist/DWM-Control.exe"
            print(f"📁 Application can be found in: {exe_path}")
            
            # Attempt to sign the executable
            sign_executable(exe_path)
            
            return True
        else:
            print("❌ Build failed!")
            return False
            
    except subprocess.CalledProcessError as e:
        print(f"❌ Build failed with error: {e}")
        return False

def cleanup_temp_files():
    """Clean up temporary certificate files"""
    temp_files = ["temp_cert.pfx", "temp_cert.cer", "temp_key.pvk"]
    for file in temp_files:
        if os.path.exists(file):
            try:
                os.remove(file)
                print(f"🧹 Cleaned up: {file}")
            except Exception as e:
                print(f"⚠️  Could not remove {file}: {e}")

if __name__ == "__main__":
    print("🪟 DWM-Control Windows Build Script")
    print("=" * 40)
    
    try:
        success = build_app()
        
        if success:
            print("\n🎉 Build completed successfully!")
            sys.exit(0)
        else:
            print("\n💥 Build failed!")
            sys.exit(1)
    finally:
        # Always clean up temporary files
        cleanup_temp_files()
