// DFU Debug Test - Add this to your renderer.js temporarily for debugging
// Call this function from browser console to test DFU detection

window.debugDFU = async function() {
    console.log('=== DFU DEBUG TEST ===');
    
    try {
        console.log('1. Calling window.electronAPI.getDfuDevices()...');
        const result = await window.electronAPI.getDfuDevices();
        
        console.log('2. Raw result from main process:', result);
        console.log('   - success:', result.success);
        console.log('   - devices array:', result.devices);
        console.log('   - devices length:', result.devices ? result.devices.length : 'undefined');
        console.log('   - error:', result.error);
        console.log('   - output:', result.output);
        
        if (result.devices && result.devices.length > 0) {
            console.log('3. Device details:');
            result.devices.forEach((device, index) => {
                console.log(`   Device ${index}:`, device);
            });
        } else {
            console.log('3. No devices in result');
        }
        
        // Test the parsing function directly if we have output
        if (result.output) {
            console.log('4. Testing parsing with raw output...');
            console.log('   Raw dfu-util output:', result.output);
            
            // Extract lines that contain "Found DFU"
            const lines = result.output.split('\n');
            const dfuLines = lines.filter(line => line.includes('Found DFU'));
            console.log('   Found DFU lines:', dfuLines);
        }
        
    } catch (error) {
        console.error('Error in debugDFU:', error);
    }
    
    console.log('=== END DFU DEBUG ===');
};

// Auto-run debug when this script loads
console.log('DFU Debug loaded. Call debugDFU() to test, or it will auto-run in 2 seconds...');
setTimeout(() => {
    console.log('Auto-running DFU debug...');
    window.debugDFU();
}, 2000);
