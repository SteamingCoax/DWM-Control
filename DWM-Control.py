import sys
from PyQt6.QtWidgets import QApplication, QMainWindow, QTabWidget, QWidget, QVBoxLayout
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont, QPalette, QColor, QIcon
from firmware_uploader import FirmwareUploaderTab
from serial_terminal import SerialTerminalTab
from serial_gui import SerialGUITab

class DWMApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("DWM-Control")
        self.setGeometry(100, 100, 1000, 800)
        self.setMinimumSize(800, 600)
        
        # Set application style
        self.setup_modern_style()
        
        # Create central widget and layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)
        layout.setContentsMargins(15, 15, 15, 15)
        layout.setSpacing(10)
        
        # Create modern tab widget
        self.tab_widget = QTabWidget()
        self.setup_tab_styling()
        layout.addWidget(self.tab_widget)
        
        # Create tabs
        self.firmware_tab = QWidget()
        self.serial_terminal_tab = QWidget()
        self.serial_gui_tab = QWidget()
        
        # Add tabs to tab widget with icons
        self.tab_widget.addTab(self.firmware_tab, "🔧 Firmware Uploader")
        self.tab_widget.addTab(self.serial_terminal_tab, "💻 Serial Terminal")
        self.tab_widget.addTab(self.serial_gui_tab, "🎛️ Control Panel")
        
        # Initialize tab contents
        self.firmware_uploader = FirmwareUploaderTab(self.firmware_tab)
        self.serial_terminal = SerialTerminalTab(self.serial_terminal_tab)
        self.serial_gui = SerialGUITab(self.serial_gui_tab)

    def setup_modern_style(self):
        """Apply modern dark theme styling"""
        self.setStyleSheet("""
            QMainWindow {
                background-color: #2b2b2b;
                color: #ffffff;
            }
            
            QTabWidget::pane {
                border: 2px solid #3d3d3d;
                border-radius: 8px;
                background-color: #2b2b2b;
                top: -2px;
            }
            
            QTabBar::tab {
                background-color: #3d3d3d;
                color: #ffffff;
                border: 2px solid #3d3d3d;
                border-bottom: none;
                border-top-left-radius: 8px;
                border-top-right-radius: 8px;
                min-width: 150px;
                padding: 12px 20px;
                margin: 2px;
                font-weight: bold;
                font-size: 11px;
            }
            
            QTabBar::tab:selected {
                background-color: #0078d4;
                border-color: #0078d4;
                color: #ffffff;
            }
            
            QTabBar::tab:hover:!selected {
                background-color: #4a4a4a;
                border-color: #4a4a4a;
            }
            
            QGroupBox {
                font-weight: bold;
                font-size: 12px;
                border: 2px solid #3d3d3d;
                border-radius: 8px;
                margin: 10px 0px;
                padding-top: 20px;
                color: #ffffff;
                background-color: #323232;
            }
            
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 15px;
                padding: 5px 10px;
                background-color: #0078d4;
                border-radius: 4px;
                color: #ffffff;
            }
            
            QPushButton {
                background-color: #0078d4;
                border: none;
                color: #ffffff;
                padding: 10px 20px;
                font-size: 11px;
                font-weight: bold;
                border-radius: 6px;
                min-height: 25px;
            }
            
            QPushButton:hover {
                background-color: #106ebe;
            }
            
            QPushButton:pressed {
                background-color: #005a9e;
            }
            
            QPushButton:disabled {
                background-color: #555555;
                color: #888888;
            }
            
            QLabel {
                color: #ffffff;
                font-size: 11px;
            }
            
            QComboBox {
                background-color: #3d3d3d;
                border: 2px solid #555555;
                border-radius: 6px;
                padding: 8px;
                color: #ffffff;
                font-size: 11px;
                min-height: 20px;
            }
            
            QComboBox:hover {
                border-color: #0078d4;
            }
            
            QComboBox::drop-down {
                border: none;
                width: 20px;
            }
            
            QComboBox::down-arrow {
                image: none;
                border-left: 5px solid transparent;
                border-right: 5px solid transparent;
                border-top: 5px solid #ffffff;
            }
            
            QTextEdit {
                background-color: #1e1e1e;
                border: 2px solid #3d3d3d;
                border-radius: 6px;
                color: #ffffff;
                font-family: 'Courier New', monospace;
                font-size: 10px;
                padding: 10px;
            }
            
            QLineEdit {
                background-color: #3d3d3d;
                border: 2px solid #555555;
                border-radius: 6px;
                padding: 8px;
                color: #ffffff;
                font-size: 11px;
                min-height: 20px;
            }
            
            QLineEdit:focus {
                border-color: #0078d4;
            }
            
            QSpinBox, QDoubleSpinBox {
                background-color: #3d3d3d;
                border: 2px solid #555555;
                border-radius: 6px;
                padding: 8px;
                color: #ffffff;
                font-size: 11px;
                min-height: 20px;
            }
            
            QSpinBox:focus, QDoubleSpinBox:focus {
                border-color: #0078d4;
            }
            
            QCheckBox {
                color: #ffffff;
                font-size: 11px;
                spacing: 8px;
            }
            
            QCheckBox::indicator {
                width: 18px;
                height: 18px;
                border: 2px solid #555555;
                border-radius: 3px;
                background-color: #3d3d3d;
            }
            
            QCheckBox::indicator:checked {
                background-color: #0078d4;
                border-color: #0078d4;
            }
            
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
            
            QScrollBar:vertical {
                background-color: #2b2b2b;
                width: 12px;
                border-radius: 6px;
            }
            
            QScrollBar::handle:vertical {
                background-color: #555555;
                border-radius: 6px;
                min-height: 20px;
            }
            
            QScrollBar::handle:vertical:hover {
                background-color: #0078d4;
            }
        """)

    def setup_tab_styling(self):
        """Configure tab widget appearance"""
        # Set tab position and shape
        self.tab_widget.setTabPosition(QTabWidget.TabPosition.North)
        self.tab_widget.setTabShape(QTabWidget.TabShape.Rounded)
        self.tab_widget.setDocumentMode(True)
        self.tab_widget.setMovable(True)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = DWMApp()
    window.show()
    window.raise_()
    window.activateWindow()
    sys.exit(app.exec())
