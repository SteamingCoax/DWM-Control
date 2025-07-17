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
        
        # Action commands
        self.action_commands = {
            'reset': {'label': 'Reset', 'command': 'START:A:RESET'},
            'reboot': {'label': 'Reboot', 'command': 'START:A:REBOOT'},
            'save': {'label': 'Save', 'command': 'START:A:SAVE'},
            'update': {'label': 'Update', 'command': 'START:A:UPDATE'},
            'return_loss': {'label': 'Return Loss', 'command': 'START:A:RETURN_LOSS'},
            'cal': {'label': 'Calibrate', 'command': 'START:A:CAL'},
            'de_embed': {'label': 'De-Embed', 'command': 'START:A:DE_EMBED'},
        }
        
        self.create_widgets()

    def create_widgets(self):
        # Set up layout for parent
        layout = QVBoxLayout(self.parent)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)

        # Title
        title_label = QLabel("Serial Control Panel")
        title_font = QFont()
        title_font.setPointSize(14)
        title_font.setBold(True)
        title_label.setFont(title_font)
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(title_label)

        # Connection group
        connection_group = QGroupBox("Serial Connection")
        connection_layout = QVBoxLayout(connection_group)
        
        # Port selection
        port_layout = QHBoxLayout()
        port_layout.addWidget(QLabel("Port:"))
        self.port_combo = QComboBox()
        port_layout.addWidget(self.port_combo)
        refresh_ports_btn = QPushButton("Refresh Ports")
        refresh_ports_btn.clicked.connect(self.refresh_ports)
        port_layout.addWidget(refresh_ports_btn)
        port_layout.addStretch()
        connection_layout.addLayout(port_layout)

        # Baud rate selection
        baud_layout = QHBoxLayout()
        baud_layout.addWidget(QLabel("Baud Rate:"))
        self.baud_combo = QComboBox()
        self.baud_combo.addItems(["9600", "19200", "38400", "57600", "115200", "230400", "460800", "921600"])
        self.baud_combo.setCurrentText("115200")
        baud_layout.addWidget(self.baud_combo)
        
        self.connect_btn = QPushButton("Connect")
        self.connect_btn.clicked.connect(self.toggle_connection)
        baud_layout.addWidget(self.connect_btn)
        baud_layout.addStretch()
        connection_layout.addLayout(baud_layout)
        
        layout.addWidget(connection_group)

        # Control group with tabs
        control_group = QGroupBox("Device Control")
        control_layout = QVBoxLayout(control_group)
        
        # Parameter tabs
        self.param_tabs = QTabWidget()
        control_layout.addWidget(self.param_tabs)
        
        # Create tabs for each parameter group
        self.param_widgets = {}
        for group_name, params in self.parameter_groups.items():
            tab_widget = QWidget()
            tab_layout = QGridLayout(tab_widget)
            
            row = 0
            for param_name, param_info in params.items():
                # Label
                tab_layout.addWidget(QLabel(param_name + ":"), row, 0)
                
                # Input widget based on type
                if param_info['type'] == 'bool':
                    widget = QCheckBox()
                    widget.setChecked(bool(param_info['default']))
                elif param_info['type'] == 'float':
                    widget = QDoubleSpinBox()
                    widget.setRange(-999999.0, 999999.0)
                    widget.setValue(param_info['default'])
                elif param_info['type'] == 'int':
                    widget = QSpinBox()
                    widget.setRange(-999999, 999999)
                    widget.setValue(param_info['default'])
                else:  # string
                    widget = QLineEdit()
                    widget.setText(str(param_info['default']))
                
                tab_layout.addWidget(widget, row, 1)
                
                # Set/Get buttons
                set_btn = QPushButton("Set")
                get_btn = QPushButton("Get")
                set_btn.clicked.connect(lambda checked, p=param_name, w=widget: self.set_parameter(p, w))
                get_btn.clicked.connect(lambda checked, p=param_name: self.get_parameter(p))
                tab_layout.addWidget(set_btn, row, 2)
                tab_layout.addWidget(get_btn, row, 3)
                
                self.param_widgets[param_name] = widget
                row += 1
            
            self.param_tabs.addTab(tab_widget, group_name)
        
        layout.addWidget(control_group)

        # Actions group
        actions_group = QGroupBox("Actions")
        actions_layout = QHBoxLayout(actions_group)
        
        for action_key, action_info in self.action_commands.items():
            btn = QPushButton(action_info['label'])
            btn.clicked.connect(lambda checked, cmd=action_info['command']: self.send_command(cmd))
            actions_layout.addWidget(btn)
        
        layout.addWidget(actions_group)

        # Status output
        status_group = QGroupBox("Status")
        status_layout = QVBoxLayout(status_group)
        
        self.status_text = QTextEdit()
        self.status_text.setReadOnly(True)
        self.status_text.setMaximumHeight(150)
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
