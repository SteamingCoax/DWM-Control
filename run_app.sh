#!/bin/bash

# DWM-Control startup script with proper Qt environment
# This script sets up the Qt platform plugin path for macOS and applies modern styling

echo "🚀 Starting DWM-Control with enhanced UI..."

# Activate conda environment
source /opt/anaconda3/etc/profile.d/conda.sh
conda activate DWM_env

# Set Qt platform plugin path
export QT_QPA_PLATFORM_PLUGIN_PATH=/opt/anaconda3/envs/DWM_env/lib/python3.12/site-packages/PyQt6/Qt6/plugins/platforms

# Set Qt scaling for high DPI displays
export QT_AUTO_SCREEN_SCALE_FACTOR=1
export QT_ENABLE_HIGHDPI_SCALING=1

echo "✅ Environment configured"
echo "🎨 Launching with modern dark theme..."

# Run the application
python DWM-Control.py
