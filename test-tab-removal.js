// Test script to verify tab management removal
// Run this in the browser console to test tab functionality

console.log('Testing tab functionality after removing tab management...');

// Test 1: Check if tabSettings exists
if (window.dwm && window.dwm.tabSettings) {
    console.log('✅ tabSettings found:', window.dwm.tabSettings);
} else {
    console.log('❌ tabSettings not found');
}

// Test 2: Check if old tab management methods are removed
const oldMethods = ['enableTab', 'disableTab', 'toggleTab', 'updateTabConfig', 'updateTabManagementUI'];
const removedMethods = oldMethods.filter(method => !window.dwm[method]);
console.log('✅ Removed methods:', removedMethods.length, '/', oldMethods.length);

// Test 3: Check if tabs getter is removed
if (!window.dwm.tabs) {
    console.log('✅ tabs getter removed');
} else {
    console.log('❌ tabs getter still exists');
}

// Test 4: Test tab visibility
const visibleTabs = Array.from(document.querySelectorAll('.tab-button')).filter(tab => 
    tab.style.display !== 'none'
);
console.log('✅ Visible tabs:', visibleTabs.length);

// Test 5: Check if active tab exists
const activeTab = document.querySelector('.tab-button.active');
if (activeTab) {
    console.log('✅ Active tab:', activeTab.getAttribute('data-tab'));
} else {
    console.log('❌ No active tab found');
}

console.log('Tab management removal test complete!');
