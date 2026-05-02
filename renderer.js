// DWM Control Electron Renderer

/**
 * DWM Control Application
 * 
 * To enable/disable tabs, modify the tabSettings object in the constructor:
 * - Set to true to show the tab
 * - Set to false to hide the tab
 * - Restart the app for changes to take effect
 * 
 * To enable/disable UI components, modify the uiSettings object in the constructor:
 * - headerConnection: Set to true to show the Serial Communication dropdown, false to hide it
 * - Restart the app for changes to take effect
 */
class DWMControl {
    constructor() {
        this.selectedHexFile = null;
        this.selectedDevice = null;
        this.isUploading = false;
        this.serialConnection = null;
        this.isConnected = false;
        this.outputVisible = false; // Start with output hidden
        this.config = this.loadConfig(); // Load user configuration
        this.meterRegistry = new Map();
        this.activeMeterKey = null;
        this.discoveryIntervalMs = 2000;
        this.discoveryTimer = null;
        this._serialListenerAttached = false; // registered once for all meters
        
        // Tab Configuration - Set to false to hide tabs
        // To enable/disable tabs, change these values and restart the app
        // Example: To hide the terminal tab, set terminal: false
        this.tabSettings = {
            control: true,    // Control panel tab
            firmware: true,   // Firmware Upload tab
            terminal: false,  // Serial Terminal tab  
            deembed: true     // De-Embed tab
        };
        
        // UI Component Configuration - Set to false to hide components
        // To enable/disable UI components, change these values and restart the app
        // Example: To hide the Serial Communication dropdown, set headerConnection: false
        this.uiSettings = {
            headerConnection: false  // Serial Communication Setup interface
        };
        
        this.initializeApp();
        
        // Initialize auto-updater system
        this.setupAutoUpdater();
    }

    initializeApp() {
        console.log('DWM Control: Initializing app...');
        try {
            this.setupTabSwitching();
            console.log('DWM Control: Tab switching setup complete');
            
            this.setupFirmwareUploader();
            console.log('DWM Control: Firmware uploader setup complete');
            
            this.setupDeviceControl();
            console.log('DWM Control: Device control setup complete');
            
            this.setupDeEmbed();
            console.log('DWM Control: De-Embed setup complete');
            
            this.setupThemeToggle();
            console.log('DWM Control: Theme toggle setup complete');
            
            this.setupOutputToggle();
            console.log('DWM Control: Output toggle setup complete');

            this.startMeterDiscoveryLoop();
            console.log('DWM Control: Meter discovery loop started');
            
            this.appendOutput('Application ready. Use the Control tab to connect to your device.');
            console.log('DWM Control: Initialization complete');

            // Display app version in header
            if (window.electronAPI?.getAppVersion) {
                window.electronAPI.getAppVersion().then(v => {
                    const el = document.getElementById('app-version');
                    if (el) el.textContent = `v${v}`;
                }).catch(() => {});
            }
        } catch (error) {
            console.error('DWM Control: Initialization error:', error);
        }
    }

