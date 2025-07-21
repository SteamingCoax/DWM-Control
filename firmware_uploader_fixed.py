from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, QComboBox, 
                           QPushButton, QTextEdit, QProgressBar, QGroupBox, QFileDialog, 
                           QMessageBox)
from PyQt6.QtCore import QThread, pyqtSignal, Qt
from PyQt6.QtGui import QFont
import subprocess
import os
import re
import sys
from intelhex import IntelHex
import tempfile
import platform
from typing import Optional, Dict, Any

# Import Windows driver manager
try:
    # Platform-specific imports - only available on Windows
    WINDOWS_DRIVER_SUPPORT = False
except ImportError:
    # Windows driver support not available
    WINDOWS_DRIVER_SUPPORT = False

class UploadWorker(QThread):
    output_signal = pyqtSignal(str)
    finished_signal = pyqtSignal(bool, str)
    
    def __init__(self, dfu_util_path, bin_file):
        super().__init__()
        self.dfu_util_path = dfu_util_path
        self.bin_file = bin_file
        
    def run(self):
        try:
            cmd = [
                self.dfu_util_path,
                "-a", "0",
                "-i", "0",
                "-D", self.bin_file,
                "-s", "0x08000000:leave",
                "-R"
            ]
            process = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )
            
            # Handle stdout
            if process.stdout:
                for line in process.stdout:
                    self.output_signal.emit(line.strip())
            
            # Handle stderr
            if process.stderr:
                for line in process.stderr:
                    self.output_signal.emit(line.strip())
                    
            process.wait()
            if process.returncode == 0 or process.returncode == 74:
                self.finished_signal.emit(True, "Firmware uploaded successfully!")
            else:
                self.finished_signal.emit(False, f"Upload failed with return code {process.returncode}")
        except FileNotFoundError:
            self.finished_signal.emit(False, "dfu-util binary not found in application bundle")
        except Exception as e:
            self.finished_signal.emit(False, str(e))

