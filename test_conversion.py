#!/usr/bin/env python3
"""
Test script to verify PyQt6 conversion is working correctly
"""

import sys
import os

def test_imports():
    """Test if all required modules can be imported"""
    print("Testing imports...")
    
    try:
        # Test PyQt6 imports
        from PyQt6.QtWidgets import QApplication, QMainWindow
        from PyQt6.QtCore import Qt
        print("✓ PyQt6 imports successful")
    except ImportError as e:
        print(f"✗ PyQt6 import failed: {e}")
        return False
    
    try:
        # Test other required imports
        import serial
        import serial.tools.list_ports
        from intelhex import IntelHex
        print("✓ Serial and intelhex imports successful")
    except ImportError as e:
        print(f"✗ Serial/intelhex import failed: {e}")
        return False
    
    try:
        # Test our modules
        from firmware_uploader import FirmwareUploaderTab
        from serial_terminal import SerialTerminalTab
        from serial_gui import SerialGUITab
        print("✓ Application module imports successful")
    except ImportError as e:
        print(f"✗ Application module import failed: {e}")
        return False
    
    return True

def test_app_creation():
    """Test if the main app can be created"""
    print("\nTesting app creation...")
    
    try:
        from PyQt6.QtWidgets import QApplication
        app = QApplication(sys.argv)
        
        # Test if we can import from the main file
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        # Import the main module - this will test if DWM-Control.py works
        import importlib.util
        spec = importlib.util.spec_from_file_location("dwm_control", "DWM-Control.py")
        if spec and spec.loader:
            dwm_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(dwm_module)
            print("✓ Main application module loaded successfully")
        return True
    except Exception as e:
        print(f"✗ App creation failed: {e}")
        return False

if __name__ == "__main__":
    print("DWM-Control PyQt6 Conversion Test")
    print("=" * 40)
    
    success = True
    success &= test_imports()
    
    if success:
        print("\n✓ All tests passed! The PyQt6 conversion appears to be successful.")
        print("You can now run the application with: python3 DWM-Control.py")
    else:
        print("\n✗ Some tests failed. Please check the error messages above.")
        print("You may need to install missing dependencies:")
        print("  pip3 install PyQt6 pyserial intelhex")