    // Tab Switching Logic
    setupTabSwitching() {
        // Configure tab visibility based on settings
        this.configureTabVisibility();
        
        // Configure UI component visibility
        this.configureUIComponentVisibility();
        
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabPanels = document.querySelectorAll('.tab-panel');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Remove active class from all buttons and panels
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanels.forEach(panel => panel.classList.remove('active'));
                
                // Add active class to clicked button and corresponding panel
                button.classList.add('active');
                document.getElementById(`${targetTab}-panel`).classList.add('active');
            });
        });
        
        // Set first visible tab as active if none are active
        this.ensureActiveTab();
    }

    configureTabVisibility() {
        // Hide/show tabs based on tabSettings configuration
        Object.entries(this.tabSettings).forEach(([tabKey, enabled]) => {
            const tabButton = document.querySelector(`[data-tab="${tabKey}"]`);
            const tabPanel = document.getElementById(`${tabKey}-panel`);
            
            if (tabButton && tabPanel) {
                if (enabled) {
                    tabButton.style.display = 'flex';
                } else {
                    tabButton.style.display = 'none';
                    tabPanel.classList.remove('active');
                }
            }
        });
    }

    configureUIComponentVisibility() {
        // Hide/show UI components based on uiSettings configuration
        Object.entries(this.uiSettings).forEach(([componentKey, enabled]) => {
            if (componentKey === 'headerConnection') {
                const connectionPanel = document.querySelector('.connection-panel');
                
                if (connectionPanel) {
                    if (enabled) {
                        connectionPanel.style.display = 'flex';
                    } else {
                        connectionPanel.style.display = 'none';
                    }
                }
            }
        });
    }

    ensureActiveTab() {
        // Check if any tab is currently active and visible
        const activeTab = document.querySelector('.tab-button.active');
        const activePanel = document.querySelector('.tab-panel.active');
        
        // If no active tab or the active tab is hidden, activate the first enabled tab
        if (!activeTab || activeTab.style.display === 'none' || !activePanel) {
            // Find first enabled tab
            const firstEnabledTabKey = Object.keys(this.tabSettings).find(tabKey => 
                this.tabSettings[tabKey]
            );
            
            if (firstEnabledTabKey) {
                // Remove all active states
                document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
                
                // Activate first enabled tab
                const tabButton = document.querySelector(`[data-tab="${firstEnabledTabKey}"]`);
                const tabPanel = document.getElementById(`${firstEnabledTabKey}-panel`);
                
                if (tabButton && tabPanel) {
                    tabButton.classList.add('active');
                    tabPanel.classList.add('active');
                }
            }
        }
    }

    // Firmware Uploader Setup
    setupFirmwareUploader() {
        // File upload area setup
        const uploadArea = document.getElementById('file-upload-area');
        const selectFileBtn = document.getElementById('select-file-btn');
        const downloadLatestBtn = document.getElementById('download-latest-btn');
        const fileInfo = document.getElementById('file-info');
        const clearFileBtn = document.getElementById('clear-file-btn');

        // Download latest firmware button
        downloadLatestBtn.addEventListener('click', async () => {
            await this.downloadLatestFirmware();
        });

        // Select file button click - use native Electron dialog
        selectFileBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent bubbling to upload area
            this.selectHexFile();
        });

        // Clear file button
        clearFileBtn.addEventListener('click', () => {
            this.selectedHexFile = null;
            this.expectedFileSize = null;
            fileInfo.style.display = 'none';
            document.getElementById('upload-btn').disabled = true;
        });
        
        // Click to select file
        uploadArea.addEventListener('click', () => {
            this.selectHexFile();
        });
        
        // Drag and drop functionality
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                if (file.name.toLowerCase().endsWith('.hex')) {
                    this.handleFileSelection(file.path);
                } else {
                    this.appendOutput(' Please select a .hex firmware file');
                }
            }
        });

        // Refresh devices button
        document.getElementById('refresh-devices-btn').addEventListener('click', async () => {
            await this.refreshDfuDevices();
        });

        // Launch Zadig button (Windows-only optional control)
        const launchZadigBtn = document.getElementById('launch-zadig-btn');
        if (launchZadigBtn) {
            launchZadigBtn.addEventListener('click', async () => {
                await this.launchZadig();
            });
        }

        // Upload button
        document.getElementById('upload-btn').addEventListener('click', async () => {
            await this.uploadFirmware();
        });

        // Listen for upload progress
        window.electronAPI.onUploadProgress((event, data) => {
            // Handle raw dfu-util output (comes as string)
            if (typeof data === 'string') {
                // Clean up the output and display it in upload output
                const cleanLine = data.trim();
                if (cleanLine) {
                    this.appendSerialMonitor(`dfu-util: ${cleanLine}`);
                    
                    // Parse progress from dfu-util output
                    this.parseProgressFromDfuOutput(cleanLine);
                }
            } else {
                // Handle structured data (backwards compatibility)
                this.appendSerialMonitor(data.message || data);
                
                // Update progress bar if percentage is provided
                if (data.percentage !== undefined) {
                    this.updateProgressBar(data.percentage, data.message);
                }
            }
        });
    }

    // Write data to a specific serial port
    async writeSerialData(portPath, data) {
        try {
            const result = await window.electronAPI.writeSerial(portPath, data);
            if (!result.success) {
                this.appendOutput(`Serial write error: ${result.error}`);
            }
            return result;
        } catch (error) {
            this.appendOutput(`Failed to write serial data: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // Device Control Setup
    setupDeviceControl() {
        this.renderDeviceControlUI();
        this.setupDeviceControlEvents();
        this.attachDeviceControlSerialListener();
    }

    startMeterDiscoveryLoop() {
        if (this.discoveryTimer) {
            clearInterval(this.discoveryTimer);
        }

        this.scanAndSyncMeters({ allowAutoConnect: true });
        this.discoveryTimer = window.setInterval(() => {
            this.scanAndSyncMeters({ allowAutoConnect: true });
        }, this.discoveryIntervalMs);
    }

    parseUsbModemUid(portPath) {
        if (!portPath) {
            return null;
        }

        const match = String(portPath).match(/usbmodem([A-Za-z0-9]+)/i);
        return match ? match[1] : null;
    }

    isMeterPort(port) {
        // Primary match: USB product string "DWM V2 ComPort" — set on all DWM V2 devices.
        // serialport exposes it via the manufacturer field on all platforms.
        const manufacturer = (port?.manufacturer || '').toLowerCase();
        if (manufacturer.includes('dwm v2')) return true;

        // Secondary match: Windows friendly name may also carry the product string.
        const friendlyName = (port?.friendlyName || '').toLowerCase();
        if (friendlyName.includes('dwm v2')) return true;

        // Tertiary: VID 0483 + PID 5740 (STM32 CDC) with a USB-origin pnpId on Windows,
        // or vendorId/productId fields on macOS/Linux — guards against other STM32 devices
        // by requiring both the correct VID and PID together.
        const vid = (port?.vendorId || '').toLowerCase().replace(/^0x/, '');
        const pid = (port?.productId || '').toLowerCase().replace(/^0x/, '');
        if (vid === '0483' && pid === '5740') return true;

        // Windows fallback when vendorId/productId fields are unpopulated
        const pnpId = (port?.pnpId || '');
        if (/VID_0483/i.test(pnpId) && /PID_5740/i.test(pnpId)) return true;

        return false;
    }

    buildMeterKey(port) {
        // macOS: use the usbmodem UID from the path
        const fallbackUid = this.parseUsbModemUid(port?.path);
        if (fallbackUid) return `usbmodem:${fallbackUid}`;

        // Windows / Linux: prefer the USB serial number from pnpId for a stable key
        // pnpId format: USB\VID_xxxx&PID_xxxx\SERIAL  (last backslash-separated segment)
        const pnpId = port?.pnpId || '';
        const snMatch = pnpId.match(/\\([A-Za-z0-9]+)$/);
        if (snMatch && snMatch[1].length >= 4) return `usbserial:${snMatch[1]}`;

        return `port:${port?.path || 'unknown'}`;
    }

    getMeterRecordByPortPath(portPath) {
        for (const record of this.meterRegistry.values()) {
            if (record.portPath === portPath) {
                return record;
            }
        }

        return null;
    }

    upsertMeterRecordFromPort(port) {
        const key = this.buildMeterKey(port);
        const existing = this.meterRegistry.get(key) || {};
        const nextRecord = {
            key,
            portPath: port.path,
            friendlyName: existing.friendlyName || port.friendlyName || 'DWM V2',
            fallbackUid: this.parseUsbModemUid(port.path),
            apiUid: existing.apiUid || null,
            connectionState: existing.connectionState || 'available',
            state: existing.state || null,
            lastSeenAt: Date.now(),
            // Preserve user-chosen gauge metrics across record refreshes
            gaugeMetricL: existing.gaugeMetricL || 'avg',
            gaugeMetricR: existing.gaugeMetricR || 'peak',
            gaugeDisplayL: existing.gaugeDisplayL || 'gauge',
            gaugeDisplayR: existing.gaugeDisplayR || 'gauge',
            pepHoldMs: Number.isFinite(existing.pepHoldMs) ? existing.pepHoldMs : 1000,
            elementId: Number.isFinite(existing.elementId) ? existing.elementId : 1,
            elementRating: Number.isFinite(existing.elementRating) ? existing.elementRating : 0,
            elementType: existing.elementType || '30ua',
            elementProfiles: Array.isArray(existing.elementProfiles) ? existing.elementProfiles : [],
            rangeMultiplier: Number.isFinite(existing.rangeMultiplier) ? existing.rangeMultiplier : 1,
            rangeCfg: Number.isFinite(existing.rangeCfg) ? existing.rangeCfg : 0,
        };

        this.meterRegistry.set(key, nextRecord);

        if (!Array.isArray(this.config.meterCardOrder)) {
            this.config.meterCardOrder = [];
        }

        if (!this.config.meterCardOrder.includes(key)) {
            this.config.meterCardOrder.push(key);
            this.saveConfig();
        }

        return nextRecord;
    }

    removeMissingMeterRecords(activeKeys) {
        const nextOrder = [];
        let changed = false;

        this.config.meterCardOrder.forEach((key) => {
            if (activeKeys.has(key)) {
                nextOrder.push(key);
            } else {
                changed = true;
            }
        });

        if (changed) {
            this.config.meterCardOrder = nextOrder;
            this.saveConfig();
        }

        for (const [key, record] of this.meterRegistry.entries()) {
            if (!activeKeys.has(key)) {
                if (record.connectionState === 'connected') {
                    this.stopMeterMonitoring(key, true);
                }
                if (this.activeMeterKey === key) {
                    this.activeMeterKey = null;
                }
                this.meterRegistry.delete(key);
                this.appendOutput(`Meter removed: ${record.portPath}`);
            }
        }
    }

    choosePreferredMeterForAutoConnect() {
        if (!Array.isArray(this.config.meterCardOrder) || this.config.meterCardOrder.length === 0) {
            return null;
        }

        for (const key of this.config.meterCardOrder) {
            const record = this.meterRegistry.get(key);
            if (record && record.connectionState === 'available') {
                return record;
            }
        }

        return null;
    }

    async scanAndSyncMeters(options = {}) {
        const allowAutoConnect = options.allowAutoConnect !== false;

        try {
            const result = await window.electronAPI.getSerialPorts();
            if (!result.success) {
                return;
            }

            const meterPorts = (result.ports || []).filter((port) => this.isMeterPort(port));
            const activeKeys = new Set();

            meterPorts.forEach((port) => {
                const record = this.upsertMeterRecordFromPort(port);
                activeKeys.add(record.key);
                // Only reset to 'available' if not currently connected or manually disconnected
                if (record.connectionState !== 'connected' && record.connectionState !== 'disconnected') {
                    record.connectionState = 'available';
                }
            });

            this.removeMissingMeterRecords(activeKeys);
            this.refreshMeterBoard();

            if (allowAutoConnect) {
                for (const record of this.meterRegistry.values()) {
                    if (record.connectionState === 'available') {
                        await this.connectMeter(record.key, { autoConnect: true });
                    }
                }
            }
        } catch (error) {
            this.appendOutput(`Meter discovery error: ${error.message}`);
        }
    }

    setupThemeToggle() {
        const themeToggle = document.getElementById('theme-toggle');
        const themeIcon = themeToggle.querySelector('.btn-icon');

        // Set theme from config (defaults to dark)
        this.setTheme(this.config.theme);

        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            this.setTheme(newTheme);
            this.config.theme = newTheme;
            this.saveConfig();
            // Repaint all meter canvases with the new palette
            if (this.modules?.control?.meterRegistry) {
                for (const key of this.modules.control.meterRegistry.keys()) {
                    const resp = this.modules.control.meterRegistry.get(key)?.state?.lastSnapshotResponse;
                    if (resp) this.modules.control._updateMeterGauges(key, resp);
                    this.modules.control._drawMeterHistory(key);
                }
            }
        });
    }

    setTheme(theme) {
        const themeIcon = document.querySelector('#theme-toggle .btn-icon');

        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
            document.getElementById('theme-toggle').title = 'Switch to Light Mode';
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            themeIcon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
            document.getElementById('theme-toggle').title = 'Switch to Dark Mode';
        }
    }

    setupOutputToggle() {
        const outputSection = document.getElementById('output-section');
        const toggleBtn = document.getElementById('toggle-output-btn');
        const clearConsoleBtn = document.getElementById('clear-console-btn');
        const clearSerialMonitorBtn = document.getElementById('clear-serial-monitor-btn');

        // Set initial state from config
        if (!this.config.outputVisible) {
            outputSection.style.display = 'none';
            toggleBtn.innerHTML = '<span class="btn-icon"></span> Show Output';
        } else {
            outputSection.style.display = 'block';
            toggleBtn.innerHTML = '<span class="btn-icon"></span> Hide Output';
        }

        toggleBtn.addEventListener('click', () => {
            this.config.outputVisible = !this.config.outputVisible;
            this.saveConfig();

            if (this.config.outputVisible) {
                outputSection.style.display = 'block';
                toggleBtn.innerHTML = '<span class="btn-icon"></span> Hide Output';
            } else {
                outputSection.style.display = 'none';
                toggleBtn.innerHTML = '<span class="btn-icon"></span> Show Output';
            }
        });

        // Clear console button
        if (clearConsoleBtn) {
            clearConsoleBtn.addEventListener('click', () => {
                const output = document.getElementById('output-console');
                if (output) {
                    output.textContent = '';
                }
            });
        }

        // Clear upload output button
        if (clearSerialMonitorBtn) {
            clearSerialMonitorBtn.addEventListener('click', () => {
                this.clearSerialMonitor();
            });
        }
    }

    // Control methods are attached from renderer/modules/control.js
    // Firmware methods are attached from renderer/modules/firmware.js
    // De-Embed methods are attached from renderer/modules/deembed.js
    // Auto-updater, output, and configuration methods are attached from renderer/modules/extensions.js

}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dwm = new DWMControl();
    console.log('DWM Control initialized.');
});
