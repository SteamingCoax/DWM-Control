# Runtime hook for PyQt6
# This runs when the executable starts and ensures PyQt6 can be found

import sys
import os

# Get the directory where the executable is running
if hasattr(sys, '_MEIPASS'):
    # PyInstaller frozen environment
    bundle_dir = sys._MEIPASS
else:
    # Development environment
    bundle_dir = os.path.dirname(os.path.abspath(__file__))

# Add PyQt6 paths to sys.path
pyqt6_paths = [
    os.path.join(bundle_dir, 'PyQt6'),
    os.path.join(bundle_dir, 'PyQt6', 'QtWidgets'),
    os.path.join(bundle_dir, 'PyQt6', 'QtCore'),
    os.path.join(bundle_dir, 'PyQt6', 'QtGui'),
]

for path in pyqt6_paths:
    if os.path.exists(path) and path not in sys.path:
        sys.path.insert(0, path)

# Ensure PyQt6 can be imported
try:
    import PyQt6
    import PyQt6.QtWidgets
    import PyQt6.QtCore
    import PyQt6.QtGui
except ImportError as e:
    print(f"Runtime hook: Failed to import PyQt6: {e}")
    # Try to find PyQt6 in the bundle
    import glob
    pyqt_files = glob.glob(os.path.join(bundle_dir, '**/PyQt6*'), recursive=True)
    print(f"Runtime hook: Found PyQt6 files: {pyqt_files}")
