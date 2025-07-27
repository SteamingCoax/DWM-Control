#!/bin/bash
# Development script for DWM Control Electron app

echo "Starting DWM Control Electron App..."

cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Run the electron app
echo "Launching application..."
./node_modules/.bin/electron .
