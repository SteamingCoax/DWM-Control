// Standalone DFU parsing test for Windows
// Run this with: node test-dfu-parsing-windows.js

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseDfuDevices(output) {
  const devices = [];
  const lines = output.split('\n');
  
  console.log('=== PARSING DEBUG ===');
  console.log('Total lines:', lines.length);
  console.log('Looking for lines containing "Found DFU"...');
  
  for (const line of lines) {
    if (line.includes('Found DFU')) {
      console.log('Processing line:', line);
      
      // More flexible regex to match different dfu-util output formats
      const match = line.match(/Found DFU: \[([0-9a-f]{4}):([0-9a-f]{4})\]/i);
      if (match) {
        const vid = match[1];
        const pid = match[2];
        
        // Extract serial number - try multiple patterns
        let serial = 'unknown';
        const serialMatch = line.match(/serial="([^"]+)"/);
        if (serialMatch) {
          serial = serialMatch[1];
        } else {
          // Alternative pattern if serial is at the end without quotes
          const altSerialMatch = line.match(/serial=([^\s,]+)/);
          if (altSerialMatch) {
            serial = altSerialMatch[1];
          }
        }
        
        // Extract alt interface number for better identification
        let altInterface = 0;
        const altMatch = line.match(/alt=(\d+)/);
        if (altMatch) {
          altInterface = parseInt(altMatch[1]);
        }
        
        // Extract interface name if available
        let interfaceName = '';
        const nameMatch = line.match(/name="([^"]+)"/);
        if (nameMatch) {
          interfaceName = nameMatch[1];
        }
        
        const device = {
          vid: vid,
          pid: pid,
          serial: serial,
          alt: altInterface,
          name: interfaceName,
          description: line.trim()
        };
        
        console.log('  Parsed device:', device);
        devices.push(device);
      } else {
        console.log('  No regex match for line:', line);
      }
    }
  }
  
  console.log('Raw devices found:', devices.length);
  
  // Group by device (same VID:PID:Serial) and keep only the main flash interface (usually alt=0)
  const deviceMap = {};
  for (const device of devices) {
    const key = `${device.vid}:${device.pid}:${device.serial}`;
    
    // Prefer the main flash interface (alt=0) or "Internal Flash" interface
    if (!deviceMap[key] || 
        device.alt === 0 || 
        device.name.toLowerCase().includes('internal flash')) {
      console.log(`  Keeping device ${key} (alt=${device.alt}, name="${device.name}")`);
      deviceMap[key] = device;
    } else {
      console.log(`  Skipping device ${key} (alt=${device.alt}, name="${device.name}")`);
    }
  }
  
  const finalDevices = Object.values(deviceMap);
  console.log('Final devices after grouping:', finalDevices.length);
  return finalDevices;
}

function getDfuUtilPath() {
  if (process.platform === 'win32') {
    return path.join(__dirname, 'Programs', 'dfu-util', 'dfu-util.exe');
  } else {
    return 'dfu-util';
  }
}

async function testDfuDetection() {
  console.log('=== DFU DETECTION TEST ===');
  console.log('Platform:', process.platform);
  
  const dfuUtilPath = getDfuUtilPath();
  console.log('DFU Util Path:', dfuUtilPath);
  
  // Check if dfu-util exists
  const isSystemCommand = process.platform !== 'win32' && dfuUtilPath === 'dfu-util';
  if (!isSystemCommand && !fs.existsSync(dfuUtilPath)) {
    console.log('❌ dfu-util not found at:', dfuUtilPath);
    return;
  }
  console.log('✅ dfu-util found');
  
  return new Promise((resolve) => {
    console.log('\n=== RUNNING DFU-UTIL ===');
    const child = spawn(dfuUtilPath, ['-l']);
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      console.log('Exit code:', code);
      console.log('STDOUT length:', stdout.length);
      console.log('STDERR length:', stderr.length);
      
      if (stderr) {
        console.log('\n=== STDERR ===');
        console.log(stderr);
      }
      
      console.log('\n=== STDOUT ===');
      console.log(stdout);
      
      if (code === 0 || stdout.length > 0) {
        console.log('\n=== PARSING RESULTS ===');
        const devices = parseDfuDevices(stdout);
        
        console.log('\n=== FINAL RESULT ===');
        console.log('Success: true');
        console.log('Device count:', devices.length);
        console.log('Devices:', JSON.stringify(devices, null, 2));
        
        resolve({ success: true, devices, output: stdout });
      } else {
        console.log('\n=== FINAL RESULT ===');
        console.log('Success: false');
        console.log('Error: dfu-util failed');
        resolve({ success: false, error: 'dfu-util failed', output: stderr });
      }
    });
    
    child.on('error', (error) => {
      console.log('❌ Spawn error:', error.message);
      resolve({ success: false, error: error.message, output: '' });
    });
  });
}

// Run the test
testDfuDetection().then(result => {
  console.log('\n=== TEST COMPLETE ===');
  if (result.success && result.devices.length > 0) {
    console.log('🎉 SUCCESS: DFU devices detected and parsed correctly!');
  } else {
    console.log('❌ FAILURE: No devices detected or parsing failed');
  }
});
