#!/usr/bin/env python3
"""
Quick test script to verify the DWM-Control application can import and initialize properly.
"""

import sys
import os

# Add the current directory to Python path
sys.path.insert(0, '.')

try:
    print("Testing PyQt6 import...")
    from PyQt6.QtWidgets import QApplication
    from PyQt6.QtCore import Qt
    print("✅ PyQt6 imported successfully")
    
    print("Testing application modules...")
    import serial_gui
    import serial_terminal
    print("✅ Application modules imported successfully")
    
    print("Testing QApplication creation...")
    app = QApplication([])
    print("✅ QApplication created successfully")
    
    print("Testing DWMApp creation...")
    import importlib.util
    spec = importlib.util.spec_from_file_location("dwm_control", "DWM-Control.py")
    dwm_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(dwm_module)
    
    window = dwm_module.DWMApp()
    print("✅ DWMApp created successfully")
    
    print("🎉 All tests passed! The application should work correctly.")
    
except ImportError as e:
    print(f"❌ Import error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
