#!/bin/bash

# Launch Qt Designer for creating UI files
# Make sure Qt Creator is installed via: brew install qt-creator

echo "Launching Qt Designer..."
echo "Create your .ui files in the 'ui' directory"

# Launch Qt Designer (part of Qt Creator)
open -a "Qt Creator"

echo "Qt Designer launched!"
echo ""
echo "After creating .ui files:"
echo "1. Save them in the 'ui' directory"
echo "2. Run ./convert_ui.sh to generate Python files"
echo "3. Use the generated files in your application"
