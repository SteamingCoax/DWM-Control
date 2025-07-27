// Windows App Debug - Paste this into the app's Developer Console (F12)
// This will help diagnose why the app isn't showing DFU devices on Windows

console.log('=== WINDOWS APP DFU DEBUG ===');

async function windowsAppDebug() {
    try {
        console.log('1. Testing electronAPI availability...');
        if (typeof window.electronAPI === 'undefined') {
            console.error('❌ window.electronAPI is not available');
            return;
        }
        console.log('✅ window.electronAPI is available');
        
        if (typeof window.electronAPI.getDfuDevices !== 'function') {
            console.error('❌ getDfuDevices method not found');
            return;
        }
        console.log('✅ getDfuDevices method is available');
        
        console.log('\n2. Calling getDfuDevices...');
        const result = await window.electronAPI.getDfuDevices();
        
        console.log('\n3. Raw result from main process:');
        console.log('Success:', result.success);
        console.log('Error:', result.error);
        console.log('Devices:', result.devices);
        console.log('Device count:', result.devices ? result.devices.length : 'undefined');
        console.log('Needs setup:', result.needsSetup);
        console.log('Windows help:', result.windowsHelp);
        console.log('Raw output length:', result.output ? result.output.length : 'no output');
        
        if (result.output) {
            console.log('\n4. Raw dfu-util output:');
            console.log(result.output);
            
            console.log('\n5. Lines containing "Found DFU":');
            const lines = result.output.split('\n');
            const dfuLines = lines.filter(line => line.includes('Found DFU'));
            console.log('DFU line count:', dfuLines.length);
            dfuLines.forEach((line, index) => {
                console.log(`  Line ${index + 1}:`, line);
            });
        }
        
        console.log('\n6. Checking device dropdown state...');
        const deviceCombo = document.getElementById('device-combo');
        if (deviceCombo) {
            console.log('Device combo found:', true);
            console.log('Options count:', deviceCombo.options.length);
            for (let i = 0; i < deviceCombo.options.length; i++) {
                console.log(`  Option ${i}:`, deviceCombo.options[i].text);
            }
        } else {
            console.log('❌ Device combo not found');
        }
        
        console.log('\n7. Testing manual refresh...');
        if (typeof window.app !== 'undefined' && typeof window.app.refreshDfuDevices === 'function') {
            console.log('Calling app.refreshDfuDevices()...');
            await window.app.refreshDfuDevices();
            console.log('✅ Manual refresh completed');
        } else {
            console.log('❌ app.refreshDfuDevices not available');
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Error in debug:', error);
        console.error(error.stack);
    }
}

// Run the debug
windowsAppDebug().then(result => {
    console.log('\n=== DEBUG COMPLETE ===');
    if (result && result.success && result.devices && result.devices.length > 0) {
        console.log('🎉 Devices detected by main process but not showing in UI');
        console.log('This suggests an issue with the renderer process or UI update');
    } else {
        console.log('❌ No devices detected by main process');
        console.log('This suggests an issue with the main process DFU detection');
    }
});
