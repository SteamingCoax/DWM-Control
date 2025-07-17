#!/bin/bash

# DWM-Control startup script with proper Qt environment
# This script sets up the Qt platform plugin path for macOS

# Activate conda environment
source /opt/anaconda3/etc/profile.d/conda.sh
conda activate DWM_env

# Set Qt platform plugin path
export QT_QPA_PLATFORM_PLUGIN_PATH=/opt/anaconda3/envs/DWM_env/lib/python3.12/site-packages/PyQt6/Qt6/plugins/platforms

# Run the application
python DWM-Control.py
