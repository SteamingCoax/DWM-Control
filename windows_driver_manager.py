"""
Windows DFU Driver Management Module
Handles automatic driver installation for DFU devices on Windows using libwdi (preferred) or Zadig (fallback)
"""

import os
import sys
import subprocess
import platform
import requests
import zipfile
from pathlib import Path
from PyQt6.QtWidgets import QMessageBox, QDialog, QVBoxLayout, QHBoxLayout, QPushButton, QLabel, QProgressBar
from PyQt6.QtCore import QThread, pyqtSignal, Qt
from PyQt6.QtGui import QPixmap, QFont

# Try to import libwdi wrapper for seamless driver installation
try:
    from libwdi_wrapper import install_dfu_driver_seamlessly, LibWdiWrapper
    LIBWDI_AVAILABLE = True
except ImportError:
    LIBWDI_AVAILABLE = False

class ZadigDownloader(QThread):
    """Downloads Zadig executable if not present"""
    progress = pyqtSignal(int)
    finished = pyqtSignal(bool, str)
    
    def __init__(self, zadig_path):
        super().__init__()
        self.zadig_path = zadig_path
        self.zadig_url = "https://github.com/pbatard/libwdi/releases/download/v1.5.1/zadig-2.9.exe"
    
    def run(self):
        try:
            if os.path.exists(self.zadig_path):
                self.finished.emit(True, "Zadig already available")
                return
                
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(self.zadig_path), exist_ok=True)
            
            # Download Zadig
            response = requests.get(self.zadig_url, stream=True)
            response.raise_for_status()
            
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            with open(self.zadig_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            progress = int((downloaded / total_size) * 100)
                            self.progress.emit(progress)
            
            self.finished.emit(True, f"Zadig downloaded to {self.zadig_path}")
            
        except Exception as e:
            # If download fails, provide fallback message with Zadig website
            fallback_message = (
                f"Failed to download Zadig automatically: {str(e)}\n\n"
                "Please download Zadig manually from the official website:\n"
                "https://zadig.akeo.ie\n\n"
                "After downloading, install the WinUSB driver for your DFU device."
            )
            self.finished.emit(False, fallback_message)

class DriverInstallDialog(QDialog):
    """Dialog to guide user through driver installation"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("DFU Driver Installation Required")
        self.setModal(True)
        self.setFixedSize(500, 400)
        self.setup_ui()
        
    def setup_ui(self):
        layout = QVBoxLayout(self)
        
        # Title
        title = QLabel("🔧 DFU Driver Installation")
        title_font = QFont()
        title_font.setPointSize(16)
        title_font.setBold(True)
        title.setFont(title_font)
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title.setStyleSheet("""
            QLabel {
                color: #ffffff;
                background-color: #0078d4;
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
            }
        """)
        layout.addWidget(title)
        
        # Explanation
        explanation_text = """
<b>Windows DFU Driver Required</b><br><br>
To communicate with DFU devices on Windows, a compatible driver must be installed.<br><br>
<b>What we'll do:</b><br>
"""
        
        if LIBWDI_AVAILABLE:
            explanation_text += """
1. Automatically detect DFU devices that need drivers<br>
2. Install WinUSB drivers seamlessly using libwdi<br>
3. Return to DWM-Control for firmware uploading<br><br>
<i>This is a fully automated, one-time setup process.</i>
            """
        else:
            explanation_text += """
1. Download Zadig (trusted USB driver installer)<br>
2. Launch Zadig to install the WinUSB driver<br>
3. Return to DWM-Control for firmware uploading<br><br>
<i>This is a one-time setup process.</i>
            """
        
        explanation = QLabel(explanation_text)
        explanation.setWordWrap(True)
        explanation.setStyleSheet("""
            QLabel {
                color: #ffffff;
                padding: 15px;
                background-color: #323232;
                border-radius: 6px;
                font-size: 11px;
            }
        """)
        layout.addWidget(explanation)
        
        # Progress bar (initially hidden)
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        self.progress_bar.setStyleSheet("""
            QProgressBar {
                border: 2px solid #3d3d3d;
                border-radius: 6px;
                text-align: center;
                background-color: #2b2b2b;
                color: #ffffff;
                font-weight: bold;
            }
            QProgressBar::chunk {
                background-color: #0078d4;
                border-radius: 4px;
            }
        """)
        layout.addWidget(self.progress_bar)
        
        # Status label
        self.status_label = QLabel("")
        self.status_label.setStyleSheet("color: #cccccc; font-style: italic;")
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.status_label)
        
        # Buttons
        button_layout = QHBoxLayout()
        
        self.install_btn = QPushButton("📥 Install Driver")
        self.install_btn.setMinimumHeight(40)
        install_btn_text = "📥 Install Driver Automatically" if LIBWDI_AVAILABLE else "📥 Install Driver"
        self.install_btn.setText(install_btn_text)
        self.install_btn.setStyleSheet("""
            QPushButton {
                background-color: #28a745;
                color: #ffffff;
                font-weight: bold;
                border-radius: 6px;
                font-size: 12px;
            }
            QPushButton:hover {
                background-color: #218838;
            }
        """)
        
        self.cancel_btn = QPushButton("❌ Cancel")
        self.cancel_btn.setMinimumHeight(40)
        self.cancel_btn.setStyleSheet("""
            QPushButton {
                background-color: #dc3545;
                color: #ffffff;
                font-weight: bold;
                border-radius: 6px;
                font-size: 12px;
            }
            QPushButton:hover {
                background-color: #c82333;
            }
        """)
        
        button_layout.addWidget(self.install_btn)
        button_layout.addWidget(self.cancel_btn)
        layout.addLayout(button_layout)
        
        # Connect signals
        self.install_btn.clicked.connect(self.start_installation)
        self.cancel_btn.clicked.connect(self.reject)
        
    def start_installation(self):
        self.install_btn.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.status_label.setText("Preparing driver installation...")
        
        # Try libwdi first if available, fallback to Zadig
        if LIBWDI_AVAILABLE:
            self._install_with_libwdi()
        else:
            self._install_with_zadig()
    
    def _install_with_libwdi(self):
        """Install drivers using libwdi (seamless)"""
        try:
            self.status_label.setText("Installing drivers automatically...")
            success, message = install_dfu_driver_seamlessly(self)
            
            if success:
                self.status_label.setText("Driver installation completed!")
                QMessageBox.information(
                    self,
                    "Driver Installation Complete",
                    f"{message}\n\nPlease reconnect your DFU device and refresh the device list."
                )
                self.accept()
            else:
                self.status_label.setText("Automatic installation failed, trying Zadig...")
                # Fallback to Zadig if libwdi fails
                self._install_with_zadig()
                
        except Exception as e:
            self.status_label.setText("Automatic installation failed, trying Zadig...")
            # Fallback to Zadig if libwdi fails
            self._install_with_zadig()
    
    def _install_with_zadig(self):
        """Install drivers using Zadig (fallback)"""
        # Start Zadig download/launch process
        from windows_driver_manager import WindowsDriverManager
        self.driver_manager = WindowsDriverManager()
        success, message = self.driver_manager.install_driver()
        
        self.install_btn.setEnabled(True)
        self.progress_bar.setVisible(False)
        
        if success:
            self.status_label.setText("Driver installation completed!")
            QMessageBox.information(
                self,
                "Driver Installation Complete",
                f"{message}\n\nPlease reconnect your DFU device and refresh the device list."
            )
            self.accept()
        else:
            self.status_label.setText("Driver installation failed")
            QMessageBox.warning(
                self,
                "Driver Installation Failed",
                f"{message}\n\nYou may need to install the driver manually."
            )

class WindowsDriverManager:
    """Manages DFU driver installation on Windows"""
    
    def __init__(self):
        self.app_dir = os.path.dirname(os.path.abspath(__file__))
        self.tools_dir = os.path.join(self.app_dir, "Programs")
        self.zadig_path = os.path.join(self.tools_dir, "zadig-2.9.exe")
        
    def is_windows(self):
        """Check if running on Windows"""
        return platform.system().lower() == "windows"
    
    def check_driver_needed(self):
        """
        Check if DFU driver installation is needed
        Returns True if driver is needed, False if already installed
        """
        if not self.is_windows():
            return False
        
        # If libwdi is available, use it to check for devices needing drivers
        if LIBWDI_AVAILABLE:
            try:
                wrapper = LibWdiWrapper()
                dfu_devices = wrapper.find_dfu_devices()
                return len(dfu_devices) > 0
            except Exception:
                pass  # Fall back to dfu-util check
            
        try:
            # Try to list DFU devices - if this works, driver is likely installed
            result = subprocess.run(
                ["dfu-util", "-l"], 
                capture_output=True, 
                text=True, 
                timeout=10
            )
            
            # If dfu-util runs successfully and finds devices, driver is working
            if result.returncode == 0 and "Found DFU" in result.stdout:
                return False
                
            # If dfu-util runs but no devices found, might need driver
            # Check if any USB devices look like they could be DFU devices
            return self._check_for_unrecognized_dfu_devices()
            
        except (subprocess.TimeoutExpired, FileNotFoundError):
            # dfu-util not found or not working
            return True
    
    def _check_for_unrecognized_dfu_devices(self):
        """Check for USB devices that might be DFU devices needing drivers"""
        try:
            # Use PowerShell to check for USB devices with common DFU VID/PIDs
            powershell_cmd = '''
            Get-WmiObject -Class Win32_USBHub | Where-Object { 
                $_.DeviceID -like "*VID_0483*" -or 
                $_.DeviceID -like "*VID_1209*" -or
                $_.DeviceID -like "*VID_16C0*"
            } | Select-Object DeviceID
            '''
            
            result = subprocess.run(
                ["powershell", "-Command", powershell_cmd],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            return "VID_" in result.stdout
            
        except:
            # If we can't check, assume driver might be needed
            return True
    
    def show_driver_install_dialog(self, parent=None):
        """Show driver installation dialog"""
        dialog = DriverInstallDialog(parent)
        return dialog.exec() == QDialog.DialogCode.Accepted
    
    def install_driver(self):
        """Install DFU driver using libwdi (preferred) or Zadig (fallback)"""
        if not self.is_windows():
            return True, "Driver installation not needed on this platform"
            
        try:
            # Try libwdi first if available
            if LIBWDI_AVAILABLE:
                try:
                    success, message = install_dfu_driver_seamlessly()
                    if success:
                        return True, f"Automatic driver installation successful: {message}"
                    else:
                        # If libwdi fails, try Zadig as fallback
                        pass
                except Exception as e:
                    # If libwdi fails, try Zadig as fallback
                    pass
            
            # Fallback to Zadig method
            # Ensure Zadig is available
            if not os.path.exists(self.zadig_path):
                success, message = self._download_zadig()
                if not success:
                    return False, message
            
            # Launch Zadig with appropriate parameters
            return self._launch_zadig()
            
        except Exception as e:
            return False, f"Driver installation failed: {str(e)}"
    
    def _download_zadig(self):
        """Download Zadig executable"""
        try:
            downloader = ZadigDownloader(self.zadig_path)
            
            # Create a simple way to get the result
            result = {'success': False, 'message': ''}
            
            def on_finished(success, message):
                result['success'] = success
                result['message'] = message
            
            downloader.finished.connect(on_finished)
            downloader.run()  # Synchronous for now
            
            return result['success'], result['message']
            
        except Exception as e:
            fallback_message = (
                f"Failed to download Zadig: {str(e)}\n\n"
                "Please download Zadig manually from the official website:\n"
                "https://zadig.akeo.ie\n\n"
                "After downloading, install the WinUSB driver for your DFU device."
            )
            return False, fallback_message
    
    def _launch_zadig(self):
        """Launch Zadig with optimal settings"""
        try:
            # Launch Zadig with parameters to show all devices and prefer WinUSB
            cmd = [
                self.zadig_path,
                "--advanced-mode",  # Show advanced options
                "--list-all"        # List all devices
            ]
            
            # Show instruction message
            msg = QMessageBox()
            msg.setWindowTitle("Zadig Instructions")
            msg.setIcon(QMessageBox.Icon.Information)
            
            if LIBWDI_AVAILABLE:
                instruction_text = """
<b>Zadig Driver Installation (Fallback)</b><br><br>
Automatic driver installation was not available, so we're using Zadig as backup.<br><br>
1. In Zadig, go to <b>Options → List All Devices</b><br>
2. Select your DFU device from the dropdown<br>
3. Ensure <b>WinUSB</b> is selected as the target driver<br>
4. Click <b>Install Driver</b> or <b>Replace Driver</b><br>
5. Wait for installation to complete<br>
6. Close Zadig and return to DWM-Control<br><br>
<i>Click OK to launch Zadig now.</i>
                """
            else:
                instruction_text = """
<b>Zadig Driver Installation</b><br><br>
1. In Zadig, go to <b>Options → List All Devices</b><br>
2. Select your DFU device from the dropdown<br>
3. Ensure <b>WinUSB</b> is selected as the target driver<br>
4. Click <b>Install Driver</b> or <b>Replace Driver</b><br>
5. Wait for installation to complete<br>
6. Close Zadig and return to DWM-Control<br><br>
<i>Click OK to launch Zadig now.</i>
                """
            
            msg.setText(instruction_text)
            msg.setStyleSheet("""
                QMessageBox {
                    background-color: #2b2b2b;
                    color: #ffffff;
                }
                QMessageBox QLabel {
                    color: #ffffff;
                }
            """)
            
            if msg.exec() == QMessageBox.StandardButton.Ok:
                subprocess.Popen(cmd)
                return True, "Zadig launched successfully"
            else:
                return False, "User cancelled driver installation"
                
        except Exception as e:
            return False, f"Failed to launch Zadig: {str(e)}"

# Convenience function for easy integration
def check_and_install_windows_driver(parent=None):
    """
    Check if Windows DFU driver is needed and guide user through installation
    Uses libwdi for seamless installation if available, falls back to Zadig
    Returns: (success: bool, message: str)
    """
    manager = WindowsDriverManager()
    
    if not manager.is_windows():
        return True, "Not running on Windows"
    
    if not manager.check_driver_needed():
        return True, "DFU driver already installed"
    
    # Try automatic installation with libwdi first
    if LIBWDI_AVAILABLE:
        try:
            success, message = install_dfu_driver_seamlessly(parent)
            if success:
                return True, f"Automatic driver installation: {message}"
            # If automatic fails, continue to dialog-based installation
        except Exception as e:
            # If automatic fails, continue to dialog-based installation
            pass
    
    # Show installation dialog (will use libwdi if available, otherwise Zadig)
    if manager.show_driver_install_dialog(parent):
        return manager.install_driver()
    else:
        return False, "User cancelled driver installation"
