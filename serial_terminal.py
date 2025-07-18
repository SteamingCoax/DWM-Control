from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, QComboBox, 
                           QPushButton, QTextEdit, QGroupBox, QMessageBox)
from PyQt6.QtCore import QThread, pyqtSignal, Qt, QTimer
from PyQt6.QtGui import QFont, QKeyEvent, QTextCursor
import serial
import serial.tools.list_ports

class SerialReaderThread(QThread):
    data_received = pyqtSignal(str)
    error_occurred = pyqtSignal(str)
    
    def __init__(self, serial_connection):
        super().__init__()
        self.serial_connection = serial_connection
        self.running = True
        
    def run(self):
        while self.running and self.serial_connection:
            try:
                if self.serial_connection.in_waiting:
                    data = self.serial_connection.read(self.serial_connection.in_waiting)
                    if data:
                        decoded_data = data.decode('utf-8', errors='ignore')
                        self.data_received.emit(decoded_data)
                self.msleep(10)  # Small delay to prevent excessive CPU usage
            except Exception as e:
                self.error_occurred.emit(f"Read error: {e}")
                break
                
    def stop(self):
        self.running = False

class SerialTerminalTab(QWidget):
    def __init__(self, parent):
        super().__init__()
        self.parent = parent
        self.serial_connection = None
        self.is_connected = False
        self.read_thread = None
        
        self.create_widgets()

    def create_widgets(self):
        # Set up layout for parent
        layout = QVBoxLayout(self.parent)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(15)

        # Title with terminal icon
        title_label = QLabel("💻 Serial Terminal")
        title_font = QFont()
        title_font.setPointSize(16)
        title_font.setBold(True)
        title_label.setFont(title_font)
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("""
            QLabel {
                color: #ffffff;
                background-color: #6f42c1;
                padding: 15px;
                border-radius: 10px;
                margin-bottom: 10px;
            }
        """)
        #layout.addWidget(title_label)

        # Connection group with status indicator
        connection_group = QGroupBox("🔌 Serial Connection")
        connection_layout = QVBoxLayout(connection_group)
        connection_layout.setSpacing(12)
        
        # Connection status indicator
        self.status_indicator = QLabel("● Disconnected")
        self.status_indicator.setStyleSheet("""
            QLabel {
                color: #dc3545;
                font-weight: bold;
                font-size: 12px;
                background: none;
                border: none;
                padding: 5px;
            }
        """)
        connection_layout.addWidget(self.status_indicator)
        
        # Port selection row
        port_layout = QHBoxLayout()
        port_layout.addWidget(QLabel("Port:"))
        self.port_combo = QComboBox()
        self.port_combo.setMinimumHeight(35)
        port_layout.addWidget(self.port_combo)
        
        refresh_ports_btn = QPushButton("🔄 Refresh")
        refresh_ports_btn.setMinimumHeight(35)
        refresh_ports_btn.clicked.connect(self.refresh_ports)
        refresh_ports_btn.setStyleSheet("""
            QPushButton {
                background-color: #28a745;
                max-width: 100px;
            }
            QPushButton:hover {
                background-color: #218838;
            }
        """)
        port_layout.addWidget(refresh_ports_btn)
        connection_layout.addLayout(port_layout)

        # Baud rate selection row
        baud_layout = QHBoxLayout()
        baud_layout.addWidget(QLabel("Baud Rate:"))
        self.baud_combo = QComboBox()
        self.baud_combo.addItems(["9600", "19200", "38400", "57600", "115200", "230400", "460800", "921600"])
        self.baud_combo.setCurrentText("115200")
        self.baud_combo.setMinimumHeight(35)
        baud_layout.addWidget(self.baud_combo)
        
        self.connect_btn = QPushButton("🔗 Connect")
        self.connect_btn.setMinimumHeight(35)
        self.connect_btn.clicked.connect(self.toggle_connection)
        self.connect_btn.setStyleSheet("""
            QPushButton {
                background-color: #007bff;
                min-width: 120px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #0056b3;
            }
        """)
        baud_layout.addWidget(self.connect_btn)
        connection_layout.addLayout(baud_layout)
        
        layout.addWidget(connection_group)

        # Terminal group with retro styling
        terminal_group = QGroupBox("⌨️ Terminal Interface")
        terminal_layout = QVBoxLayout(terminal_group)
        
        # Terminal header
        terminal_header = QLabel("Type commands and press Enter to send")
        terminal_header.setStyleSheet("""
            QLabel {
                color: #cccccc;
                font-style: italic;
                background: none;
                border: none;
                padding: 5px;
            }
        """)
        terminal_layout.addWidget(terminal_header)
        
        self.terminal_text = QTextEdit()
        self.terminal_text.setMinimumHeight(350)
        self.terminal_text.setStyleSheet("""
            QTextEdit {
                background-color: #0c0c0c;
                color: #00ff41;
                font-family: 'Courier New', 'Monaco', 'Consolas', monospace;
                font-size: 12px;
                border: 3px solid #333333;
                border-radius: 8px;
                padding: 15px;
                line-height: 1.4;
            }
        """)
        terminal_layout.addWidget(self.terminal_text)
        
        # Terminal controls
        controls_layout = QHBoxLayout()
        clear_btn = QPushButton("🗑️ Clear Terminal")
        clear_btn.clicked.connect(self.clear_terminal)
        clear_btn.setStyleSheet("""
            QPushButton {
                background-color: #ffc107;
                color: #000000;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #e0a800;
            }
        """)
        controls_layout.addWidget(clear_btn)
        controls_layout.addStretch()
        terminal_layout.addLayout(controls_layout)
        
        layout.addWidget(terminal_group)

        # Handle key events
        self.terminal_text.keyPressEvent = self.on_key_press

        self.refresh_ports()

    def refresh_ports(self):
        try:
            self.port_combo.clear()
            ports = [port.device for port in serial.tools.list_ports.comports()]
            if ports:
                self.port_combo.addItems(ports)
            else:
                self.port_combo.addItem("No ports available")
        except Exception as e:
            self.append_terminal(f"Error refreshing ports: {e}")
            self.port_combo.addItem("Error listing ports")

    def toggle_connection(self):
        if not self.is_connected:
            self.connect()
        else:
            self.disconnect()

    def connect(self):
        if not self.port_combo.currentText() or "No ports" in self.port_combo.currentText():
            QMessageBox.critical(self, "Error", "Please select a valid port!")
            return
        
        try:
            port = self.port_combo.currentText()
            baud_rate = int(self.baud_combo.currentText())
            
            self.serial_connection = serial.Serial(port, baud_rate, timeout=0.1)
            self.is_connected = True
            
            self.connect_btn.setText("🔌 Disconnect")
            self.connect_btn.setStyleSheet("""
                QPushButton {
                    background-color: #dc3545;
                    min-width: 120px;
                    font-weight: bold;
                }
                QPushButton:hover {
                    background-color: #c82333;
                }
            """)
            self.port_combo.setEnabled(False)
            self.baud_combo.setEnabled(False)
            
            # Update status indicator
            self.status_indicator.setText("● Connected")
            self.status_indicator.setStyleSheet("""
                QLabel {
                    color: #28a745;
                    font-weight: bold;
                    font-size: 12px;
                    background: none;
                    border: none;
                    padding: 5px;
                }
            """)
            
            self.append_terminal(f"🔗 Connected to {port} at {baud_rate} baud\n")
            self.append_terminal("💡 Type commands and press Enter to send...\n")
            
            # Start reading thread
            self.read_thread = SerialReaderThread(self.serial_connection)
            self.read_thread.data_received.connect(self.append_terminal)
            self.read_thread.error_occurred.connect(self.append_terminal)
            self.read_thread.start()
            
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to connect: {e}")
            self.append_terminal(f"❌ Connection failed: {e}\n")

    def disconnect(self):
        if self.read_thread:
            self.read_thread.stop()
            self.read_thread.wait()
            
        if self.serial_connection:
            self.serial_connection.close()
            self.serial_connection = None
        
        self.is_connected = False
        self.connect_btn.setText("🔗 Connect")
        self.connect_btn.setStyleSheet("""
            QPushButton {
                background-color: #007bff;
                min-width: 120px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #0056b3;
            }
        """)
        self.port_combo.setEnabled(True)
        self.baud_combo.setEnabled(True)
        
        # Update status indicator
        self.status_indicator.setText("● Disconnected")
        self.status_indicator.setStyleSheet("""
            QLabel {
                color: #dc3545;
                font-weight: bold;
                font-size: 12px;
                background: none;
                border: none;
                padding: 5px;
            }
        """)
        
        self.append_terminal("🔌 Disconnected\n")

    def on_key_press(self, event: QKeyEvent):
        if not self.is_connected or not self.serial_connection:
            QTextEdit.keyPressEvent(self.terminal_text, event)
            return
        
        # Handle Enter key
        if event.key() == Qt.Key.Key_Return or event.key() == Qt.Key.Key_Enter:
            # Get current line
            cursor = self.terminal_text.textCursor()
            cursor.select(QTextCursor.SelectionType.LineUnderCursor)
            current_line = cursor.selectedText()
            
            try:
                self.serial_connection.write((current_line + '\n').encode('utf-8'))
                self.terminal_text.append("")  # Add new line
            except Exception as e:
                self.append_terminal(f"Send error: {e}\n")
            return
        
        # Handle other keys normally
        QTextEdit.keyPressEvent(self.terminal_text, event)
        
        # Send individual characters for real-time input
        if event.text() and len(event.text()) == 1:
            try:
                self.serial_connection.write(event.text().encode('utf-8'))
            except Exception as e:
                self.append_terminal(f"Send error: {e}\n")

    def append_terminal(self, text):
        """Append text to terminal"""
        cursor = self.terminal_text.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.End)
        cursor.insertText(text)
        self.terminal_text.setTextCursor(cursor)
        
        # Scroll to bottom
        scrollbar = self.terminal_text.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())

    def clear_terminal(self):
        """Clear the terminal"""
        self.terminal_text.clear() 