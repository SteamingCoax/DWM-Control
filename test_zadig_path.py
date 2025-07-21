#!/usr/bin/env python3
"""
Test script to verify Zadig path resolution and UAC elevation
"""

import os
import sys
import platform

# Add the current directory to path so we can import our module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from windows_driver_manager import get_zadig_path

def test_zadig_path():
    """Test that Zadig path is resolved correctly"""
    print("Testing Zadig path resolution...")
    
    zadig_path = get_zadig_path()
    print(f"Resolved Zadig path: {zadig_path}")
    
    # Check if file exists
    if os.path.exists(zadig_path):
        print("✅ Zadig executable found!")
        print(f"   File size: {os.path.getsize(zadig_path)} bytes")
    else:
        print("❌ Zadig executable NOT found!")
        print("   This will trigger the web fallback method")
    
    # Show path components
    print(f"   Directory: {os.path.dirname(zadig_path)}")
    print(f"   Filename: {os.path.basename(zadig_path)}")
    
    return os.path.exists(zadig_path)

if __name__ == "__main__":
    print(f"Platform: {platform.system()}")
    print(f"Python executable: {sys.executable}")
    print(f"Script directory: {os.path.dirname(os.path.abspath(__file__))}")
    print()
    
    test_zadig_path()
