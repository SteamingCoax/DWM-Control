#!/bin/bash

# Convert .ui files to Python files using pyuic6
# This script converts all .ui files in the ui directory to Python files

# Activate conda environment
source /opt/anaconda3/etc/profile.d/conda.sh
conda activate DWM_env

echo "Converting .ui files to Python..."

# Create generated directory if it doesn't exist
mkdir -p ui/generated

# Convert each .ui file to Python
for ui_file in ui/*.ui; do
    if [ -f "$ui_file" ]; then
        # Get filename without extension
        basename=$(basename "$ui_file" .ui)
        output_file="ui/generated/ui_${basename}.py"
        
        echo "Converting $ui_file to $output_file"
        
        # Use pyuic6 to convert .ui to .py
        python -m PyQt6.uic.pyuic "$ui_file" -o "$output_file"
        
        if [ $? -eq 0 ]; then
            echo "✓ Successfully converted $ui_file"
        else
            echo "✗ Failed to convert $ui_file"
        fi
    fi
done

echo "Conversion complete!"
echo "Generated Python files are in ui/generated/"
