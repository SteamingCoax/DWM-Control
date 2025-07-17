#!/bin/bash

# Installation script for DWM-Control PyQt6 dependencies

echo "Installing PyQt6 dependencies for DWM-Control..."

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed or not in PATH"
    exit 1
fi

# Install PyQt6
echo "Installing PyQt6..."
pip3 install PyQt6

# Install other requirements
echo "Installing other requirements..."
pip3 install -r requirements.txt

echo "Installation complete!"
echo "You can now run the application with: python3 DWM-Control.py"
