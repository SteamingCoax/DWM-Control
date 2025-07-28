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
        
        // Tab Configuration - Set to false to hide tabs
        // To enable/disable tabs, change these values and restart the app
        // Example: To hide the terminal tab, set terminal: false
        this.tabSettings = {
            firmware: true,   // Firmware Upload tab
            terminal: false,   // Serial Terminal tab  
            control: false     // Control panel tab
        };
        
        // UI Component Configuration - Set to false to hide components
        // To enable/disable UI components, change these values and restart the app
        // Example: To hide the Serial Communication dropdown, set headerConnection: false
        this.uiSettings = {
            headerConnection: false   // Serial Communication Setup dropdown in header
        };
        
        this.initializeApp();
    }

    initializeApp() {
        console.log('DWM Control: Initializing app...');
        try {
            this.setupTabSwitching();
            console.log('DWM Control: Tab switching setup complete');
            
            this.setupFirmwareUploader();
            console.log('DWM Control: Firmware uploader setup complete');
            
            this.setupSerialTerminal();
            console.log('DWM Control: Serial terminal setup complete');
            
            this.setupDeviceControl();
            console.log('DWM Control: Device control setup complete');
            
            this.setupThemeToggle();
            console.log('DWM Control: Theme toggle setup complete');
            
            this.setupHeaderConnection();
            console.log('DWM Control: Header connection setup complete');
            
            this.setupOutputToggle();
            console.log('DWM Control: Output toggle setup complete');
            
            this.appendOutput('Application ready. Use the connection panel in the header to connect to your device.');
            console.log('DWM Control: Initialization complete');
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
        const fileInfo = document.getElementById('file-info');
        const fileName = document.getElementById('file-name');
        const fileSize = document.getElementById('file-size');
        const clearFileBtn = document.getElementById('clear-file-btn');

        // Select file button click - use native Electron dialog
        selectFileBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent bubbling to upload area
            this.selectHexFile();
        });

        // File selection handling will be done through handleFileSelection method

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
                    this.appendOutput('❌ Please select a .hex firmware file');
                }
            }
        });

        // Refresh devices button
        document.getElementById('refresh-devices-btn').addEventListener('click', async () => {
            await this.refreshDfuDevices();
        });

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

    // Serial Terminal Setup
    setupSerialTerminal() {
        // Terminal input
        const terminalInput = document.getElementById('terminal-input');
        if (terminalInput) {
            terminalInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendSerialCommand();
                }
            });
        }

        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                this.sendSerialCommand();
            });
        }

        // Clear terminal
        const clearTerminalBtn = document.getElementById('clear-terminal-btn');
        if (clearTerminalBtn) {
            clearTerminalBtn.addEventListener('click', () => {
                const terminalOutput = document.getElementById('terminal-output');
                if (terminalOutput) {
                    terminalOutput.textContent = '';
                }
            });
        }
    }

    // Device Control Setup (based on Python version protocol)
    setupDeviceControl() {
        // Device control parameters matching Python version with dropdown options
        this.deviceParameters = {
            'Device Settings': {
                'DEVICE_NAME': { 
                    default: 'DWM', 
                    type: 'string', 
                    label: 'Device Name' 
                },
                'UNIT_TYPE': { 
                    default: 1, 
                    type: 'select', 
                    label: 'Unit Type',
                    options: [
                        { value: 1, label: 'Type 1' },
                        { value: 2, label: 'Type 2' },
                        { value: 3, label: 'Type 3' }
                    ]
                },
                'TERM_TYPE': { 
                    default: 1, 
                    type: 'select', 
                    label: 'Termination Type',
                    options: [
                        { value: 1, label: 'Standard' },
                        { value: 2, label: 'Enhanced' },
                        { value: 3, label: 'Custom' }
                    ]
                },
                'DE_COEF': { 
                    default: 1.0, 
                    type: 'float', 
                    label: 'DE Coefficient' 
                },
            },
            'Measurement': {
                'AVERAGING': { 
                    default: 5, 
                    type: 'select', 
                    label: 'Averaging',
                    options: [
                        { value: 1, label: '1 Sample' },
                        { value: 5, label: '5 Samples' },
                        { value: 10, label: '10 Samples' },
                        { value: 25, label: '25 Samples' },
                        { value: 50, label: '50 Samples' }
                    ]
                },
                'PEAK_TIME': { 
                    default: 1000, 
                    type: 'select', 
                    label: 'Peak Time',
                    options: [
                        { value: 100, label: '100ms' },
                        { value: 500, label: '500ms' },
                        { value: 1000, label: '1000ms' },
                        { value: 2000, label: '2000ms' },
                        { value: 5000, label: '5000ms' }
                    ]
                },
                'MAX_RANGE': { 
                    default: 100, 
                    type: 'select', 
                    label: 'Max Range',
                    options: [
                        { value: 10, label: '10m' },
                        { value: 50, label: '50m' },
                        { value: 100, label: '100m' },
                        { value: 200, label: '200m' },
                        { value: 500, label: '500m' }
                    ]
                },
                'METER_TYPE': { 
                    default: 1, 
                    type: 'select', 
                    label: 'Meter Type',
                    options: [
                        { value: 1, label: 'Basic' },
                        { value: 2, label: 'Advanced' },
                        { value: 3, label: 'Professional' }
                    ]
                },
                'STAT_TYPE': { 
                    default: 1, 
                    type: 'select', 
                    label: 'Statistics Type',
                    options: [
                        { value: 1, label: 'Standard' },
                        { value: 2, label: 'Extended' },
                        { value: 3, label: 'Detailed' }
                    ]
                },
                'REFL_TYPE': { 
                    default: 1, 
                    type: 'select', 
                    label: 'Reflection Type',
                    options: [
                        { value: 1, label: 'Normal' },
                        { value: 2, label: 'Enhanced' },
                        { value: 3, label: 'High Precision' }
                    ]
                },
                'CLASSIC_MODE': { 
                    default: false, 
                    type: 'bool', 
                    label: 'Classic Mode' 
                },
            },
            'Trigger Settings': {
                'TRIG_THRESH': { 
                    default: 100, 
                    type: 'select', 
                    label: 'Trigger Threshold',
                    options: [
                        { value: 50, label: '50' },
                        { value: 75, label: '75' },
                        { value: 100, label: '100' },
                        { value: 125, label: '125' },
                        { value: 150, label: '150' }
                    ]
                },
                'TRIG_SIDE': { 
                    default: 1, 
                    type: 'select', 
                    label: 'Trigger Side',
                    options: [
                        { value: 1, label: 'Rising' },
                        { value: 2, label: 'Falling' },
                        { value: 3, label: 'Both' }
                    ]
                },
            },
            'Termination': {
                'TERM_ESR': { 
                    default: 50, 
                    type: 'select', 
                    label: 'Termination ESR',
                    options: [
                        { value: 25, label: '25Ω' },
                        { value: 50, label: '50Ω' },
                        { value: 75, label: '75Ω' },
                        { value: 100, label: '100Ω' }
                    ]
                },
                'IN_OFFSET': { 
                    default: 0, 
                    type: 'int', 
                    label: 'Input Offset' 
                },
            },
            'Element Control': {
                'ELE_SELECT': { 
                    default: 1, 
                    type: 'select', 
                    label: 'Element Select',
                    options: [
                        { value: 1, label: 'Element 1' },
                        { value: 2, label: 'Element 2' },
                        { value: 3, label: 'Element 3' },
                        { value: 4, label: 'Element 4' }
                    ]
                },
                'ELE_VAL': { 
                    default: 100, 
                    type: 'int', 
                    label: 'Element Value' 
                },
            },
            'Display Settings': {
                'BACKLIGHT': { 
                    default: 50, 
                    type: 'select', 
                    label: 'Backlight',
                    options: [
                        { value: 10, label: '10%' },
                        { value: 25, label: '25%' },
                        { value: 50, label: '50%' },
                        { value: 75, label: '75%' },
                        { value: 100, label: '100%' }
                    ]
                },
                'CONTRAST': { 
                    default: 50, 
                    type: 'select', 
                    label: 'Contrast',
                    options: [
                        { value: 10, label: '10%' },
                        { value: 25, label: '25%' },
                        { value: 50, label: '50%' },
                        { value: 75, label: '75%' },
                        { value: 100, label: '100%' }
                    ]
                },
                'DARK_MODE': { 
                    default: false, 
                    type: 'bool', 
                    label: 'Device Dark Mode' 
                },
                'MENU_HELP': { 
                    default: true, 
                    type: 'bool', 
                    label: 'Menu Help' 
                },
            },
            'Supply Settings': {
                'SUPPLY_TYPE': { 
                    default: 1, 
                    type: 'select', 
                    label: 'Supply Type',
                    options: [
                        { value: 1, label: 'Internal' },
                        { value: 2, label: 'External' },
                        { value: 3, label: 'Battery' }
                    ]
                },
                'SUPPLY_RANGE': { 
                    default: 5, 
                    type: 'select', 
                    label: 'Supply Range',
                    options: [
                        { value: 3, label: '3V' },
                        { value: 5, label: '5V' },
                        { value: 9, label: '9V' },
                        { value: 12, label: '12V' }
                    ]
                },
            },
            'Logging': {
                'LOGGING_TYPE': { 
                    default: 1, 
                    type: 'select', 
                    label: 'Logging Type',
                    options: [
                        { value: 0, label: 'Disabled' },
                        { value: 1, label: 'Basic' },
                        { value: 2, label: 'Detailed' },
                        { value: 3, label: 'Debug' }
                    ]
                },
            }
        };

        // Action commands from Python version
        this.actionCommands = {
            'reset': { label: '🔄 Reset', command: 'START:A:RESET', color: '#ffc107' },
            'reboot': { label: '⏻ Reboot', command: 'START:A:REBOOT', color: '#fd7e14' },
            'save': { label: '💾 Save', command: 'START:A:SAVE', color: '#28a745' },
            'update': { label: '🔄 Update', command: 'START:A:UPDATE', color: '#17a2b8' },
            'return_loss': { label: '📊 Return Loss', command: 'START:A:RETURN_LOSS', color: '#6610f2' },
            'cal': { label: '🎯 Calibrate', command: 'START:A:CAL', color: '#e83e8c' },
            'de_embed': { label: '🔧 De-Embed', command: 'START:A:DE_EMBED', color: '#20c997' },
        };

        this.generateDeviceControlUI();
        this.setupDeviceControlEvents();
    }

    generateDeviceControlUI() {
        const controlPanel = document.getElementById('control-panel');
        if (!controlPanel) return;

        let html = '';

        // Generate collapsible parameter groups (all hidden by default)
        Object.entries(this.deviceParameters).forEach(([groupName, parameters]) => {
            const groupId = groupName.replace(/\s+/g, '-').toLowerCase();
            html += `
                <div class="card parameter-group" style="display: none;">
                    <div class="card-header collapsible-header" data-group="${groupId}">
                        <div class="collapsible-title">
                            <h3><span class="card-icon">⚙️</span>${groupName}</h3>
                            <p class="card-subtitle">Configure ${groupName.toLowerCase()} parameters</p>
                        </div>
                        <button class="collapse-toggle" type="button">
                            <span class="collapse-icon">▼</span>
                        </button>
                    </div>
                    <div class="card-content collapsible-content collapsed" id="group-${groupId}">
                        <div class="parameter-grid-compact">
            `;

            Object.entries(parameters).forEach(([paramName, config]) => {
                html += this.generateCompactParameterControl(paramName, config);
            });

            html += `
                        </div>
                    </div>
                </div>
            `;
        });

        // Add Comprehensive Power Monitoring Dashboard
        html += `
            <div class="card">
                <div class="card-header">
                    <h3><span class="card-icon">⚡</span>Power Monitor Dashboard</h3>
                    <p class="card-subtitle">Real-time multi-parameter power analysis</p>
                    <div class="card-actions">
                        <button class="btn btn-text" id="reset-power-dashboard">
                            <span class="btn-icon">🔄</span>
                            Reset
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    <div class="power-dashboard">
                        <!-- Power Controls -->
                        <div class="power-controls-compact">
                            <button class="btn btn-primary btn-small" id="start-power-monitoring">
                                <span class="btn-icon">▶️</span>
                                Start Monitoring
                            </button>
                            <button class="btn btn-secondary btn-small" id="stop-power-monitoring" disabled>
                                <span class="btn-icon">⏹️</span>
                                Stop
                            </button>
                            <button class="btn btn-text btn-small" id="test-power-dashboard">
                                <span class="btn-icon">🧪</span>
                                Test Demo
                            </button>
                        </div>
                        
                        <!-- Power Meters Grid -->
                        <div class="power-meters-grid">
                            <!-- Instantaneous Power -->
                            <div class="power-meter">
                                <div class="power-meter-header">
                                    <span class="power-meter-label">INS</span>
                                    <span class="power-meter-unit">W</span>
                                </div>
                                <div class="power-bar-container">
                                    <div class="power-bar">
                                        <div class="power-bar-fill ins-fill" style="width: 0%"></div>
                                        <div class="power-bar-gradient"></div>
                                    </div>
                                    <span class="power-value ins-value">0.0</span>
                                </div>
                            </div>
                            
                            <!-- Average Power -->
                            <div class="power-meter">
                                <div class="power-meter-header">
                                    <span class="power-meter-label">AVG</span>
                                    <span class="power-meter-unit">W</span>
                                </div>
                                <div class="power-bar-container">
                                    <div class="power-bar">
                                        <div class="power-bar-fill avg-fill" style="width: 0%"></div>
                                        <div class="power-bar-gradient"></div>
                                    </div>
                                    <span class="power-value avg-value">0.0</span>
                                </div>
                            </div>
                            
                            <!-- Peak Envelope Power -->
                            <div class="power-meter">
                                <div class="power-meter-header">
                                    <span class="power-meter-label">PEP</span>
                                    <span class="power-meter-unit">W</span>
                                </div>
                                <div class="power-bar-container">
                                    <div class="power-bar">
                                        <div class="power-bar-fill pep-fill" style="width: 0%"></div>
                                        <div class="power-bar-gradient"></div>
                                    </div>
                                    <span class="power-value pep-value">0.0</span>
                                </div>
                            </div>
                            
                            <!-- Maximum Power -->
                            <div class="power-meter">
                                <div class="power-meter-header">
                                    <span class="power-meter-label">MAX</span>
                                    <span class="power-meter-unit">W</span>
                                </div>
                                <div class="power-bar-container">
                                    <div class="power-bar">
                                        <div class="power-bar-fill max-fill" style="width: 0%"></div>
                                        <div class="power-bar-gradient"></div>
                                    </div>
                                    <span class="power-value max-value">0.0</span>
                                </div>
                            </div>
                            
                            <!-- Minimum Power -->
                            <div class="power-meter">
                                <div class="power-meter-header">
                                    <span class="power-meter-label">MIN</span>
                                    <span class="power-meter-unit">W</span>
                                </div>
                                <div class="power-bar-container">
                                    <div class="power-bar">
                                        <div class="power-bar-fill min-fill" style="width: 0%"></div>
                                        <div class="power-bar-gradient"></div>
                                    </div>
                                    <span class="power-value min-value">0.0</span>
                                </div>
                            </div>
                            
                            <!-- Deviation -->
                            <div class="power-meter">
                                <div class="power-meter-header">
                                    <span class="power-meter-label">DEV</span>
                                    <span class="power-meter-unit">±W</span>
                                </div>
                                <div class="power-bar-container">
                                    <div class="power-bar">
                                        <div class="power-bar-fill dev-fill" style="width: 0%"></div>
                                        <div class="power-bar-gradient"></div>
                                    </div>
                                    <span class="power-value dev-value">0.0</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Status and Info -->
                        <div class="power-dashboard-status">
                            <div class="power-status-indicator">
                                <span class="status-dot" id="power-status-dot"></span>
                                <span class="status-text" id="power-status-text">Ready to monitor</span>
                            </div>
                            <div class="power-range-info">
                                <span class="range-label">Range:</span>
                                <span class="range-value">0-150W</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Generate collapsible parameter groups
        html += `
            <div class="card">
                <div class="card-header">
                    <h3><span class="card-icon">🎛️</span>Device Actions</h3>
                    <p class="card-subtitle">Execute device commands</p>
                </div>
                <div class="card-content">
                    <div class="action-grid">
        `;

        Object.entries(this.actionCommands).forEach(([actionKey, action]) => {
            html += `
                <button class="action-btn" data-action="${actionKey}" style="--action-color: ${action.color}">
                    ${action.label}
                </button>
            `;
        });

        html += `
                    </div>
                </div>
            </div>
        `;

        controlPanel.innerHTML = html;
    }

    generateParameterControl(paramName, config) {
        const inputId = `param-${paramName}`;
        let inputElement = '';

        switch (config.type) {
            case 'bool':
                inputElement = `
                    <input type="checkbox" id="${inputId}" class="form-checkbox" ${config.default ? 'checked' : ''}>
                `;
                break;
            case 'float':
                inputElement = `
                    <input type="number" id="${inputId}" class="form-input" value="${config.default}" step="0.1">
                `;
                break;
            case 'int':
                inputElement = `
                    <input type="number" id="${inputId}" class="form-input" value="${config.default}" step="1">
                `;
                break;
            case 'string':
                inputElement = `
                    <input type="text" id="${inputId}" class="form-input" value="${config.default}">
                `;
                break;
            case 'select':
                const options = config.options.map(option => 
                    `<option value="${option.value}" ${option.value === config.default ? 'selected' : ''}>${option.label}</option>`
                ).join('');
                inputElement = `
                    <select id="${inputId}" class="form-select">
                        ${options}
                    </select>
                `;
                break;
        }

        return `
            <div class="parameter-control">
                <label for="${inputId}">${config.label}:</label>
                ${inputElement}
                <button class="btn btn-small btn-secondary" data-param="${paramName}">Set</button>
            </div>
        `;
    }

    generateCompactParameterControl(paramName, config) {
        const inputId = `param-${paramName}`;
        let inputElement = '';

        switch (config.type) {
            case 'bool':
                inputElement = `
                    <input type="checkbox" id="${inputId}" class="form-checkbox-compact" ${config.default ? 'checked' : ''}>
                `;
                break;
            case 'float':
                inputElement = `
                    <input type="number" id="${inputId}" class="form-input-compact" value="${config.default}" step="0.1">
                `;
                break;
            case 'int':
                inputElement = `
                    <input type="number" id="${inputId}" class="form-input-compact" value="${config.default}" step="1">
                `;
                break;
            case 'string':
                inputElement = `
                    <input type="text" id="${inputId}" class="form-input-compact" value="${config.default}">
                `;
                break;
            case 'select':
                const options = config.options.map(option => 
                    `<option value="${option.value}" ${option.value === config.default ? 'selected' : ''}>${option.label}</option>`
                ).join('');
                inputElement = `
                    <select id="${inputId}" class="form-select-compact">
                        ${options}
                    </select>
                `;
                break;
        }

        return `
            <div class="parameter-control-compact">
                <label for="${inputId}" class="param-label-compact">${config.label}</label>
                <div class="param-input-group">
                    ${inputElement}
                    <button class="btn-micro" data-param="${paramName}" title="Set ${config.label}">✓</button>
                </div>
            </div>
        `;
    }

    setupDeviceControlEvents() {
        // Parameter set buttons
        document.addEventListener('click', (e) => {
            if (e.target.hasAttribute('data-param')) {
                const paramName = e.target.getAttribute('data-param');
                this.setDeviceParameter(paramName);
            }
        });

        // Action buttons
        document.addEventListener('click', (e) => {
            if (e.target.hasAttribute('data-action')) {
                const actionKey = e.target.getAttribute('data-action');
                this.executeDeviceAction(actionKey);
            }
        });

        // Collapsible parameter groups
        document.addEventListener('click', (e) => {
            if (e.target.closest('.collapsible-header')) {
                const header = e.target.closest('.collapsible-header');
                const groupId = header.getAttribute('data-group');
                const content = document.getElementById(`group-${groupId}`);
                const toggle = header.querySelector('.collapse-toggle');
                const icon = toggle.querySelector('.collapse-icon');
                
                if (content.classList.contains('collapsed')) {
                    content.classList.remove('collapsed');
                    icon.textContent = '▲';
                    header.classList.add('expanded');
                } else {
                    content.classList.add('collapsed');
                    icon.textContent = '▼';
                    header.classList.remove('expanded');
                }
            }
        });

        // Power monitoring controls
        this.setupPowerDashboard();
    }

    setupPowerDashboard() {
        // Initialize power monitoring state with multiple measurements
        this.powerMonitoring = {
            isActive: false,
            interval: null,
            maxValue: 150, // Maximum power in watts
            measurements: {
                instantaneous: { current: 0, history: [] },
                average: { current: 0, history: [] },
                peakEnvelope: { current: 0, history: [] },
                maximum: { current: 0, history: [] },
                minimum: { current: 0, history: [] },
                deviation: { current: 0, history: [] }
            }
        };

        // Get control elements
        const startBtn = document.getElementById('start-power-monitoring');
        const stopBtn = document.getElementById('stop-power-monitoring');
        const resetBtn = document.getElementById('reset-power-dashboard');
        const testBtn = document.getElementById('test-power-dashboard');

        if (startBtn) {
            startBtn.addEventListener('click', () => this.startPowerMonitoring());
        }
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopPowerMonitoring());
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetPowerDashboard());
        }
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testPowerGauge());
        }

        // Initialize all power bars
        this.updateAllPowerBars();
        this.updatePowerStatus('Ready to monitor', 'ready');
    }

    startPowerMonitoring() {
        if (this.powerMonitoring.isActive) return;

        if (!this.isConnected) {
            this.appendOutput('Please connect to device first to start power monitoring.');
            return;
        }

        this.powerMonitoring.isActive = true;
        
        // Update UI
        const startBtn = document.getElementById('start-power-monitoring');
        const stopBtn = document.getElementById('stop-power-monitoring');

        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = '<span class="btn-icon">⏸️</span> Monitoring...';
        }
        if (stopBtn) stopBtn.disabled = false;

        this.updatePowerStatus('Monitoring active - waiting for data...', 'monitoring');

        // Send power monitoring command to device
        this.sendDeviceCommand('START:A:POWER_MONITOR');
        this.appendOutput('🔌 Power monitoring started');

        // Start simulation for demo (remove when real data is available)
        this.startPowerSimulation();
    }

    stopPowerMonitoring() {
        if (!this.powerMonitoring.isActive) return;

        this.powerMonitoring.isActive = false;
        
        // Clear intervals
        if (this.powerMonitoring.interval) {
            clearInterval(this.powerMonitoring.interval);
            this.powerMonitoring.interval = null;
        }

        // Update UI
        const startBtn = document.getElementById('start-power-monitoring');
        const stopBtn = document.getElementById('stop-power-monitoring');

        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<span class="btn-icon">▶️</span> Start Monitoring';
        }
        if (stopBtn) stopBtn.disabled = true;

        this.updatePowerStatus('Monitoring stopped', 'stopped');

        // Send stop command to device
        this.sendDeviceCommand('START:A:POWER_STOP');
        this.appendOutput('🔌 Power monitoring stopped');
    }

    resetPowerDashboard() {
        // Reset all measurements
        Object.keys(this.powerMonitoring.measurements).forEach(key => {
            this.powerMonitoring.measurements[key].current = 0;
            this.powerMonitoring.measurements[key].history = [];
        });
        
        this.updateAllPowerBars();
        
        if (!this.powerMonitoring.isActive) {
            this.updatePowerStatus('Dashboard reset - ready for monitoring', 'ready');
        }
        
        this.appendOutput('🔄 Power dashboard reset');
    }

    // Demo simulation - replace with real serial data parsing
    startPowerSimulation() {
        let simulationStep = 0;
        
        this.powerMonitoring.interval = setInterval(() => {
            if (!this.powerMonitoring.isActive) return;
            
            // Simulate realistic power values with variations
            simulationStep += 0.1;
            const baseValue = 45 + Math.sin(simulationStep) * 20 + Math.random() * 10;
            const powerValue = Math.max(0, Math.min(this.powerMonitoring.maxValue, baseValue));
            
            // Simulate receiving power data from serial
            this.processPowerData(powerValue);
        }, 200); // Update every 200ms for smooth animation
    }

    // Process incoming power data from serial communication
    processPowerData(powerValue) {
        // Store raw power value for the new dashboard processing
        this.processPowerReading(powerValue);

        // Keep only last 100 readings for each measurement
        Object.keys(this.powerMonitoring.measurements).forEach(type => {
            const measurement = this.powerMonitoring.measurements[type];
            if (measurement.history && measurement.history.length > 100) {
                measurement.history = measurement.history.slice(-50);
            }
        });

        this.processPowerReading(powerValue);
    }

    updatePowerStatus(message, className = '') {
        const statusTextElement = document.getElementById('power-status-text');
        const statusDotElement = document.getElementById('power-status-dot');
        
        if (statusTextElement) {
            statusTextElement.textContent = message;
        }
        
        if (statusDotElement) {
            statusDotElement.className = `status-dot ${className}`;
        }
    }

    updateAllPowerBars() {
        // Update each power bar with the correct class names
        this.updatePowerBar('ins', this.powerMonitoring.measurements.instantaneous);
        this.updatePowerBar('avg', this.powerMonitoring.measurements.average);
        this.updatePowerBar('pep', this.powerMonitoring.measurements.peakEnvelope);
        this.updatePowerBar('max', this.powerMonitoring.measurements.maximum);
        this.updatePowerBar('min', this.powerMonitoring.measurements.minimum);
        this.updatePowerBar('dev', this.powerMonitoring.measurements.deviation);
    }

    updatePowerBar(type, measurement) {
        if (!measurement) return;

        const fillElement = document.querySelector(`.${type}-fill`);
        const valueElement = document.querySelector(`.${type}-value`);
        
        if (!fillElement || !valueElement) {
            console.warn(`Power bar elements not found for type: ${type}`);
            return;
        }

        // Calculate percentage (assuming max range of 150W)
        const maxPower = this.powerMonitoring.maxValue || 150;
        const percentage = Math.min((measurement.current / maxPower) * 100, 100);
        
        // Update bar fill with smooth animation
        fillElement.style.width = `${percentage}%`;
        
        // Update value display
        valueElement.textContent = `${measurement.current.toFixed(1)}`;
        
        // Add color coding based on power level
        fillElement.className = `power-bar-fill ${type}-fill`;
        if (percentage > 80) {
            fillElement.classList.add('high-power');
        } else if (percentage > 60) {
            fillElement.classList.add('medium-power');
        } else {
            fillElement.classList.add('low-power');
        }
    }

    processPowerReading(rawValue) {
        const power = parseFloat(rawValue);
        if (isNaN(power)) return;

        // Update instantaneous value
        this.powerMonitoring.measurements.instantaneous.current = power;
        this.powerMonitoring.measurements.instantaneous.history.push(power);

        // Calculate other measurements
        const history = this.powerMonitoring.measurements.instantaneous.history;
        const recent = history.slice(-10); // Last 10 readings for average

        // Average (last 10 readings)
        this.powerMonitoring.measurements.average.current = recent.reduce((a, b) => a + b, 0) / recent.length;

        // Peak Envelope Power (maximum in recent history)
        this.powerMonitoring.measurements.peakEnvelope.current = Math.max(...recent);

        // Maximum (all-time maximum)
        if (power > this.powerMonitoring.measurements.maximum.current) {
            this.powerMonitoring.measurements.maximum.current = power;
        }

        // Minimum (all-time minimum, excluding zero)
        if (power > 0 && (this.powerMonitoring.measurements.minimum.current === 0 || power < this.powerMonitoring.measurements.minimum.current)) {
            this.powerMonitoring.measurements.minimum.current = power;
        }

        // Deviation (standard deviation of recent readings)
        if (recent.length > 1) {
            const avg = this.powerMonitoring.measurements.average.current;
            const variance = recent.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / recent.length;
            this.powerMonitoring.measurements.deviation.current = Math.sqrt(variance);
        }

        // Trim history to prevent memory issues
        if (history.length > 1000) {
            this.powerMonitoring.measurements.instantaneous.history = history.slice(-500);
        }

        // Update all bars
        this.updateAllPowerBars();
        
        // Update status based on instantaneous power
        if (this.powerMonitoring.isActive) {
            const maxPower = this.powerMonitoring.maxValue || 150;
            if (power > maxPower * 0.9) {
                this.updatePowerStatus('WARNING: Critical power level!', 'error');
            } else if (power > maxPower * 0.75) {
                this.updatePowerStatus('High power consumption', 'warning');
            } else if (power < maxPower * 0.1) {
                this.updatePowerStatus('Low power - check connections', 'warning');
            } else {
                this.updatePowerStatus('Normal operation', 'monitoring');
            }
        }
    }

    // Method to parse power data from serial commands
    parsePowerFromSerial(data) {
        // Look for power data in serial responses
        // Expected format: "POWER:XX.X" or similar
        const powerMatch = data.match(/POWER:(\d+\.?\d*)/i);
        if (powerMatch && this.powerMonitoring.isActive) {
            const powerValue = parseFloat(powerMatch[1]);
            this.processPowerData(powerValue);
            return true;
        }
        return false;
    }

    // Manual power testing (for demonstration)
    testPowerGauge() {
        if (!this.powerMonitoring.isActive) {
            this.startPowerMonitoring();
        }
        
        // Test sequence: ramp up, hold, ramp down
        let step = 0;
        const testInterval = setInterval(() => {
            let powerValue;
            
            if (step < 50) {
                // Ramp up
                powerValue = (step / 50) * 100;
            } else if (step < 100) {
                // Hold high
                powerValue = 95 + Math.random() * 10;
            } else if (step < 150) {
                // Ramp down
                powerValue = 100 - ((step - 100) / 50) * 100;
            } else {
                // Return to normal
                powerValue = 10 + Math.random() * 20;
                if (step > 200) {
                    clearInterval(testInterval);
                    return;
                }
            }
            
            this.processPowerData(Math.max(0, Math.min(150, powerValue)));
            step++;
        }, 100);
    }

    setDeviceParameter(paramName) {
        if (!this.isConnected) {
            this.appendOutput('Please connect to device first.');
            return;
        }

        const inputElement = document.getElementById(`param-${paramName}`);
        if (!inputElement) return;

        let value = inputElement.value;
        if (inputElement.type === 'checkbox') {
            value = inputElement.checked ? '1' : '0';
        }

        const command = `START:S:${paramName}:${value}`;
        this.sendDeviceCommand(command);
        this.appendOutput(`Setting ${paramName} = ${value}`);
    }

    executeDeviceAction(actionKey) {
        if (!this.isConnected) {
            this.appendOutput('Please connect to device first.');
            return;
        }

        const action = this.actionCommands[actionKey];
        if (!action) return;

        this.sendDeviceCommand(action.command);
        this.appendOutput(`Executing: ${action.label}`);
    }

    sendDeviceCommand(command) {
        // For now, simulate command sending
        // In a real implementation, this would send via serial connection
        this.appendOutput(`→ ${command}`);
        
        // Simulate device response
        setTimeout(() => {
            this.appendOutput(`← Command acknowledged`);
            
            // Simulate power monitoring responses
            if (command.includes('POWER_MONITOR')) {
                // Simulate periodic power readings
                this.appendOutput(`← Power monitoring enabled`);
            } else if (command.includes('POWER_STOP')) {
                this.appendOutput(`← Power monitoring disabled`);
            }
        }, 100);
    }

    // DFU Device Management
    async refreshDfuDevices() {
        const combo = document.getElementById('device-combo');
        const refreshBtn = document.getElementById('refresh-devices-btn');
        
        combo.innerHTML = '<option>Scanning for devices...</option>';
        refreshBtn.disabled = true;
        
        try {
            const result = await window.electronAPI.getDfuDevices();
            
            combo.innerHTML = '';
            
            if (result.success && result.devices.length > 0) {
                result.devices.forEach((device, index) => {
                    const option = document.createElement('option');
                    option.value = index;
                    
                    // Create more descriptive device text
                    let deviceText = `DFU Device ${index + 1}: ${device.vid}:${device.pid}`;
                    if (device.serial && device.serial !== 'unknown') {
                        deviceText += ` (Serial: ${device.serial})`;
                    }
                    if (device.name) {
                        deviceText += ` - ${device.name}`;
                    }
                    
                    option.textContent = deviceText;
                    combo.appendChild(option);
                });
                
                this.selectedDevice = result.devices[0];
                this.appendOutput(`Found ${result.devices.length} DFU device(s)`);
                this.updateUploadButton();
            } else {
                combo.innerHTML = '<option>No DFU devices found</option>';
                this.selectedDevice = null;
                
                if (result.needsSetup) {
                    this.appendOutput('⚠️ dfu-util not found! Please ensure Programs/dfu-util/dfu-util.exe exists.');
                } else if (result.windowsHelp) {
                    this.appendOutput('No DFU devices found. Windows troubleshooting:');
                    this.appendOutput('1. Put device in DFU mode (hold BOOT button while connecting USB)');
                    this.appendOutput('2. Install DFU drivers with Zadig (Programs/zadig-2.9.exe)');
                    this.appendOutput('3. Try different USB cable/port');
                    this.appendOutput('4. Check device manager for unrecognized devices');
                    this.appendOutput('5. Try running app as Administrator');
                } else {
                    this.appendOutput('No DFU devices found. Ensure device is in DFU mode and connected.');
                }
                this.updateUploadButton();
            }
        } catch (error) {
            combo.innerHTML = '<option>Error scanning devices</option>';
            this.appendOutput(`Error scanning devices: ${error.message}`);
        }
        
        refreshBtn.disabled = false;
    }

    async selectHexFile() {
        try {
            const result = await window.electronAPI.selectHexFile();
            
            if (result.success) {
                this.handleFileSelection(result.filePath);
            }
        } catch (error) {
            this.appendOutput(`Error selecting file: ${error.message}`);
        }
    }

    async handleFileSelection(filePath) {
        this.selectedHexFile = filePath;
        const fileName = filePath.split(/[\\/]/).pop();
        
        try {
            // Get file size using the file stats
            const stats = await window.electronAPI.getFileStats(filePath);
            this.expectedFileSize = stats.size;
            
            // Update UI elements
            const fileInfo = document.getElementById('file-info');
            const fileNameElement = document.getElementById('file-name');
            const fileSizeElement = document.getElementById('file-size');
            
            fileNameElement.textContent = fileName;
            fileSizeElement.textContent = `${(stats.size / 1024).toFixed(1)} KB`;
            fileInfo.style.display = 'block';
            
            // Enable upload button
            document.getElementById('upload-btn').disabled = false;
            
        } catch (error) {
            console.error('Error getting file stats:', error);
            this.expectedFileSize = null;
            
            // Update UI with basic info
            const fileInfo = document.getElementById('file-info');
            const fileNameElement = document.getElementById('file-name');
            const fileSizeElement = document.getElementById('file-size');
            
            fileNameElement.textContent = fileName;
            fileSizeElement.textContent = 'Firmware File Selected';
            fileInfo.style.display = 'block';
            
            // Enable upload button
            document.getElementById('upload-btn').disabled = false;
        }
        
        this.appendOutput(`Selected firmware file: ${fileName}`);
        this.updateUploadButton();
    }

    async uploadFirmware() {
        if (!this.selectedHexFile || !this.selectedDevice || this.isUploading) {
            this.appendOutput('❌ Cannot start upload: missing file or device selection');
            return;
        }

        this.isUploading = true;
        const uploadBtn = document.getElementById('upload-btn');
        const progressContainer = document.getElementById('upload-progress');
        
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="btn-icon">⏳</span> Uploading...';
        progressContainer.style.display = 'block';
        
        // Clear previous progress
        this.updateProgressBar(0, 'Preparing upload...');
        
        // Clear upload output and show upload info
        this.clearSerialMonitor();
        this.appendSerialMonitor('🚀 Starting firmware upload process...');
        const fileName = this.selectedHexFile.split(/[\\/]/).pop(); // Extract filename from path
        this.appendSerialMonitor(`📁 File: ${fileName}`);
        this.appendSerialMonitor(`📦 Size: ${(this.expectedFileSize / 1024).toFixed(1)} KB`);
        this.appendSerialMonitor(`🔌 Device: ${this.selectedDevice.name || 'Unknown Device'}`);
        this.appendSerialMonitor('⏳ Initializing dfu-util...');
        this.appendSerialMonitor('--- dfu-util Output ---');
        
        // Also log to main output console
        this.appendOutput('🚀 Firmware upload started - see Upload Output for details');



        
        try {
            const result = await window.electronAPI.uploadFirmware({
                hexFilePath: this.selectedHexFile,
                deviceInfo: this.selectedDevice
            });
            
            if (result.success) {
                this.appendSerialMonitor('✅ Firmware uploaded successfully!');
                this.appendSerialMonitor('🎉 Device is ready to use');
                this.appendOutput('✅ Firmware uploaded successfully!');
                this.showProgressComplete();
            } else {
                this.appendSerialMonitor(`❌ Upload failed: ${result.error}`);
                this.appendOutput(`❌ Upload failed: ${result.error}`);
                this.updateProgressBar(0, 'Upload Failed');
            }
        } catch (error) {
            this.appendSerialMonitor(`❌ Upload error: ${error.message}`);
            this.appendOutput(`❌ Upload error: ${error.message}`);
            this.updateProgressBar(0, 'Upload Error');
        }
        
        this.isUploading = false;
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<span class="btn-icon">⬆️</span> Upload Firmware';
        
        // Hide progress container after a delay
        setTimeout(() => {
            progressContainer.style.display = 'none';
        }, 3000);
        
        this.updateUploadButton();
    }

    updateProgressBar(percentage, message) {
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
        
        if (progressText && message) {
            progressText.textContent = message;
        }
    }

    parseProgressFromDfuOutput(line) {
        // Parse different types of dfu-util output for progress information
        try {
            // Look for download progress (common in dfu-util output)
            const downloadMatch = line.match(/Download\s+\[\s*(\d+)%\s*\]/i);
            if (downloadMatch) {
                const percentage = parseInt(downloadMatch[1]);
                this.updateProgressBar(percentage, `Downloading... ${percentage}%`);
                return;
            }

            // Look for upload progress
            const uploadMatch = line.match(/Upload\s+\[\s*(\d+)%\s*\]/i);
            if (uploadMatch) {
                const percentage = parseInt(uploadMatch[1]);
                this.updateProgressBar(percentage, `Uploading... ${percentage}%`);
                return;
            }

            // Look for verification progress
            const verifyMatch = line.match(/Verify\s+\[\s*(\d+)%\s*\]/i);
            if (verifyMatch) {
                const percentage = parseInt(verifyMatch[1]);
                this.updateProgressBar(percentage, `Verifying... ${percentage}%`);
                return;
            }

            // Look for bytes transferred (calculate percentage if possible)
            const bytesMatch = line.match(/(\d+)\s+bytes/i);
            if (bytesMatch && this.expectedFileSize) {
                const bytes = parseInt(bytesMatch[1]);
                const percentage = Math.min(100, Math.round((bytes / this.expectedFileSize) * 100));
                this.updateProgressBar(percentage, `Transferring... ${percentage}%`);
                return;
            }

            // Update progress text based on key phrases
            if (line.match(/Opening DFU capable USB device/i)) {
                this.updateProgressBar(10, 'Opening device...');
            } else if (line.match(/Device ID/i)) {
                this.updateProgressBar(20, 'Device identified');
            } else if (line.match(/Claiming USB DFU Interface/i)) {
                this.updateProgressBar(30, 'Claiming interface...');
            } else if (line.match(/Setting Alternate Setting/i)) {
                this.updateProgressBar(40, 'Setting up device...');
            } else if (line.match(/Determining device status/i)) {
                this.updateProgressBar(50, 'Checking device status...');
            } else if (line.match(/DFU mode device DFU version/i)) {
                this.updateProgressBar(60, 'Updating Firmware... Do not interrupt this process!');
            } else if (line.match(/Downloading to address/i)) {
                this.updateProgressBar(70, 'Starting download...');
            } else if (line.match(/Download done/i)) {
                this.updateProgressBar(90, 'Download complete');
            } else if (line.match(/File downloaded successfully/i)) {
                this.updateProgressBar(95, 'Upload successful');
            } else if (line.match(/Transitioning to dfuMANIFEST state/i)) {
                this.updateProgressBar(98, 'Finalizing...');
            }
        } catch (error) {
            console.warn('Error parsing dfu-util output:', error);
        }
    }

    updateUploadButton() {
        const uploadBtn = document.getElementById('upload-btn');
        uploadBtn.disabled = !this.selectedHexFile || !this.selectedDevice || this.isUploading;
    }

    showProgressComplete() {
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        
        progressFill.style.width = '100%';
        progressText.textContent = 'Upload Complete!';
        
        setTimeout(() => {
            document.getElementById('upload-progress').style.display = 'none';
        }, 2000);
    }

    // Serial Port Management
    async refreshSerialPorts() {
        const portSelect = document.getElementById('port-select');
        
        try {
            const result = await window.electronAPI.getSerialPorts();
            
            portSelect.innerHTML = '<option value="">Select a port...</option>';
            
            if (result.success && result.ports.length > 0) {
                result.ports.forEach(port => {
                    const option = document.createElement('option');
                    option.value = port.path;
                    option.textContent = `${port.path}${port.friendlyName ? ` (${port.friendlyName})` : ''}`;
                    portSelect.appendChild(option);
                });
            } else {
                const option = document.createElement('option');
                option.textContent = 'No serial ports found';
                portSelect.appendChild(option);
            }
        } catch (error) {
            this.appendTerminalOutput(`Error refreshing ports: ${error.message}`);
        }
    }

        // Serial Terminal Management
    connectSerial() {
        const portSelect = document.getElementById('port-select');
        
        const selectedPort = portSelect.value;
        const selectedBaud = 115200; // Fixed baud rate
        
        if (!selectedPort) {
            this.appendOutput('Please select a serial port first.');
            return;
        }

        // For now, we'll simulate the connection
        this.isConnected = true;
        this.updateSerialUI();
        this.updateHeaderConnectionUI(); // Update header UI as well
        this.appendOutput(`Connected to ${selectedPort} at ${selectedBaud} baud`);
        
        // Sync header selection
        document.getElementById('header-port-select').value = selectedPort;
    }

    disconnectSerial() {
        this.isConnected = false;
        this.updateSerialUI();
        this.updateHeaderConnectionUI(); // Update header UI as well
        this.appendOutput('Disconnected from serial port');
    }

    updateSerialUI() {
        const connectBtn = document.getElementById('connect-btn');
        const disconnectBtn = document.getElementById('disconnect-btn');
        const sendBtn = document.getElementById('send-btn');
        const commandInput = document.getElementById('command-input');
        
        if (this.isConnected) {
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            sendBtn.disabled = false;
            commandInput.disabled = false;
        } else {
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
            sendBtn.disabled = true;
            commandInput.disabled = true;
        }
    }

    disconnectSerial() {
        this.isConnected = false;
        this.updateSerialUI();
        this.updateConnectionStatus('disconnected');
        this.appendTerminalOutput('Disconnected from serial port\n');
    }

    updateSerialUI() {
        const connectBtn = document.getElementById('connect-btn');
        const disconnectBtn = document.getElementById('disconnect-btn');
        const terminalInput = document.getElementById('terminal-input');
        const sendBtn = document.getElementById('send-btn');
        
        connectBtn.disabled = this.isConnected;
        disconnectBtn.disabled = !this.isConnected;
        terminalInput.disabled = !this.isConnected;
        sendBtn.disabled = !this.isConnected;
    }

    sendSerialCommand() {
        const terminalInput = document.getElementById('terminal-input');
        const command = terminalInput.value.trim();
        
        if (!command || !this.isConnected) {
            return;
        }
        
        this.appendTerminalOutput(`> ${command}\n`);
        
        // Simulate command processing (replace with actual serial communication)
        setTimeout(() => {
            const response = `Echo: ${command}\n`;
            this.appendTerminalOutput(response);
            
            // Check for power data in response
            this.parsePowerFromSerial(response);
            
            // Simulate power response for demo
            if (command.toLowerCase().includes('power') || command.toLowerCase().includes('pwr')) {
                const simulatedPower = 25 + Math.random() * 50;
                const powerResponse = `POWER:${simulatedPower.toFixed(1)}\n`;
                setTimeout(() => {
                    this.appendTerminalOutput(powerResponse);
                    this.parsePowerFromSerial(powerResponse);
                }, 200);
            }
        }, 100);
        
        terminalInput.value = '';
    }

    // Configuration Management (implemented earlier)
    // Utility Functions

    // Theme Toggle Setup
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
        });
    }

    setTheme(theme) {
        const themeIcon = document.querySelector('#theme-toggle .btn-icon');
        
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeIcon.textContent = '☀️';
            document.getElementById('theme-toggle').title = 'Switch to Light Mode';
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            themeIcon.textContent = '🌙';
            document.getElementById('theme-toggle').title = 'Switch to Dark Mode';
        }
    }

    // Output Console Toggle
    setupOutputToggle() {
        const outputSection = document.getElementById('output-section');
        const toggleBtn = document.getElementById('toggle-output-btn');
        const clearConsoleBtn = document.getElementById('clear-console-btn');
        const clearSerialMonitorBtn = document.getElementById('clear-serial-monitor-btn');
        
        // Set initial state from config
        if (!this.config.outputVisible) {
            outputSection.style.display = 'none';
            toggleBtn.innerHTML = '<span class="btn-icon">👁️</span> Show Output';
        } else {
            outputSection.style.display = 'block';
            toggleBtn.innerHTML = '<span class="btn-icon">🙈</span> Hide Output';
        }
        
        toggleBtn.addEventListener('click', () => {
            this.config.outputVisible = !this.config.outputVisible;
            this.saveConfig();
            
            if (this.config.outputVisible) {
                outputSection.style.display = 'block';
                toggleBtn.innerHTML = '<span class="btn-icon">🙈</span> Hide Output';
            } else {
                outputSection.style.display = 'none';
                toggleBtn.innerHTML = '<span class="btn-icon">👁️</span> Show Output';
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

    // Header Connection Panel Setup
    setupHeaderConnection() {
        // Check if header connection is enabled
        if (!this.uiSettings.headerConnection) {
            console.log('Header connection panel disabled via uiSettings');
            return;
        }
        
        const connectionToggle = document.getElementById('connection-toggle');
        const connectionDropdown = document.getElementById('connection-dropdown');
        const connectionPanel = document.querySelector('.connection-panel');
        
        // Toggle dropdown visibility
        connectionToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            connectionPanel.classList.toggle('expanded');
            connectionDropdown.classList.toggle('visible');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!connectionPanel.contains(e.target)) {
                connectionPanel.classList.remove('expanded');
                connectionDropdown.classList.remove('visible');
            }
        });
        
        // Prevent dropdown from closing when clicking inside
        connectionDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Header port refresh button
        document.getElementById('header-refresh-ports-btn').addEventListener('click', async () => {
            await this.refreshHeaderSerialPorts();
        });
        
        // Header connect/disconnect buttons
        document.getElementById('header-connect-btn').addEventListener('click', () => {
            this.connectHeaderSerial();
        });
        
        document.getElementById('header-disconnect-btn').addEventListener('click', () => {
            this.disconnectHeaderSerial();
        });
        
        // Initialize header serial ports
        this.refreshHeaderSerialPorts();
        this.updateHeaderConnectionUI();
    }

    // Header Serial Port Management
    async refreshHeaderSerialPorts() {
        const portSelect = document.getElementById('header-port-select');
        const refreshBtn = document.getElementById('header-refresh-ports-btn');
        
        refreshBtn.style.opacity = '0.5';
        
        try {
            const result = await window.electronAPI.getSerialPorts();
            
            portSelect.innerHTML = '<option value="">Select a port...</option>';
            
            if (result.success && result.ports.length > 0) {
                result.ports.forEach(port => {
                    const option = document.createElement('option');
                    option.value = port.path;
                    option.textContent = `${port.path}${port.friendlyName ? ` (${port.friendlyName})` : ''}`;
                    portSelect.appendChild(option);
                });
                
                // Restore last selected port from config
                if (this.config.lastPort && portSelect.querySelector(`option[value="${this.config.lastPort}"]`)) {
                    portSelect.value = this.config.lastPort;
                }
                
                this.appendOutput(`Found ${result.ports.length} serial port(s)`);
            } else {
                const option = document.createElement('option');
                option.textContent = 'No serial ports found';
                option.disabled = true;
                portSelect.appendChild(option);
            }
        } catch (error) {
            this.appendOutput(`Error refreshing ports: ${error.message}`);
        }
        
        refreshBtn.style.opacity = '1';
        
        // Also refresh the tab ports to keep them in sync
        this.refreshSerialPorts();
    }

    connectHeaderSerial() {
        const portSelect = document.getElementById('header-port-select');
        
        const selectedPort = portSelect.value;
        const selectedBaud = 115200; // Fixed baud rate
        
        if (!selectedPort) {
            this.appendOutput('Please select a serial port first.');
            return;
        }

        // Save to config
        this.config.lastPort = selectedPort;
        this.config.lastBaud = selectedBaud.toString();
        this.saveConfig();

        // For now, we'll simulate the connection
        this.isConnected = true;
        this.updateHeaderConnectionUI();
        this.updateSerialUI(); // Update tab UI as well
        this.appendOutput(`Connected to ${selectedPort} at ${selectedBaud} baud`);
        
        // Auto-close the dropdown after connecting
        const connectionPanel = document.querySelector('.connection-panel');
        const connectionDropdown = document.getElementById('connection-dropdown');
        connectionPanel.classList.remove('expanded');
        connectionDropdown.classList.remove('visible');
    }

    disconnectHeaderSerial() {
        this.isConnected = false;
        this.updateHeaderConnectionUI();
        this.updateSerialUI(); // Update tab UI as well
        this.appendOutput('Disconnected from serial port');
        
        // Auto-close the dropdown after disconnecting
        const connectionPanel = document.querySelector('.connection-panel');
        const connectionDropdown = document.getElementById('connection-dropdown');
        connectionPanel.classList.remove('expanded');
        connectionDropdown.classList.remove('visible');
    }

    updateHeaderConnectionUI() {
        const connectionDot = document.getElementById('connection-dot');
        const connectionText = document.getElementById('connection-text');
        const connectBtn = document.getElementById('header-connect-btn');
        const disconnectBtn = document.getElementById('header-disconnect-btn');
        
        if (this.isConnected) {
            connectionDot.classList.add('connected');
            connectionText.textContent = 'Connected';
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
        } else {
            connectionDot.classList.remove('connected');
            connectionText.textContent = 'Disconnected';
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
        }
    }

    updateConnectionStatus(status) {
        const statusElement = document.querySelector('.status-text');
        const statusDot = document.querySelector('.status-dot');
        
        if (status === 'connected') {
            statusElement.textContent = 'Device Connected';
            statusDot.style.background = 'var(--color-success)';
        } else {
            statusElement.textContent = 'Ready';
            statusDot.style.background = 'var(--color-primary)';
        }
    }

    // Output Functions
    appendOutput(message) {
        try {
            const output = document.getElementById('output-console');
            if (output) {
                const timestamp = new Date().toLocaleTimeString();
                output.textContent += `[${timestamp}] ${message}\n`;
                output.scrollTop = output.scrollHeight;
            } else {
                console.warn('Output console element not found');
            }
        } catch (error) {
            console.error('Error appending output:', error);
        }
    }

    appendTerminalOutput(message) {
        const terminal = document.getElementById('terminal-output');
        terminal.textContent += message;
        terminal.scrollTop = terminal.scrollHeight;
    }

    appendSerialMonitor(message) {
        try {
            const serialMonitor = document.getElementById('serial-monitor-output');
            if (serialMonitor) {
                const timestamp = new Date().toLocaleTimeString();
                serialMonitor.textContent += `[${timestamp}] ${message}\n`;
                serialMonitor.scrollTop = serialMonitor.scrollHeight;
            } else {
                console.warn('Upload output element not found');
            }
        } catch (error) {
            console.error('Error appending to upload output:', error);
        }
    }

    clearSerialMonitor() {
        try {
            const serialMonitor = document.getElementById('serial-monitor-output');
            if (serialMonitor) {
                serialMonitor.textContent = '';
            }
        } catch (error) {
            console.error('Error clearing upload output:', error);
        }
    }

    // Configuration Management
    loadConfig() {
        try {
            const saved = localStorage.getItem('dwm-control-config');
            const defaultConfig = {
                theme: 'dark',
                outputVisible: false,
                lastDevice: null,
                lastPort: null,
                lastBaud: 115200
            };
            
            return saved ? JSON.parse(saved) : defaultConfig;
        } catch (error) {
            console.warn('Failed to load config, using defaults:', error);
            return {
                theme: 'dark',
                outputVisible: false,
                lastDevice: null,
                lastPort: null,
                lastBaud: 115200
            };
        }
    }

    saveConfig() {
        try {
            localStorage.setItem('dwm-control-config', JSON.stringify(this.config));
        } catch (error) {
            console.warn('Failed to save config:', error);
        }
    }

}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dwm = new DWMControl();
    console.log('DWM Control initialized.');
});
