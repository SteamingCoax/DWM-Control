from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, QComboBox, 
                           QPushButton, QTextEdit, QGroupBox, QMessageBox, QLineEdit,
                           QCheckBox, QSpinBox, QDoubleSpinBox, QScrollArea, QFrame,
                           QTabWidget, QGridLayout)
from PyQt6.QtCore import QThread, pyqtSignal, Qt, QTimer
from PyQt6.QtGui import QFont
import serial
import serial.tools.list_ports
import time

# Debug configuration - set to True to enable terminal debugging output
DEBUG_ENABLED = False

class SerialGUIReaderThread(QThread):
    data_received = pyqtSignal(str)
    
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
                self.msleep(50)
            except Exception as e:
                break
                
    def stop(self):
        self.running = False

class SerialGUITab(QWidget):
    def __init__(self, parent):
        super().__init__()
        self.parent = parent
        self.serial_connection = None
        self.is_connected = False
        self.read_thread = None
        
        # Data storage for display fields
        self.data_fields = {}
        
        # Parameter groups for organized UI
        self.parameter_groups = {
            'Device': {
                'DE_COEF': {'default': 1.0, 'type': 'float'},
                'DEVICE_NAME': {'default': 'DWM', 'type': 'string'},
                'UNIT_TYPE': {'default': 1, 'type': 'int'},
                'TERM_TYPE': {'default': 1, 'type': 'int'},
            },
            'Measurement': {
                'AVERAGING': {'default': 5, 'type': 'int'},
                'PEAK_TIME': {'default': 1000, 'type': 'int'},
                'MAX_RANGE': {'default': 100, 'type': 'int'},
                'METER_TYPE': {'default': 1, 'type': 'int'},
                'STAT_TYPE': {'default': 1, 'type': 'int'},
                'REFL_TYPE': {'default': 1, 'type': 'int'},
                'CLASSIC_MODE': {'default': 0, 'type': 'bool'},
            },
            'Trigger': {
                'TRIG_THRESH': {'default': 100, 'type': 'int'},
                'TRIG_SIDE': {'default': 1, 'type': 'int'},
            },
            'Termination': {
                'TERM_ESR': {'default': 50, 'type': 'int'},
                'IN_OFFSET': {'default': 0, 'type': 'int'},
            },
            'Element': {
                'ELE_SELECT': {'default': 1, 'type': 'int'},
                'ELE_VAL': {'default': 100, 'type': 'int'},
            },
            'Display': {
                'BACKLIGHT': {'default': 50, 'type': 'int'},
                'CONTRAST': {'default': 50, 'type': 'int'},
                'DARK_MODE': {'default': 0, 'type': 'bool'},
                'MENU_HELP': {'default': 1, 'type': 'bool'},
            },
            'Supply': {
                'SUPPLY_TYPE': {'default': 1, 'type': 'int'},
                'SUPPLY_RANGE': {'default': 5, 'type': 'int'},
            },
            'Logging': {
                'LOGGING_TYPE': {'default': 1, 'type': 'int'},
            }
        }
        
        # Action commands with icons
        self.action_commands = {
            'reset': {'label': '🔄 Reset', 'command': 'START:A:RESET', 'color': '#ffc107'},
            'reboot': {'label': '⏻ Reboot', 'command': 'START:A:REBOOT', 'color': '#fd7e14'},
            'save': {'label': '💾 Save', 'command': 'START:A:SAVE', 'color': '#28a745'},
            'update': {'label': '🔄 Update', 'command': 'START:A:UPDATE', 'color': '#17a2b8'},
            'return_loss': {'label': '📊 Return Loss', 'command': 'START:A:RETURN_LOSS', 'color': '#6610f2'},
            'cal': {'label': '🎯 Calibrate', 'command': 'START:A:CAL', 'color': '#e83e8c'},
            'de_embed': {'label': '🔧 De-Embed', 'command': 'START:A:DE_EMBED', 'color': '#20c997'},
        }
        
        self.create_widgets()

    def create_widgets(self):
        # Set up layout for parent
        layout = QVBoxLayout(self.parent)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(15)

        # Title with control panel icon
        title_label = QLabel("🎛️ Device Control Panel")
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

        # Connection group
        connection_group = QGroupBox("🔗 Serial Connection")
        connection_layout = QVBoxLayout(connection_group)
        
        # Port selection
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

        # Baud rate selection
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

        # Control group with enhanced tabs
        control_group = QGroupBox("⚙️ Device Parameters")
        control_layout = QVBoxLayout(control_group)
        
        # Parameter tabs with modern styling
        self.param_tabs = QTabWidget()
        self.param_tabs.setStyleSheet("""
            QTabWidget::pane {
                border: 2px solid #444444;
                border-radius: 6px;
                background-color: #2e2e2e;
            }
            
            QTabBar::tab {
                background-color: #404040;
                color: #ffffff;
                border: 1px solid #555555;
                border-bottom: none;
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
                min-width: 100px;
                padding: 8px 16px;
                margin: 1px;
                font-size: 10px;
                font-weight: bold;
            }
            
            QTabBar::tab:selected {
                background-color: #0078d4;
                border-color: #0078d4;
            }
            
            QTabBar::tab:hover:!selected {
                background-color: #505050;
            }
        """)
        control_layout.addWidget(self.param_tabs)
        
        # Create tabs for each parameter group with icons
        tab_icons = {
            'Device': '🖥️',
            'Measurement': '📏',
            'Trigger': '⚡',
            'Termination': '🔌',
            'Element': '⚛️',
            'Display': '🖥️',
            'Supply': '🔋',
            'Logging': '📝'
        }
        
        self.param_widgets = {}
        for group_name, params in self.parameter_groups.items():
            tab_widget = QWidget()
            tab_layout = QGridLayout(tab_widget)
            tab_layout.setSpacing(10)
            
            row = 0
            for param_name, param_info in params.items():
                # Label with better formatting
                label = QLabel(param_name.replace('_', ' ') + ":")
                label.setStyleSheet("""
                    QLabel {
                        font-weight: bold;
                        color: #cccccc;
                        min-width: 120px;
                    }
                """)
                tab_layout.addWidget(label, row, 0)
                
                # Input widget based on type with enhanced styling
                if param_info['type'] == 'bool':
                    widget = QCheckBox()
                    widget.setChecked(bool(param_info['default']))
                    widget.setStyleSheet("""
                        QCheckBox::indicator {
                            width: 20px;
                            height: 20px;
                        }
                        QCheckBox::indicator:checked {
                            background-color: #28a745;
                            border: 2px solid #28a745;
                        }
                    """)
                elif param_info['type'] == 'float':
                    widget = QDoubleSpinBox()
                    widget.setRange(-999999.0, 999999.0)
                    widget.setValue(param_info['default'])
                    widget.setMinimumHeight(30)
                elif param_info['type'] == 'int':
                    widget = QSpinBox()
                    widget.setRange(-999999, 999999)
                    widget.setValue(param_info['default'])
                    widget.setMinimumHeight(30)
                else:  # string
                    widget = QLineEdit()
                    widget.setText(str(param_info['default']))
                    widget.setMinimumHeight(30)
                
                tab_layout.addWidget(widget, row, 1)
                
                # Set/Get buttons with color coding
                set_btn = QPushButton("📤 Set")
                set_btn.setMinimumHeight(30)
                set_btn.setStyleSheet("""
                    QPushButton {
                        background-color: #dc3545;
                        font-size: 10px;
                        max-width: 60px;
                    }
                    QPushButton:hover {
                        background-color: #c82333;
                    }
                """)
                get_btn = QPushButton("📥 Get")
                get_btn.setMinimumHeight(30)
                get_btn.setStyleSheet("""
                    QPushButton {
                        background-color: #28a745;
                        font-size: 10px;
                        max-width: 60px;
                    }
                    QPushButton:hover {
                        background-color: #218838;
                    }
                """)
                set_btn.clicked.connect(lambda checked, p=param_name, w=widget: self.set_parameter(p, w))
                get_btn.clicked.connect(lambda checked, p=param_name: self.get_parameter(p))
                tab_layout.addWidget(set_btn, row, 2)
                tab_layout.addWidget(get_btn, row, 3)
                
                self.param_widgets[param_name] = widget
                row += 1
            
            # Add the tab with icon
            icon = tab_icons.get(group_name, '⚙️')
            self.param_tabs.addTab(tab_widget, f"{icon} {group_name}")
        
        layout.addWidget(control_group)

        # Actions group with colorful buttons
        actions_group = QGroupBox("🚀 Quick Actions")
        actions_layout = QGridLayout(actions_group)
        actions_layout.setSpacing(10)
        
        col = 0
        row = 0
        for action_key, action_info in self.action_commands.items():
            btn = QPushButton(action_info['label'])
            btn.setMinimumHeight(40)
            btn.setMinimumWidth(120)
            btn.setStyleSheet(f"""
                QPushButton {{
                    background-color: {action_info['color']};
                    color: #ffffff;
                    font-weight: bold;
                    font-size: 11px;
                    border-radius: 8px;
                }}
                QPushButton:hover {{
                    background-color: {action_info['color']}dd;
                    transform: scale(1.05);
                }}
            """)
            btn.clicked.connect(lambda checked, cmd=action_info['command']: self.send_command(cmd))
            actions_layout.addWidget(btn, row, col)
            
            col += 1
            if col >= 3:  # 3 buttons per row
                col = 0
                row += 1
        
        layout.addWidget(actions_group)

        # Status output with enhanced console look
        status_group = QGroupBox("📊 Communication Status")
        status_layout = QVBoxLayout(status_group)
        
        self.status_text = QTextEdit()
        self.status_text.setReadOnly(True)
        self.status_text.setMaximumHeight(120)
        self.status_text.setStyleSheet("""
            QTextEdit {
                background-color: #1a1a1a;
                color: #00ff00;
                font-family: 'Courier New', 'Monaco', monospace;
                font-size: 10px;
                border: 2px solid #333333;
                border-radius: 6px;
                padding: 8px;
            }
        """)
        status_layout.addWidget(self.status_text)
        
        layout.addWidget(status_group)

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
            self.append_status(f"Error refreshing ports: {e}")
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
            
            self.connect_btn.setText("Disconnect")
            self.port_combo.setEnabled(False)
            self.baud_combo.setEnabled(False)
            
            self.append_status(f"Connected to {port} at {baud_rate} baud\n")
            
            # Start reading thread
            self.read_thread = SerialGUIReaderThread(self.serial_connection)
            self.read_thread.data_received.connect(self.handle_serial_data)
            self.read_thread.start()
            
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to connect: {e}")
            self.append_status(f"Connection failed: {e}\n")

    def disconnect(self):
        if self.read_thread:
            self.read_thread.stop()
            self.read_thread.wait()
            
        if self.serial_connection:
            self.serial_connection.close()
            self.serial_connection = None
        
        self.is_connected = False
        self.connect_btn.setText("Connect")
        self.port_combo.setEnabled(True)
        self.baud_combo.setEnabled(True)
        
        self.append_status("Disconnected\n")

    def send_command(self, command):
        if not self.is_connected or not self.serial_connection:
            QMessageBox.warning(self, "Warning", "Not connected to serial device!")
            return
            
        try:
            self.serial_connection.write((command + '\n').encode('utf-8'))
            self.append_status(f"Sent: {command}\n")
        except Exception as e:
            self.append_status(f"Send error: {e}\n")

    def set_parameter(self, param_name, widget):
        if isinstance(widget, QCheckBox):
            value = "1" if widget.isChecked() else "0"
        elif isinstance(widget, (QSpinBox, QDoubleSpinBox)):
            value = str(widget.value())
        else:  # QLineEdit
            value = widget.text()
        
        command = f"START:W:{param_name}:{value}"
        self.send_command(command)

    def get_parameter(self, param_name):
        command = f"START:R:{param_name}:0"
        self.send_command(command)

    def handle_serial_data(self, data):
        self.append_status(f"Received: {data}")

    def append_status(self, text):
        """Append text to status display"""
        cursor = self.status_text.textCursor()
        cursor.movePosition(cursor.MoveOperation.End)
        cursor.insertText(text)
        self.status_text.setTextCursor(cursor)
        
        # Scroll to bottom
        scrollbar = self.status_text.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())
