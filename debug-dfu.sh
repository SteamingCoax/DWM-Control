#!/bin/bash
# DFU Debug Test for macOS/Linux

echo "=== DFU DEBUGGING SCRIPT ==="
echo "Date: $(date)"
echo "Platform: $(uname -s)"
echo "Working Directory: $(pwd)"
echo ""

# Test 1: Check if dfu-util exists
echo "1. Checking for dfu-util..."
if command -v dfu-util &> /dev/null; then
    echo "✓ dfu-util found in PATH"
    dfu-util --version
    DFUUTIL_CMD="dfu-util"
elif [ -f "Programs/dfu-util/dfu-util" ]; then
    echo "✓ dfu-util found in Programs/dfu-util/"
    ./Programs/dfu-util/dfu-util --version
    DFUUTIL_CMD="./Programs/dfu-util/dfu-util"
else
    echo "✗ dfu-util not found!"
    echo "Please install dfu-util with: brew install dfu-util"
    exit 1
fi
echo ""

# Test 2: Check USB permissions
echo "2. Checking USB permissions..."
ls -la /dev/cu.* 2>/dev/null | head -5
echo ""

# Test 3: List DFU devices
echo "3. Scanning for DFU devices..."
echo "Command: $DFUUTIL_CMD -l"
OUTPUT=$($DFUUTIL_CMD -l 2>&1)
EXIT_CODE=$?

echo "Exit code: $EXIT_CODE"
echo "Raw output:"
echo "--------"
echo "$OUTPUT"
echo "--------"
echo ""

# Test 4: Parse the output
echo "4. Analyzing output..."
if echo "$OUTPUT" | grep -q "Found DFU"; then
    echo "✓ DFU devices detected!"
    echo "DFU lines:"
    echo "$OUTPUT" | grep "Found DFU"
else
    echo "✗ No DFU devices found"
    if echo "$OUTPUT" | grep -q "No DFU capable USB device"; then
        echo "Reason: No DFU devices connected or not in DFU mode"
    elif echo "$OUTPUT" | grep -q "Permission denied"; then
        echo "Reason: Permission issue - try with sudo or check USB permissions"
    else
        echo "Reason: Unknown - check raw output above"
    fi
fi
echo ""

# Test 5: Node.js parsing test
echo "5. Testing Node.js parsing..."
if command -v node &> /dev/null; then
    cat > temp_parse_test.js << 'EOF'
function parseDfuDevices(output) {
  const devices = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (line.includes('Found DFU')) {
      console.log('Processing line:', line);
      const match = line.match(/Found DFU: \[([0-9a-f]{4}):([0-9a-f]{4})\]/i);
      if (match) {
        const vid = match[1];
        const pid = match[2];
        
        let serial = 'unknown';
        const serialMatch = line.match(/serial="([^"]+)"/);
        if (serialMatch) {
          serial = serialMatch[1];
        } else {
          const altSerialMatch = line.match(/serial=([^\s,]+)/);
          if (altSerialMatch) {
            serial = altSerialMatch[1];
          }
        }
        
        let altInterface = 0;
        const altMatch = line.match(/alt=(\d+)/);
        if (altMatch) {
          altInterface = parseInt(altMatch[1]);
        }
        
        let interfaceName = '';
        const nameMatch = line.match(/name="([^"]+)"/);
        if (nameMatch) {
          interfaceName = nameMatch[1];
        }
        
        devices.push({
          vid: vid,
          pid: pid,
          serial: serial,
          alt: altInterface,
          name: interfaceName,
          description: line.trim()
        });
      } else {
        console.log('No regex match for line:', line);
      }
    }
  }
  
  // Group by device
  const deviceMap = {};
  for (const device of devices) {
    const key = `${device.vid}:${device.pid}:${device.serial}`;
    if (!deviceMap[key] || 
        device.alt === 0 || 
        device.name.toLowerCase().includes('internal flash')) {
      deviceMap[key] = device;
    }
  }
  
  return Object.values(deviceMap);
}

const testOutput = process.argv[2] || '';
const devices = parseDfuDevices(testOutput);
console.log('Parsed devices:', JSON.stringify(devices, null, 2));
console.log('Device count:', devices.length);
EOF

    node temp_parse_test.js "$OUTPUT"
    rm temp_parse_test.js
else
    echo "Node.js not found - skipping parsing test"
fi
echo ""

echo "=== INSTRUCTIONS ==="
echo "If no devices found:"
echo "1. Put your device in DFU mode (usually hold BOOT button while connecting USB)"
echo "2. Check USB cable and port"
echo "3. On macOS, may need to install libusb: brew install libusb"
echo "4. Try running with sudo if permission issues"
echo ""
echo "If devices found but app doesn't show them:"
echo "1. Check the app's console for errors"
echo "2. Restart the app to reload any code changes"
echo "3. Run the dfu-debug.js script in the app's browser console"
echo ""
