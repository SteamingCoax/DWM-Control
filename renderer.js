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
// USB product IDs (lower-case hex) a DWM V2 presents in normal operation, all under VID 0483:
// 5740 (ST generic CDC, older firmware) and a59c (assigned by ST to the DWM V2).
const DWM_V2_APP_PIDS = ['5740', 'a59c'];

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
            deembed: true,    // De-Embed tab
            siteview: true    // Site View schematic builder tab
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

        // Wire native macOS menu actions → in-app actions
        this.setupNativeMenuActions();
        this.setupAccessibility();
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
            
            this.setupSiteView();
            console.log('DWM Control: Site View setup complete');
            
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

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.activateTab(button.getAttribute('data-tab'));
            });
        });

        const tabNav = document.querySelector('.tab-navigation');
        if (tabNav) {
            tabNav.addEventListener('keydown', (event) => this._onTabListKeydown(event));
        }

        // Set first visible tab as active if none are active
        this.ensureActiveTab();
    }

    // Select a tab: button state (class, aria-selected, roving tabindex) and panel visibility.
    activateTab(tabKey) {
        const buttons = Array.from(document.querySelectorAll('.tab-button'));
        const panels = Array.from(document.querySelectorAll('.tab-panel'));
        const target = buttons.find(btn => btn.getAttribute('data-tab') === tabKey);
        if (!target) return null;

        buttons.forEach(btn => {
            const on = btn === target;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
            btn.setAttribute('tabindex', on ? '0' : '-1');
        });
        panels.forEach(panel => {
            const on = panel.id === `${tabKey}-panel`;
            panel.classList.toggle('active', on);
            panel.hidden = !on;
            if (on) panel.removeAttribute('hidden');
            else panel.setAttribute('hidden', '');
        });
        return target;
    }

    _onTabListKeydown(event) {
        const current = event.target;
        if (!current || !current.classList || !current.classList.contains('tab-button')) return;
        const visible = Array.from(document.querySelectorAll('.tab-button'))
            .filter(btn => btn.style.display !== 'none');
        const index = visible.indexOf(current);
        if (index === -1 || visible.length === 0) return;

        let next;
        switch (event.key) {
            case 'ArrowRight': next = visible[(index + 1) % visible.length]; break;
            case 'ArrowLeft': next = visible[(index - 1 + visible.length) % visible.length]; break;
            case 'Home': next = visible[0]; break;
            case 'End': next = visible[visible.length - 1]; break;
            default: return;
        }
        event.preventDefault();
        const activated = this.activateTab(next.getAttribute('data-tab'));
        if (activated) activated.focus();
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
                    tabPanel.hidden = true;
                    tabPanel.setAttribute('hidden', '');
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
                this.activateTab(firstEnabledTabKey);
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

        // Install USB Driver button (Windows-only, shown when no DFU driver found)
        const installDriverBtn = document.getElementById('install-driver-btn');
        if (installDriverBtn) {
            installDriverBtn.addEventListener('click', async () => {
                await this.installUsbDriver();
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
        // Primary match: the USB product string "DWM V2 ComPort", set by every DWM V2
        // firmware regardless of PID. Where serialport surfaces it depends on the platform:
        // Linux embeds it in pnpId (usb-STMicroelectronics_DWM_V2_ComPort_<serial>-if00),
        // Windows may carry it in friendlyName, and some builds report it in manufacturer.
        // macOS exposes no product string at all, only VID/PID.
        const hasProductString = (value) => /dwm[ _]v2/i.test(String(value || ''));
        if (hasProductString(port?.manufacturer)) return true;
        if (hasProductString(port?.friendlyName)) return true;
        if (hasProductString(port?.pnpId)) return true;

        // Secondary: VID 0483 with one of the DWM V2 application PIDs. 5740 is ST's generic
        // CDC PID used by older firmware; A59C is the PID ST assigned to the DWM V2. VID and
        // PID must match together so other STM32 CDC devices are not misidentified.
        const vid = (port?.vendorId || '').toLowerCase().replace(/^0x/, '');
        const pid = (port?.productId || '').toLowerCase().replace(/^0x/, '');
        if (vid === '0483' && DWM_V2_APP_PIDS.includes(pid)) return true;

        // Windows fallback when vendorId/productId fields are unpopulated: read them from pnpId.
        const pnpId = (port?.pnpId || '');
        if (/VID_0483/i.test(pnpId) && /PID_(5740|A59C)/i.test(pnpId)) return true;

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
        const meterPrefs = this.config?.meterCards?.[key] || {};
        const existingState = existing.state || null;
        const nextRecord = {
            key,
            portPath: port.path,
            friendlyName: existing.friendlyName || port.friendlyName || 'DWM V2',
            fallbackUid: this.parseUsbModemUid(port.path),
            apiUid: existing.apiUid || null,
            connectionState: existing.connectionState || 'available',
            state: existingState,
            lastSeenAt: Date.now(),
            // Preserve user-chosen gauge metrics across record refreshes
            gaugeMetricL: existing.gaugeMetricL || meterPrefs.gaugeMetricL || 'avg',
            gaugeMetricR: existing.gaugeMetricR || meterPrefs.gaugeMetricR || 'peak',
            gaugeDisplayL: existing.gaugeDisplayL || meterPrefs.gaugeDisplayL || 'gauge',
            gaugeDisplayR: existing.gaugeDisplayR || meterPrefs.gaugeDisplayR || 'gauge',
            pepHoldMs: Number.isFinite(existing.pepHoldMs)
                ? existing.pepHoldMs
                : (Number.isFinite(meterPrefs.pepHoldMs) ? meterPrefs.pepHoldMs : 1000),
            elementId: Number.isFinite(existing.elementId) ? existing.elementId : 1,
            elementRating: Number.isFinite(existing.elementRating) ? existing.elementRating : 0,
            elementType: existing.elementType || '30ua',
            elementProfiles: Array.isArray(existing.elementProfiles) ? existing.elementProfiles : [],
            rangeMultiplier: Number.isFinite(existing.rangeMultiplier) ? existing.rangeMultiplier : 2,
            rangeCfg: Number.isFinite(existing.rangeCfg) ? existing.rangeCfg : 1,
            protocolVersion: existing.protocolVersion === '1' ? '1' : '2',
        };

        if (nextRecord.state) {
            if (meterPrefs.viewMode === 'meters' || meterPrefs.viewMode === 'history') {
                nextRecord.state.viewMode = meterPrefs.viewMode;
            }
            if (typeof meterPrefs.cardLayout === 'string' && meterPrefs.cardLayout) {
                nextRecord.state.cardLayout = meterPrefs.cardLayout;
            }
            if (Number.isFinite(meterPrefs.historyWindowMs) && meterPrefs.historyWindowMs > 0) {
                nextRecord.state.historyWindowMs = meterPrefs.historyWindowMs;
            }
            if (Array.isArray(meterPrefs.historyLines) && meterPrefs.historyLines.length > 0) {
                nextRecord.state.historyLines = [...meterPrefs.historyLines];
            }
        }

        this.meterRegistry.set(key, nextRecord);

        if (!Array.isArray(this.config.meterCardOrder)) {
            this.config.meterCardOrder = [];
        }
        if (!Array.isArray(this.config.boardCardOrder)) {
            this.config.boardCardOrder = [];
        }

        if (!this.config.meterCardOrder.includes(key)) {
            this.config.meterCardOrder.push(key);
            const meterToken = `meter:${key}`;
            if (!this.config.boardCardOrder.includes(meterToken)) {
                this.config.boardCardOrder.push(meterToken);
            }
            this.saveConfig();
        }

        return nextRecord;
    }

    removeMissingMeterRecords(activeKeys) {
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
                // Only reset to 'available' if not currently connected, manually disconnected, or flagged as not-configured
                if (record.connectionState !== 'connected' && record.connectionState !== 'disconnected' && record.connectionState !== 'not-configured') {
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
        const themeSelect = document.getElementById('theme-select');

        // Set theme from config (defaults to dark)
        this.setTheme(this.config.theme || 'carbon');

        themeSelect.addEventListener('change', () => {
            const newTheme = themeSelect.value;
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
            // Re-render site view grid with new theme colors
            if (this._svRender) this._svRender();
        });
    }

    setTheme(theme) {
        const VALID = ['dark', 'light', 'ocean', 'carbon', 'amber'];
        const t = VALID.includes(theme) ? theme : 'dark';
        document.documentElement.setAttribute('data-theme', t);
        const sel = document.getElementById('theme-select');
        if (sel) sel.value = t;
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
                    output.replaceChildren();
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
