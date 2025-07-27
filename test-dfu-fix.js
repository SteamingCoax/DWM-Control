// Quick Node.js test to verify the fix
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function getDfuUtilPath() {
  const isDev = process.env.NODE_ENV === 'development';
  const basePath = isDev ? __dirname : process.resourcesPath;
  
  if (process.platform === 'win32') {
    return path.join(basePath, 'Programs', 'dfu-util', 'dfu-util.exe');
  } else if (process.platform === 'darwin') {
    // On macOS, first try to use the system dfu-util if available
    return 'dfu-util';
  } else {
    // For Linux, try the bundled version first, fallback to system
    const bundledPath = path.join(basePath, 'Programs', 'dfu-util', 'dfu-util');
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }
    return 'dfu-util';
  }
}

function testDfuUtilPath() {
  console.log('=== Testing DFU Util Path Logic ===');
  console.log('Platform:', process.platform);
  
  const dfuUtilPath = getDfuUtilPath();
  console.log('DFU Util Path:', dfuUtilPath);
  
  const isSystemCommand = process.platform !== 'win32' && dfuUtilPath === 'dfu-util';
  console.log('Is System Command:', isSystemCommand);
  
  if (!isSystemCommand) {
    console.log('File exists check:', fs.existsSync(dfuUtilPath));
  } else {
    console.log('Skipping file exists check for system command');
  }
  
  // Test actual spawn
  console.log('\nTesting spawn...');
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
    
    if (stdout.includes('Found DFU')) {
      console.log('✅ DFU devices detected via spawn!');
      const dfuLines = stdout.split('\n').filter(line => line.includes('Found DFU'));
      console.log('DFU device count:', dfuLines.length);
    } else {
      console.log('❌ No DFU devices found');
    }
  });
  
  child.on('error', (error) => {
    console.log('❌ Spawn error:', error.message);
  });
}

testDfuUtilPath();
