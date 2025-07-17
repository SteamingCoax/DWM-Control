import sys
from PyQt6.QtWidgets import QApplication, QMainWindow, QTabWidget, QWidget, QVBoxLayout
from PyQt6.QtCore import Qt
from firmware_uploader import FirmwareUploaderTab
from serial_terminal import SerialTerminalTab
from serial_gui import SerialGUITab

class DWMApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("DWM-Control")
        self.setGeometry(100, 100, 800, 700)
        
        # Create central widget and layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)
        layout.setContentsMargins(10, 10, 10, 10)
        
        # Create tab widget
        self.tab_widget = QTabWidget()
        layout.addWidget(self.tab_widget)
        
        # Create tabs
        self.firmware_tab = QWidget()
        self.serial_terminal_tab = QWidget()
        self.serial_gui_tab = QWidget()
        
        # Add tabs to tab widget
        self.tab_widget.addTab(self.firmware_tab, "Firmware Uploader")
        self.tab_widget.addTab(self.serial_terminal_tab, "Serial Terminal")
        self.tab_widget.addTab(self.serial_gui_tab, "Control Panel")
        
        # Initialize tab contents
        self.firmware_uploader = FirmwareUploaderTab(self.firmware_tab)
        self.serial_terminal = SerialTerminalTab(self.serial_terminal_tab)
        self.serial_gui = SerialGUITab(self.serial_gui_tab)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = DWMApp()
    window.show()
    window.raise_()
    window.activateWindow()
    sys.exit(app.exec())