class FirmwareUploaderTab(QWidget):
    def __init__(self, parent):
        super().__init__()
        self.parent = parent
        self.hex_file = None
        self.bin_file = None
        self.selected_device = None
        self.max_flash_addr = 0x0807FFFF  # 512 KB limit for STM32G0B0RET
        self.upload_worker = None

        # Determine dfu-util path based on platform
        if getattr(sys, 'frozen', False):
            # Running as a compiled executable
            base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
            if platform.system() == "Windows":
                self.dfu_util_path = os.path.join(base_path, "Programs", "dfu-util", "dfu-util.exe")
            else:
                self.dfu_util_path = os.path.join(base_path, "Programs", "dfu-util", "dfu-util")
        else:
            # Running in development mode
            script_dir = os.path.dirname(os.path.abspath(__file__))
            if platform.system() == "Windows":
                dfu_util_local = os.path.join(script_dir, "Programs", "dfu-util", "dfu-util.exe")
            else:
                dfu_util_local = os.path.join(script_dir, "Programs", "dfu-util", "dfu-util")
            
            # Check if dfu-util exists in Programs folder, otherwise use system PATH
            if os.path.exists(dfu_util_local):
                self.dfu_util_path = dfu_util_local
            else:
                self.dfu_util_path = "dfu-util"  # Fallback to system PATH

        self.create_widgets()

    def create_widgets(self):
        # Set up layout for parent
        layout = QVBoxLayout(self.parent)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(15)

        # Title with icon
        title_label = QLabel("🔧 Firmware Uploader")
        title_font = QFont()
        title_font.setPointSize(16)
        title_font.setBold(True)
        title_label.setFont(title_font)
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("""
            QLabel {
                color: #ffffff;
                background-color: #0078d4;
                padding: 15px;
                border-radius: 10px;
                margin-bottom: 10px;
            }
        """)
        #layout.addWidget(title_label)

        # Device selection group with enhanced styling
        device_group = QGroupBox("📡 DFU Device Selection")
        device_layout = QVBoxLayout(device_group)
        device_layout.setSpacing(10)
        
        # Device info label
        info_label = QLabel("Select your DFU-compatible device from the list below:")
        info_label.setStyleSheet("color: #cccccc; font-style: italic; margin-bottom: 5px;")
        device_layout.addWidget(info_label)
        
        self.device_combo = QComboBox()
        self.device_combo.setMinimumHeight(40)
        self.device_combo.currentIndexChanged.connect(self.on_device_select)
        device_layout.addWidget(self.device_combo)
        
        # Button layout for refresh only
        button_layout = QHBoxLayout()
        
        refresh_btn = QPushButton("🔄 Refresh Devices")
        refresh_btn.setMinimumHeight(40)
        refresh_btn.clicked.connect(self.refresh_devices)
        refresh_btn.setStyleSheet("""
            QPushButton {
                background-color: #28a745;
                font-size: 12px;
            }
            QPushButton:hover {
                background-color: #218838;
            }
        """)
        button_layout.addWidget(refresh_btn)
        
        device_layout.addLayout(button_layout)
        
        layout.addWidget(device_group)

        # File selection group with drag-drop area simulation
        file_group = QGroupBox("📁 Firmware File Selection")
        file_layout = QVBoxLayout(file_group)
        file_layout.setSpacing(10)
        
        # File drop area
        file_area = QWidget()
        file_area.setMinimumHeight(100)
        file_area.setStyleSheet("""
            QWidget {
                border: 3px dashed #555555;
                border-radius: 10px;
                background-color: #383838;
            }
        """)
        file_area_layout = QVBoxLayout(file_area)
        
        select_file_btn = QPushButton("📂 Select .hex File")
        select_file_btn.setMinimumHeight(50)
        select_file_btn.clicked.connect(self.select_file)
        select_file_btn.setStyleSheet("""
            QPushButton {
                background-color: #17a2b8;
                font-size: 14px;
                border: none;
            }
            QPushButton:hover {
                background-color: #138496;
            }
        """)
        file_area_layout.addWidget(select_file_btn)
        
        self.file_label = QLabel("No file selected")
        self.file_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.file_label.setStyleSheet("""
            QLabel {
                color: #cccccc;
                font-style: italic;
                font-size: 11px;
                background: none;
                border: none;
            }
        """)
        file_area_layout.addWidget(self.file_label)
        
        file_layout.addWidget(file_area)
        layout.addWidget(file_group)

        # Upload group with progress animation
        upload_group = QGroupBox("🚀 Upload Firmware")
        upload_layout = QVBoxLayout(upload_group)
        upload_layout.setSpacing(10)
        
        upload_btn = QPushButton("⬆️ Upload Firmware")
        upload_btn.setMinimumHeight(50)
        upload_btn.clicked.connect(self.upload_firmware)
        upload_btn.setStyleSheet("""
            QPushButton {
                background-color: #dc3545;
                font-size: 14px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #c82333;
            }
        """)
        upload_layout.addWidget(upload_btn)
        
        self.progress = QProgressBar()
        self.progress.setVisible(False)
        self.progress.setMinimumHeight(25)
        self.progress.setStyleSheet("""
            QProgressBar {
                border-radius: 10px;
                text-align: center;
                font-weight: bold;
            }
            QProgressBar::chunk {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #28a745, stop:1 #20c997);
                border-radius: 8px;
            }
        """)
        upload_layout.addWidget(self.progress)
        
        layout.addWidget(upload_group)

        # Output group with console styling
        output_group = QGroupBox("📊 Output Console")
        output_layout = QVBoxLayout(output_group)
        
        self.output_text = QTextEdit()
        self.output_text.setReadOnly(True)
        self.output_text.setMinimumHeight(250)
        self.output_text.setStyleSheet("""
            QTextEdit {
                background-color: #000000;
                color: #00ff00;
                font-family: 'Courier New', 'Monaco', monospace;
                font-size: 11px;
                border: 2px solid #333333;
                border-radius: 8px;
                padding: 10px;
            }
        """)
        output_layout.addWidget(self.output_text)
        
        layout.addWidget(output_group)

        # Initialize with empty device list - user must click refresh to scan
        self.device_combo.addItem("Click 'Refresh Devices' to scan for DFU devices")
        self.append_output("Ready. Click 'Refresh Devices' to scan for DFU devices.")

    def refresh_devices(self):
        try:
            self.device_combo.clear()
            self.selected_device = None
            result = subprocess.run(
                [self.dfu_util_path, "-l"], capture_output=True, text=True, check=True)
            devices = self.parse_dfu_devices(result.stdout)
            if not devices:
                # Check if this might be a Windows driver issue
                if platform.system().lower() == "windows" and WINDOWS_DRIVER_SUPPORT:
                    self._handle_no_devices_windows()
                else:
                    self.device_combo.addItem("No DFU devices found")
                    self.append_output("No DFU devices found. Ensure device is in DFU mode and connected.")
            else:
                device_strings = [
                    f"DFU Device {idx + 1}: VID={d['vid']}, PID={d['pid']}, Serial={d['serial']}"
                    for idx, d in enumerate(devices)
                ]
                self.device_combo.addItems(device_strings)
                self.selected_device = devices[0]
                self.append_output(f"Found {len(devices)} DFU device(s)")
        except subprocess.CalledProcessError as e:
            self.append_output(f"Error listing devices: {e.stderr}")
            QMessageBox.critical(self, "Error", f"Failed to list devices: {e.stderr}")
            self.device_combo.addItem("Error listing devices")
            self.selected_device = None
        except FileNotFoundError:
            self.append_output("Error: dfu-util binary not found in application bundle")
            QMessageBox.critical(self, "Error", "dfu-util binary not found in application bundle")
            self.device_combo.addItem("Error listing devices")
            self.selected_device = None

    def _handle_no_devices_windows(self):
        """Handle no devices found on Windows with manual driver installation instructions"""
        self.device_combo.addItem("No DFU devices found - Driver may be needed")
        self.append_output("No DFU devices found on Windows.")
        self.append_output("This might be due to missing WinUSB driver.")
        
        # Show manual installation instructions
        msg = QMessageBox()
        msg.setWindowTitle("No DFU Devices Found")
        msg.setIcon(QMessageBox.Icon.Information)
        msg.setText("No DFU devices were detected.\n\nTo install the necessary WinUSB drivers:")
        msg.setDetailedText("""1. Put your device into DFU mode first
2. Go to the Programs folder in this application's directory
3. Run 'zadig-2.9.exe' as Administrator
4. In Zadig:
   - Select 'Options' > 'List All Devices'
   - Find your DFU device in the dropdown
   - Select 'WinUSB' as the driver
   - Click 'Install Driver'
5. Click 'Refresh Devices' in this application after driver installation

Note: You may need to repeat this process for each DFU device type you use.""")
        msg.exec()

    def parse_dfu_devices(self, output):
        pattern = r"Found DFU: \[([0-9a-f]{4}):([0-9a-f]{4})\].*?serial=\"([^\"]+)\""
        devices = [{"vid": m[0], "pid": m[1], "serial": m[2]}
                   for m in re.findall(pattern, output, re.DOTALL)]
        unique_devices = {f"{d['vid']}:{d['pid']}:{d['serial']}": d for d in devices}
        return list(unique_devices.values())

    def on_device_select(self, index):
        # Check if the current selection is an error message
        current_text = self.device_combo.currentText()
        if (current_text == "No DFU devices found" or 
            "Error" in current_text or 
            self.device_combo.count() == 0):
            self.selected_device = None
            return
            
        try:
            # Get fresh device list
            result = subprocess.run(
                [self.dfu_util_path, "-l"], capture_output=True, text=True, check=True)
            devices = self.parse_dfu_devices(result.stdout)
            
            # Validate index and device list
            if not devices or index < 0 or index >= len(devices):
                self.selected_device = None
                self.append_output("No valid device selected")
                return
                
            # Set selected device
            self.selected_device = devices[index]
            self.append_output(f"Selected device: VID={self.selected_device['vid']}, PID={self.selected_device['pid']}, Serial={self.selected_device['serial']}")
            
        except subprocess.CalledProcessError as e:
            self.append_output(f"Error selecting device: {e.stderr}")
            QMessageBox.critical(self, "Error", f"Failed to select device: {e.stderr}")
            self.selected_device = None
        except FileNotFoundError:
            self.append_output("Error: dfu-util binary not found")
            QMessageBox.critical(self, "Error", "dfu-util binary not found")
            self.selected_device = None
        except Exception as e:
            self.append_output(f"Unexpected error selecting device: {str(e)}")
            self.selected_device = None

    def select_file(self):
        file_path, _ = QFileDialog.getOpenFileName(self, "Select Hex File", "", "Hex Files (*.hex)")
        if file_path:
            self.hex_file = file_path
            self.file_label.setText(os.path.basename(self.hex_file))
            self.check_hex_file()

    def check_hex_file(self):
        try:
            ih = IntelHex(self.hex_file)
            start_addr = ih.minaddr()
            end_addr = ih.maxaddr()
            
            # Handle None values from IntelHex
            if start_addr is None or end_addr is None:
                QMessageBox.critical(self, "Error", "Invalid hex file: Could not determine address range")
                return
                
            size = end_addr - start_addr + 1
            max_size = self.max_flash_addr - 0x08000000 + 1
            if size > max_size or end_addr > self.max_flash_addr:
                QMessageBox.warning(
                    self, "Warning",
                    f"Hex file exceeds STM32G0B0RET flash size (512 KB)!\n"
                    f"Start: {hex(start_addr)}\nEnd: {hex(end_addr)}\nSize: {size} bytes"
                )
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to check .hex file: {e}")

    def hex_to_bin(self):
        try:
            ih = IntelHex(self.hex_file)
            min_addr = ih.minaddr()
            max_addr = ih.maxaddr()
            
            # Handle None values from IntelHex
            if min_addr is None or max_addr is None:
                raise ValueError("Invalid hex file: Could not determine address range")
                
            if min_addr < 0x08000000 or max_addr > self.max_flash_addr:
                raise ValueError("Hex file addresses out of STM32G0B0RET flash range!")
            with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
                ih.tobinfile(tmp.name)
                return tmp.name
        except Exception as e:
            raise Exception(f"Failed to convert .hex to .bin: {e}")

    def append_output(self, text):
        self.output_text.append(text)
        # Scroll to bottom
        cursor = self.output_text.textCursor()
        cursor.movePosition(cursor.MoveOperation.End)
        self.output_text.setTextCursor(cursor)

    def upload_firmware(self):
        if not self.hex_file:
            QMessageBox.critical(self, "Error", "Please select a .hex file first!")
            return
        if not self.selected_device:
            QMessageBox.critical(self, "Error", "No DFU device selected!")
            return

        try:
            self.append_output("Converting .hex to .bin...")
            self.bin_file = self.hex_to_bin()
            self.append_output(f"Created temporary .bin file: {os.path.basename(self.bin_file)}")
        except Exception as e:
            self.append_output(f"Error converting file: {e}")
            QMessageBox.critical(self, "Error", str(e))
            return

        file_size = os.path.getsize(self.bin_file)
        max_size = self.max_flash_addr - 0x08000000 + 1
        if file_size > max_size:
            QMessageBox.critical(
                self, "Error", "Generated .bin file too large for STM32G0B0RET (max 512 KB)!")
            os.unlink(self.bin_file)
            return

        # Start progress bar
        self.progress.setVisible(True)
        self.progress.setRange(0, 0)  # Indeterminate progress
        
        # Create and start worker thread
        self.upload_worker = UploadWorker(self.dfu_util_path, self.bin_file)
        self.upload_worker.output_signal.connect(self.append_output)
        self.upload_worker.finished_signal.connect(self.on_upload_finished)
        self.upload_worker.start()
    
    def on_upload_finished(self, success, message):
        self.progress.setVisible(False)
        self.append_output(message)
        
        if success:
            QMessageBox.information(self, "Success", message)
        else:
            QMessageBox.critical(self, "Error", message)
            
        # Clean up temporary file
        if self.bin_file and os.path.exists(self.bin_file):
            os.unlink(self.bin_file)
            self.append_output("Cleaned up temporary .bin file")
