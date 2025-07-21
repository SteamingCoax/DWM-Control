#!/usr/bin/env python3

# PyInstaller hook for PyQt6
# This ensures all PyQt6 modules are properly included

from PyInstaller.utils.hooks import collect_all, collect_submodules, collect_data_files

# Collect all PyQt6 modules and data
datas, binaries, hiddenimports = collect_all('PyQt6')

# Ensure critical PyQt6 modules are explicitly included
hiddenimports += [
    'PyQt6',
    'PyQt6.QtWidgets',
    'PyQt6.QtCore',
    'PyQt6.QtGui',
    'PyQt6.sip',
    'PyQt6.Qt',
]

# Collect all submodules to be extra sure
hiddenimports += collect_submodules('PyQt6')
