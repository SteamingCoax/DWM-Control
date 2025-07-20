"""
Python wrapper for libwdi (Windows Driver Installer)
Provides seamless DFU driver installation without external tools
"""

import os
import sys
import platform
import ctypes
from ctypes import Structure, POINTER, c_uint16, c_uint8, c_char_p, c_void_p, c_bool, c_uint32, c_uint64, c_int
from PyQt6.QtWidgets import QMessageBox, QProgressDialog
from PyQt6.QtCore import QThread, pyqtSignal, Qt
import tempfile
import shutil

# Windows-specific imports
if platform.system().lower() == "windows":
    from ctypes import wintypes

# Error codes from libwdi
WDI_SUCCESS = 0
WDI_ERROR_IO = -1
WDI_ERROR_INVALID_PARAM = -2
WDI_ERROR_ACCESS = -3
WDI_ERROR_NO_DEVICE = -4
WDI_ERROR_NOT_FOUND = -5
WDI_ERROR_BUSY = -6
WDI_ERROR_TIMEOUT = -7
WDI_ERROR_OVERFLOW = -8
WDI_ERROR_PENDING_INSTALLATION = -9
WDI_ERROR_INTERRUPTED = -10
WDI_ERROR_RESOURCE = -11
WDI_ERROR_NOT_SUPPORTED = -12
WDI_ERROR_EXISTS = -13
WDI_ERROR_USER_CANCEL = -14
WDI_ERROR_NEEDS_ADMIN = -15
WDI_ERROR_WOW64 = -16
WDI_ERROR_INF_SYNTAX = -17
WDI_ERROR_CAT_MISSING = -18
WDI_ERROR_UNSIGNED = -19
WDI_ERROR_OTHER = -99

# Driver types
WDI_WINUSB = 0
WDI_LIBUSB0 = 1
WDI_LIBUSBK = 2
WDI_CDC = 3
WDI_USER = 4

# Error message mapping
WDI_ERROR_MESSAGES = {
    WDI_SUCCESS: "Success",
    WDI_ERROR_IO: "Input/output error",
    WDI_ERROR_INVALID_PARAM: "Invalid parameter",
    WDI_ERROR_ACCESS: "Access denied (insufficient permissions)",
    WDI_ERROR_NO_DEVICE: "No such device (it may have been disconnected)",
    WDI_ERROR_NOT_FOUND: "Entity not found",
    WDI_ERROR_BUSY: "Resource busy, or API call already running",
    WDI_ERROR_TIMEOUT: "Operation timed out",
    WDI_ERROR_OVERFLOW: "Overflow",
    WDI_ERROR_PENDING_INSTALLATION: "Another installation is pending",
    WDI_ERROR_INTERRUPTED: "System call interrupted",
    WDI_ERROR_RESOURCE: "Could not acquire resource (insufficient memory, etc)",
    WDI_ERROR_NOT_SUPPORTED: "Operation not supported or unimplemented on this platform",
    WDI_ERROR_EXISTS: "Entity already exists",
    WDI_ERROR_USER_CANCEL: "Cancelled by user",
    WDI_ERROR_NEEDS_ADMIN: "Couldn't run installer with required privileges",
    WDI_ERROR_WOW64: "Attempted to run the 32 bit installer on 64 bit",
    WDI_ERROR_INF_SYNTAX: "Bad inf syntax",
    WDI_ERROR_CAT_MISSING: "Missing cat file",
    WDI_ERROR_UNSIGNED: "System policy prevents the installation of unsigned drivers",
    WDI_ERROR_OTHER: "Other error"
}

class WdiDeviceInfo(Structure):
    """Device information structure"""
    pass

WdiDeviceInfo._fields_ = [
    ("next", POINTER(WdiDeviceInfo)),
    ("vid", c_uint16),
    ("pid", c_uint16),
    ("is_composite", c_bool),
    ("mi", c_uint8),
    ("desc", c_char_p),
    ("driver", c_char_p),
    ("device_id", c_char_p),
    ("hardware_id", c_char_p),
    ("compatible_id", c_char_p),
    ("upper_filter", c_char_p),
    ("driver_version", c_uint64),
]

class WdiOptionsCreateList(Structure):
    """Options for creating device list"""
    _fields_ = [
        ("list_all", c_bool),
        ("list_hubs", c_bool),
        ("trim_whitespaces", c_bool),
    ]

class WdiOptionsPrepareDriver(Structure):
    """Options for preparing driver"""
    _fields_ = [
        ("driver_type", c_int),
        ("vendor_name", c_char_p),
        ("device_guid", c_char_p),
        ("disable_cat", c_bool),
        ("disable_signing", c_bool),
        ("cert_subject", c_char_p),
        ("use_wcid_driver", c_bool),
        ("external_inf", c_bool),
    ]

if platform.system().lower() == "windows":
    class WdiOptionsInstallDriver(Structure):
        """Options for installing driver"""
        _fields_ = [
            ("hWnd", wintypes.HWND),
            ("install_filter_driver", c_bool),
            ("pending_install_timeout", c_uint32),
        ]

