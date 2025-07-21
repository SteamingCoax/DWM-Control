"""
Windows DFU Driver Manager - Simplified Zadig + Web Fallback
Handles DFU driver installation on Windows using local Zadig and web fallback
"""

import os
import sys
import subprocess
import platform
import webbrowser
from PyQt6.QtWidgets import QMessageBox, QProgressDialog
from PyQt6.QtCore import Qt

def get_zadig_path():
    """Get the path to the local Zadig executable"""
    if getattr(sys, 'frozen', False):
        # Running as compiled executable
        base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
        zadig_path = os.path.join(base_path, "Programs", "zadig-2.9.exe")
    else:
        # Running in development mode
        script_dir = os.path.dirname(os.path.abspath(__file__))
        zadig_path = os.path.join(script_dir, "Programs", "zadig-2.9.exe")
    
    return zadig_path

def check_and_install_windows_driver(parent_widget=None):
    """
    Check for and install Windows DFU drivers using Zadig
    
    Args:
        parent_widget: Parent widget for message boxes
        
    Returns:
        tuple: (success: bool, message: str)
    """
    if platform.system().lower() != "windows":
        return False, "Driver installation is only supported on Windows"
    
    zadig_path = get_zadig_path()
    
    # Check if Zadig exists locally
    if os.path.exists(zadig_path):
        return _install_with_local_zadig(zadig_path, parent_widget)
    else:
        return _fallback_to_web_zadig(parent_widget)

def _install_with_local_zadig(zadig_path, parent_widget=None):
    """Install driver using local Zadig executable"""
    try:
        # Show instructions to user
        msg = QMessageBox(parent_widget)
        msg.setIcon(QMessageBox.Icon.Information)
        msg.setWindowTitle("Zadig Driver Installation")
        msg.setText("Zadig will now open with administrator privileges to install the WinUSB driver.")
        msg.setInformativeText(
            "Instructions:\n"
            "1. Click 'Yes' on the UAC prompt to allow Zadig to run as administrator\n"
            "2. Connect your DFU device if not already connected\n"
            "3. In Zadig, select 'Options' → 'List All Devices'\n"
            "4. Find your DFU device in the dropdown\n"
            "5. Select 'WinUSB' as the target driver\n"
            "6. Click 'Install Driver' or 'Replace Driver'\n"
            "7. Wait for installation to complete\n\n"
            "Click OK to launch Zadig with admin privileges..."
        )
        msg.setStandardButtons(QMessageBox.StandardButton.Ok | QMessageBox.StandardButton.Cancel)
        
        if msg.exec() == QMessageBox.StandardButton.Cancel:
            return False, "Installation cancelled by user"
        
        # Launch Zadig with administrator privileges
        try:
            # Method 1: Use 'runas' verb to trigger UAC elevation
            import os
            os.startfile(zadig_path, 'runas')
        except Exception as e:
            # Method 2: Fallback using subprocess with proper path handling
            try:
                # Use the raw path and let PowerShell handle it
                powershell_cmd = f"Start-Process -FilePath '{zadig_path}' -Verb RunAs"
                result = subprocess.run(['powershell', '-Command', powershell_cmd], 
                                      capture_output=True, text=True, shell=True)
                if result.returncode != 0:
                    raise Exception(f"PowerShell failed: {result.stderr}")
            except Exception as e2:
                # Method 3: Last resort - use ctypes to call ShellExecute directly
                try:
                    import ctypes
                    result = ctypes.windll.shell32.ShellExecuteW(None, "runas", zadig_path, None, None, 1)
                    if result <= 32:  # ShellExecute returns > 32 for success
                        raise Exception(f"ShellExecute failed with code {result}")
                except Exception as e3:
                    return False, f"Failed to launch Zadig with administrator privileges. Please run Zadig manually as administrator. Errors: {str(e)}, {str(e2)}, {str(e3)}"
        
        # Ask user if installation was successful
        result_msg = QMessageBox(parent_widget)
        result_msg.setIcon(QMessageBox.Icon.Question)
        result_msg.setWindowTitle("Installation Complete?")
        result_msg.setText("Did the driver installation complete successfully?")
        result_msg.setInformativeText(
            "After installing the driver:\n"
            "• Close Zadig\n"
            "• Reconnect your DFU device\n"
            "• Click 'Yes' if installation was successful"
        )
        result_msg.setStandardButtons(QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        
        if result_msg.exec() == QMessageBox.StandardButton.Yes:
            return True, "Driver installation completed successfully"
        else:
            return False, "Driver installation was not completed or failed"
            
    except OSError as e:
        if e.winerror == 740:  # ERROR_ELEVATION_REQUIRED
            return False, "Administrator privileges required. Please run the application as administrator or manually run Zadig as administrator."
        else:
            return False, f"Failed to launch Zadig: {str(e)}"
    except Exception as e:
        return False, f"Failed to launch Zadig: {str(e)}"

def _fallback_to_web_zadig(parent_widget=None):
    """Fallback to downloading Zadig from web"""
    msg = QMessageBox(parent_widget)
    msg.setIcon(QMessageBox.Icon.Information)
    msg.setWindowTitle("Download Zadig")
    msg.setText("Local Zadig not found. Would you like to download it?")
    msg.setInformativeText(
        "Zadig is required to install the WinUSB driver for DFU devices.\n\n"
        "This will open the official Zadig website where you can:\n"
        "1. Download the latest version\n"
        "2. Run it to install the WinUSB driver\n"
        "3. Return to this application\n\n"
        "Click Yes to open the download page..."
    )
    msg.setStandardButtons(QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
    
    if msg.exec() == QMessageBox.StandardButton.Yes:
        try:
            webbrowser.open("https://zadig.akeo.ie/")
            
            # Show follow-up instructions
            follow_up = QMessageBox(parent_widget)
            follow_up.setIcon(QMessageBox.Icon.Information)
            follow_up.setWindowTitle("Driver Installation Instructions")
            follow_up.setText("Zadig website opened in your browser.")
            follow_up.setInformativeText(
                "To install the DFU driver:\n\n"
                "1. Download Zadig from the website\n"
                "2. Run the downloaded Zadig executable\n"
                "3. Connect your DFU device\n"
                "4. In Zadig: Options → List All Devices\n"
                "5. Select your DFU device from dropdown\n"
                "6. Choose 'WinUSB' as target driver\n"
                "7. Click 'Install Driver'\n"
                "8. Return here and refresh devices\n\n"
                "Click OK when you've completed the installation..."
            )
            follow_up.exec()
            
            return True, "Driver installation instructions provided"
            
        except Exception as e:
            return False, f"Failed to open browser: {str(e)}"
    else:
        return False, "Driver installation cancelled by user"
