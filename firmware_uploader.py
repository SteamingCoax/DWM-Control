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
            base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
            if platform.system() == "Windows":
                self.dfu_util_path = os.path.join(base_path, "dfu-util.exe")
            else:
                self.dfu_util_path = os.path.join(base_path, "dfu-util")
        else:
            self.dfu_util_path = "dfu-util"  # For development, assume dfu-util is in PATH

        self.create_widgets()

    def create_widgets(self):
        # Set up layout for parent
        layout = QVBoxLayout(self.parent)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)

        # Title
        title_label = QLabel("Firmware Uploader")
        title_font = QFont()
        title_font.setPointSize(14)
        title_font.setBold(True)
        title_label.setFont(title_font)
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(title_label)

        # Device selection group
        device_group = QGroupBox("DFU Device Selection")
        device_layout = QVBoxLayout(device_group)
        
        device_layout.addWidget(QLabel("Select DFU Device:"))
        self.device_combo = QComboBox()
        self.device_combo.currentIndexChanged.connect(self.on_device_select)
        device_layout.addWidget(self.device_combo)
        
        refresh_btn = QPushButton("Refresh Devices")
        refresh_btn.clicked.connect(self.refresh_devices)
        device_layout.addWidget(refresh_btn)
        
        layout.addWidget(device_group)

        # File selection group
        file_group = QGroupBox("Firmware File")
        file_layout = QVBoxLayout(file_group)
        
        select_file_btn = QPushButton("Select .hex File")
        select_file_btn.clicked.connect(self.select_file)
        file_layout.addWidget(select_file_btn)
        
        self.file_label = QLabel("No file selected")
        file_layout.addWidget(self.file_label)
        
        layout.addWidget(file_group)

        # Upload group
        upload_group = QGroupBox("Upload")
        upload_layout = QVBoxLayout(upload_group)
        
        upload_btn = QPushButton("Upload Firmware")
        upload_btn.clicked.connect(self.upload_firmware)
        upload_layout.addWidget(upload_btn)
        
        self.progress = QProgressBar()
        self.progress.setVisible(False)
        upload_layout.addWidget(self.progress)
        
        layout.addWidget(upload_group)

        # Output group
        output_group = QGroupBox("Output")
        output_layout = QVBoxLayout(output_group)
        
        self.output_text = QTextEdit()
        self.output_text.setReadOnly(True)
        self.output_text.setMinimumHeight(200)
        output_layout.addWidget(self.output_text)
        
        layout.addWidget(output_group)

        self.refresh_devices()

    def refresh_devices(self):
        try:
            self.device_combo.clear()
            self.selected_device = None
            result = subprocess.run(
                [self.dfu_util_path, "-l"], capture_output=True, text=True, check=True)
            devices = self.parse_dfu_devices(result.stdout)
            if not devices:
                self.device_combo.addItem("No DFU devices found")
            else:
                device_strings = [
                    f"DFU Device {idx + 1}: VID={d['vid']}, PID={d['pid']}, Serial={d['serial']}"
                    for idx, d in enumerate(devices)
                ]
                self.device_combo.addItems(device_strings)
                self.selected_device = devices[0]
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

    def parse_dfu_devices(self, output):
        pattern = r"Found DFU: \[([0-9a-f]{4}):([0-9a-f]{4})\].*?serial=\"([^\"]+)\""
        devices = [{"vid": m[0], "pid": m[1], "serial": m[2]}
                   for m in re.findall(pattern, output, re.DOTALL)]
        unique_devices = {f"{d['vid']}:{d['pid']}:{d['serial']}": d for d in devices}
        return list(unique_devices.values())

    def on_device_select(self, index):
        if self.device_combo.currentText() == "No DFU devices found" or "Error" in self.device_combo.currentText():
            self.selected_device = None
            return
        try:
            devices = self.parse_dfu_devices(subprocess.run(
                [self.dfu_util_path, "-l"], capture_output=True, text=True, check=True).stdout)
            if index < len(devices):
                self.selected_device = devices[index]
                self.append_output(f"Selected device: VID={self.selected_device['vid']}, PID={self.selected_device['pid']}, Serial={self.selected_device['serial']}")
        except subprocess.CalledProcessError as e:
            self.append_output(f"Error selecting device: {e.stderr}")
            QMessageBox.critical(self, "Error", f"Failed to select device: {e.stderr}")
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