def wdi_strerror(error_code):
    """Convert error code to human-readable message"""
    return WDI_ERROR_MESSAGES.get(error_code, f"Unknown error ({error_code})")

class LibWdiWrapper:
    """Python wrapper for libwdi functionality"""
    
    def __init__(self):
        self.libwdi = None
        self.is_windows = platform.system().lower() == "windows"
        self._load_library()
    
    def _load_library(self):
        """Load libwdi library"""
        if not self.is_windows:
            raise RuntimeError("libwdi is only supported on Windows")
            
        try:
            # Try to load libwdi.dll from various locations
            possible_paths = [
                "libwdi.dll",  # In PATH
                os.path.join(os.path.dirname(__file__), "libwdi.dll"),  # Same directory as script
                os.path.join(os.path.dirname(__file__), "Programs", "libwdi.dll"),  # Programs directory
                os.path.join(os.path.dirname(__file__), "Programs", "libwdi", "libwdi.dll"),  # Programs/libwdi subdirectory
            ]
            
            for path in possible_paths:
                try:
                    self.libwdi = ctypes.WinDLL(path)
                    break
                except (OSError, FileNotFoundError):
                    continue
            
            if self.libwdi is None:
                raise FileNotFoundError("Could not find libwdi.dll")
                
            self._setup_function_prototypes()
            
        except Exception as e:
            raise RuntimeError(f"Failed to load libwdi: {e}")
    
    def _setup_function_prototypes(self):
        """Setup function prototypes for libwdi API"""
        # wdi_create_list
        self.libwdi.wdi_create_list.argtypes = [
            POINTER(POINTER(WdiDeviceInfo)),
            POINTER(WdiOptionsCreateList)
        ]
        self.libwdi.wdi_create_list.restype = c_int
        
        # wdi_destroy_list
        self.libwdi.wdi_destroy_list.argtypes = [POINTER(WdiDeviceInfo)]
        self.libwdi.wdi_destroy_list.restype = c_int
        
        # wdi_prepare_driver
        self.libwdi.wdi_prepare_driver.argtypes = [
            POINTER(WdiDeviceInfo),
            c_char_p,
            c_char_p,
            POINTER(WdiOptionsPrepareDriver)
        ]
        self.libwdi.wdi_prepare_driver.restype = c_int
        
        # wdi_install_driver
        self.libwdi.wdi_install_driver.argtypes = [
            POINTER(WdiDeviceInfo),
            c_char_p,
            c_char_p,
            POINTER(WdiOptionsInstallDriver)
        ]
        self.libwdi.wdi_install_driver.restype = c_int
        
        # wdi_set_log_level
        self.libwdi.wdi_set_log_level.argtypes = [c_int]
        self.libwdi.wdi_set_log_level.restype = c_int
    
    def create_device_list(self, list_all=True):
        """Create a list of USB devices"""
        options = WdiOptionsCreateList()
        options.list_all = list_all
        options.list_hubs = False
        options.trim_whitespaces = True
        
        device_list_ptr = POINTER(WdiDeviceInfo)()
        result = self.libwdi.wdi_create_list(ctypes.byref(device_list_ptr), ctypes.byref(options))
        
        if result != WDI_SUCCESS:
            raise RuntimeError(f"Failed to create device list: {wdi_strerror(result)}")
        
        # Convert linked list to Python list
        devices = []
        current = device_list_ptr
        while current:
            device = {
                'vid': current.contents.vid,
                'pid': current.contents.pid,
                'is_composite': current.contents.is_composite,
                'mi': current.contents.mi,
                'desc': current.contents.desc.decode('utf-8') if current.contents.desc else "",
                'driver': current.contents.driver.decode('utf-8') if current.contents.driver else "",
                'device_id': current.contents.device_id.decode('utf-8') if current.contents.device_id else "",
                'hardware_id': current.contents.hardware_id.decode('utf-8') if current.contents.hardware_id else "",
            }
            devices.append(device)
            current = current.contents.next
        
        # Clean up
        self.libwdi.wdi_destroy_list(device_list_ptr)
        
        return devices
    
    def find_dfu_devices(self):
        """Find potential DFU devices that need drivers"""
        try:
            devices = self.create_device_list(list_all=True)
            
            # Common DFU device VID/PIDs
            dfu_identifiers = [
                (0x0483, None),  # STMicroelectronics
                (0x1209, None),  # pid.codes (common for open source projects)
                (0x16C0, None),  # Van Ooijen Technische Informatica
            ]
            
            dfu_devices = []
            for device in devices:
                for vid, pid in dfu_identifiers:
                    if device['vid'] == vid and (pid is None or device['pid'] == pid):
                        # Check if device needs driver (no driver or generic driver)
                        if not device['driver'] or device['driver'].lower() in ['', 'unknown', 'composite']:
                            dfu_devices.append(device)
                        break
            
            return dfu_devices
            
        except Exception as e:
            print(f"Error finding DFU devices: {e}")
            return []
    
    def install_winusb_driver(self, device, progress_callback=None, parent_hwnd=None):
        """Install WinUSB driver for a specific device"""
        try:
            # Create temporary directory for driver files
            temp_dir = tempfile.mkdtemp(prefix="dfu_driver_")
            
            try:
                # Create device info structure
                device_info = WdiDeviceInfo()
                device_info.vid = device['vid']
                device_info.pid = device['pid']
                device_info.is_composite = device['is_composite']
                device_info.mi = device['mi']
                device_info.desc = device['desc'].encode('utf-8') if device['desc'] else b""
                device_info.hardware_id = device['hardware_id'].encode('utf-8') if device['hardware_id'] else b""
                device_info.device_id = device['device_id'].encode('utf-8') if device['device_id'] else b""
                
                # Prepare driver options
                prepare_options = WdiOptionsPrepareDriver()
                prepare_options.driver_type = WDI_WINUSB
                prepare_options.vendor_name = b"DWM-Control"
                prepare_options.disable_cat = False
                prepare_options.disable_signing = False
                prepare_options.use_wcid_driver = False
                prepare_options.external_inf = False
                
                if progress_callback:
                    progress_callback("Preparing driver files...")
                
                # Prepare driver
                inf_name = b"dfu_device.inf"
                result = self.libwdi.wdi_prepare_driver(
                    ctypes.byref(device_info),
                    temp_dir.encode('utf-8'),
                    inf_name,
                    ctypes.byref(prepare_options)
                )
                
                if result != WDI_SUCCESS:
                    raise RuntimeError(f"Failed to prepare driver: {wdi_strerror(result)}")
                
                if progress_callback:
                    progress_callback("Installing driver...")
                
                # Install driver options
                install_options = WdiOptionsInstallDriver()
                if parent_hwnd:
                    install_options.hWnd = parent_hwnd
                install_options.install_filter_driver = False
                install_options.pending_install_timeout = 30000  # 30 seconds
                
                # Install driver
                result = self.libwdi.wdi_install_driver(
                    ctypes.byref(device_info),
                    temp_dir.encode('utf-8'),
                    inf_name,
                    ctypes.byref(install_options)
                )
                
                if result != WDI_SUCCESS:
                    raise RuntimeError(f"Failed to install driver: {wdi_strerror(result)}")
                
                if progress_callback:
                    progress_callback("Driver installation completed!")
                
                return True, "Driver installed successfully"
                
            finally:
                # Clean up temporary directory
                try:
                    shutil.rmtree(temp_dir)
                except:
                    pass
                    
        except Exception as e:
            return False, str(e)

