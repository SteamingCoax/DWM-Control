// Test the manual conversion approach
const fs = require('fs');

function testConversion(hexFilePath) {
  try {
    const hexData = fs.readFileSync(hexFilePath, 'utf8');
    console.log(`Converting hex file: ${hexFilePath}`);
    
    // Parse the hex file manually to avoid memory issues
    const lines = hexData.split('\n').filter(line => line.trim().startsWith(':'));
    console.log(`Processing ${lines.length} hex lines`);
    
    // Find the address range
    let minAddr = 0x08000000; // STM32 flash start
    let maxAddr = 0x08000000;
    let baseAddr = 0;
    
    // First pass: find the actual address range
    for (const line of lines) {
      if (line.length < 11) continue;
      
      const recType = parseInt(line.substr(7, 2), 16);
      if (recType === 0x04) { // Extended Linear Address
        baseAddr = parseInt(line.substr(9, 4), 16) << 16;
      } else if (recType === 0x00) { // Data record
        const addr = baseAddr + parseInt(line.substr(3, 4), 16);
        const dataLen = parseInt(line.substr(1, 2), 16);
        minAddr = Math.min(minAddr, addr);
        maxAddr = Math.max(maxAddr, addr + dataLen - 1);
      }
    }
    
    console.log(`Address range: 0x${minAddr.toString(16)} - 0x${maxAddr.toString(16)}`);
    
    const size = maxAddr - minAddr + 1;
    console.log(`Binary size would be: ${size} bytes (${(size/1024).toFixed(1)} KB)`);
    
    if (size > 1024 * 1024) { // 1MB limit
      throw new Error(`Firmware too large: ${size} bytes`);
    }
    
    return { success: true, size, minAddr, maxAddr };
  } catch (error) {
    console.error('Conversion test error:', error);
    return { success: false, error: error.message };
  }
}

console.log('Testing manual conversion approach...');
const firmwareFile = '/Users/robertcecere/Desktop/DWM-Control/Test_Firmware/DWM_V2_3_2.hex';

if (fs.existsSync(firmwareFile)) {
    const result = testConversion(firmwareFile);
    console.log('Test result:', result);
} else {
    console.log('Firmware file not found');
}