class LibWdiDriverInstaller(QThread):
    """Threaded driver installer using libwdi"""
    progress_signal = pyqtSignal(str)
    finished_signal = pyqtSignal(bool, str)
    
    def __init__(self, device, parent=None):
        super().__init__()
        self.device = device
        self.parent_widget = parent
        
    def run(self):
        try:
            wrapper = LibWdiWrapper()
            
            # Get parent window handle if available
            parent_hwnd = None
            if self.parent_widget and hasattr(self.parent_widget, 'winId'):
                parent_hwnd = int(self.parent_widget.winId())
            
            success, message = wrapper.install_winusb_driver(
                self.device,
                progress_callback=self.progress_signal.emit,
                parent_hwnd=parent_hwnd
            )
            
            self.finished_signal.emit(success, message)
            
        except Exception as e:
            self.finished_signal.emit(False, f"Driver installation failed: {str(e)}")

def install_dfu_driver_seamlessly(parent=None):
    """
    Seamlessly install DFU driver using libwdi
    Returns: (success: bool, message: str)
    """
    try:
        if platform.system().lower() != "windows":
            return True, "Driver installation not needed on this platform"
        
        wrapper = LibWdiWrapper()
        dfu_devices = wrapper.find_dfu_devices()
        
        if not dfu_devices:
            return True, "No DFU devices found that need drivers"
        
        # Show devices that will have drivers installed
        device_names = [f"VID:{dev['vid']:04X} PID:{dev['pid']:04X} - {dev['desc']}" for dev in dfu_devices]
        
        reply = QMessageBox.question(
            parent,
            "Install DFU Drivers",
            f"Found {len(dfu_devices)} DFU device(s) that need drivers:\n\n" +
            "\n".join(device_names) +
            "\n\nInstall WinUSB drivers for these devices?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.Yes
        )
        
        if reply != QMessageBox.StandardButton.Yes:
            return False, "User cancelled driver installation"
        
        # Install drivers for all devices
        progress = QProgressDialog("Installing DFU drivers...", "Cancel", 0, len(dfu_devices), parent)
        progress.setWindowModality(Qt.WindowModality.WindowModal)
        progress.show()
        
        for i, device in enumerate(dfu_devices):
            if progress.wasCanceled():
                return False, "Driver installation cancelled by user"
            
            progress.setLabelText(f"Installing driver for {device['desc']}...")
            progress.setValue(i)
            
            success, message = wrapper.install_winusb_driver(device)
            if not success:
                progress.close()
                return False, f"Failed to install driver for {device['desc']}: {message}"
        
        progress.setValue(len(dfu_devices))
        progress.close()
        
        return True, f"Successfully installed drivers for {len(dfu_devices)} device(s)"
        
    except Exception as e:
        return False, f"Driver installation failed: {str(e)}"
