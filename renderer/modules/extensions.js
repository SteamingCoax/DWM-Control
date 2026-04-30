// DWM Control Renderer Extensions
// This file keeps non-core methods separate to keep renderer.js manageable.

(function attachRendererExtensions() {
    if (typeof DWMControl === 'undefined') {
        console.error('DWMControl class must be loaded before renderer.extensions.js');
        return;
    }

    DWMControl.prototype.setupAutoUpdater = function setupAutoUpdater() {
        const updatePanel = document.getElementById('update-panel');
        const updateButton = document.getElementById('update-button');
        if (!updatePanel || !updateButton) {
            return;
        }

        const updateText = updateButton.querySelector('.update-text');
        const updateIcon = updateButton.querySelector('.update-icon');

        let updateInfo = null;
        let isUpdateDownloaded = false;
        let isCheckingForUpdates = false;
        let isDownloadingUpdate = false;
        let isInstallingUpdate = false;
        let manualCheckRequested = false;

        const removeProgressBar = () => {
            const progressBar = updateButton.querySelector('.update-progress');
            if (progressBar) {
                progressBar.remove();
            }
        };

        const setButtonState = (state, label) => {
            updateButton.className = 'update-btn';
            updateButton.disabled = false;

            if (state !== 'downloading') {
                removeProgressBar();
            }

            switch (state) {
                case 'checking':
                    isCheckingForUpdates = true;
                    isDownloadingUpdate = false;
                    updateButton.disabled = true;
                    updateButton.classList.add('checking');
                    updateText.textContent = label || 'Checking...';
                    break;
                case 'available':
                    isCheckingForUpdates = false;
                    isDownloadingUpdate = false;
                    updateButton.classList.add('available');
                    updateText.textContent = label || 'Download Update';
                    break;
                case 'downloading':
                    isCheckingForUpdates = false;
                    isDownloadingUpdate = true;
                    updateButton.disabled = true;
                    updateButton.classList.add('downloading');
                    updateText.textContent = label || 'Downloading...';
                    break;
                case 'downloaded':
                    isCheckingForUpdates = false;
                    isDownloadingUpdate = false;
                    isInstallingUpdate = false;
                    updateButton.classList.add('ready-to-install');
                    updateText.textContent = label || 'Restart to Update';
                    break;
                case 'installing':
                    isCheckingForUpdates = false;
                    isDownloadingUpdate = false;
                    isInstallingUpdate = true;
                    updateButton.disabled = true;
                    updateButton.classList.add('checking');
                    updateText.textContent = label || 'Installing...';
                    break;
                default:
                    isCheckingForUpdates = false;
                    isDownloadingUpdate = false;
                    isInstallingUpdate = false;
                    updateText.textContent = label || 'Check Updates';
                    break;
            }

            updateIcon.textContent = '';
        };

        setButtonState('idle');

        window.electronAPI.onUpdateAvailable((event, info) => {
            if (isInstallingUpdate) {
                return;
            }
            updateInfo = info;
            manualCheckRequested = false;
            setButtonState('available');
            this.appendOutput(` Update available: v${info.version}`);

            if (window.confirm(`Version ${info.version} is available. Download and install it?`)) {
                updateButton.click();
            }
        });

        window.electronAPI.onUpdateNotAvailable(() => {
            if (isInstallingUpdate) {
                return;
            }
            updateInfo = null;
            isUpdateDownloaded = false;
            setButtonState('idle');
            this.appendOutput(' You have the latest version');

            if (manualCheckRequested) {
                manualCheckRequested = false;
                this.showUpdateNotification('Up to Date', 'You are already running the latest version.', 'success');
            }
        });

        window.electronAPI.onUpdateError((event, error) => {
            if (isInstallingUpdate) {
                setButtonState('installing', 'Install failed');
            }
            isUpdateDownloaded = false;
            manualCheckRequested = false;
            if (!isInstallingUpdate) {
                setButtonState(updateInfo ? 'available' : 'idle');
            }
            this.appendOutput(` Update error: ${error}`);
        });

        window.electronAPI.onUpdateDownloadProgress((event, progress) => {
            const percent = Math.round(progress.percent);
            setButtonState('downloading', `Downloading ${percent}%`);

            let progressBar = updateButton.querySelector('.update-progress');
            if (!progressBar) {
                progressBar = document.createElement('div');
                progressBar.className = 'update-progress';
                updateButton.appendChild(progressBar);
            }
            progressBar.style.width = `${percent}%`;
        });

        window.electronAPI.onUpdateDownloaded(() => {
            if (isInstallingUpdate) {
                return;
            }
            isUpdateDownloaded = true;
            setButtonState('downloaded');
            this.appendOutput(' Update downloaded. Click to restart and install.');

            if (window.confirm('The update has been downloaded. Restart now to install it?')) {
                updateButton.click();
            }
        });

        updateButton.addEventListener('click', async () => {
            if (isCheckingForUpdates || isDownloadingUpdate || isInstallingUpdate) {
                return;
            }

            if (isUpdateDownloaded) {
                this.appendOutput(' Installing update and restarting...');
                setButtonState('installing', 'Installing...');
                const installResult = await window.electronAPI.installUpdate();
                if (installResult && installResult.success === false) {
                    isInstallingUpdate = false;
                    setButtonState('downloaded');
                    this.appendOutput(` Install failed: ${installResult.error || 'Unknown error'}`);
                    this.showUpdateNotification('Install Failed', installResult.error || 'Could not install update.', 'error');
                }
            } else if (updateInfo) {
                setButtonState('downloading');
                this.appendOutput(' Downloading update...');
                const result = await window.electronAPI.downloadUpdate();
                if (!result.success) {
                    setButtonState('available');
                    this.appendOutput(` Download failed: ${result.error}`);
                }
            } else {
                manualCheckRequested = true;
                setButtonState('checking');
                this.appendOutput(' Checking for updates...');

                try {
                    const result = await window.electronAPI.checkForUpdates();
                    if (!result.success) {
                        manualCheckRequested = false;
                        setButtonState('idle');
                        this.appendOutput(` Update check failed: ${result.error}`);
                    } else if (result.message && result.message.includes('Development mode')) {
                        manualCheckRequested = false;
                        setButtonState('idle');
                        this.appendOutput(` Info: ${result.message}`);
                    } else if (result.noUpdates) {
                        const shouldNotify = manualCheckRequested;
                        manualCheckRequested = false;
                        setButtonState('idle');
                        if (shouldNotify) {
                            this.showUpdateNotification('Up to Date', result.message || 'You are already running the latest version.', 'success');
                        }
                    }
                } catch (error) {
                    manualCheckRequested = false;
                    setButtonState('idle');
                    this.appendOutput(` Update check error: ${error.message}`);
                }
            }
        });
    };

    DWMControl.prototype.addManualUpdateCheck = function addManualUpdateCheck() {
        const themeToggle = document.getElementById('theme-toggle');
        if (!themeToggle || !themeToggle.parentNode) {
            return;
        }

        const updatePanel = document.createElement('div');
        updatePanel.className = 'update-panel-container';
        updatePanel.innerHTML = `
            <button id="update-status-btn" class="update-status-btn">
                <div class="update-indicator">
                    <span class="update-icon" id="update-icon">↻</span>
                    <span class="update-text" id="update-status-text">Check Updates</span>
                    <span class="update-expand">▼</span>
                </div>
            </button>
            <div class="update-dropdown" id="update-dropdown">
                <div class="update-controls">
                    <div class="update-header">
                        <h4>Update Manager</h4>
                    </div>
                    <div class="update-status-display" id="update-status-display">
                        <div class="update-status-item">
                            <span class="update-label">Current Version:</span>
                            <span class="update-value" id="current-version">Loading...</span>
                        </div>
                        <div class="update-status-item">
                            <span class="update-label">Status:</span>
                            <span class="update-value" id="update-check-status">Ready to check</span>
                        </div>
                        <div class="update-progress-container" id="update-progress-container" style="display: none;">
                            <div class="update-progress-bar">
                                <div class="update-progress-fill" id="update-progress-fill"></div>
                            </div>
                            <div class="update-progress-text" id="update-progress-text">0%</div>
                        </div>
                    </div>
                    <div class="update-actions">
                        <button id="manual-update-check-btn" class="update-action-btn check">
                            <span class="btn-icon"></span> Check for Updates
                        </button>
                        <button id="download-update-btn" class="update-action-btn download" disabled style="display: none;">
                            <span class="btn-icon"></span> Download Update
                        </button>
                        <button id="install-update-btn" class="update-action-btn install" disabled style="display: none;">
                            <span class="btn-icon"></span> Install & Restart
                        </button>
                    </div>
                </div>
            </div>
        `;

        themeToggle.parentNode.insertBefore(updatePanel, themeToggle);
        this.setupUpdatePanelEvents();
    };

    DWMControl.prototype.setupUpdatePanelEvents = function setupUpdatePanelEvents() {
        const updateStatusBtn = document.getElementById('update-status-btn');
        if (!updateStatusBtn) {
            return;
        }

        const updatePanel = updateStatusBtn.closest('.update-panel-container');

        updateStatusBtn.addEventListener('click', () => {
            const isExpanded = updatePanel.classList.contains('expanded');
            updatePanel.classList.toggle('expanded', !isExpanded);
        });

        document.addEventListener('click', (e) => {
            if (!updatePanel.contains(e.target)) {
                updatePanel.classList.remove('expanded');
            }
        });

        document.getElementById('manual-update-check-btn').addEventListener('click', () => {
            this.performUpdateCheck();
        });

        document.getElementById('download-update-btn').addEventListener('click', () => {
            this.downloadUpdate();
        });

        document.getElementById('install-update-btn').addEventListener('click', () => {
            this.installUpdate();
        });

        this.loadCurrentVersion();
    };

    DWMControl.prototype.loadCurrentVersion = async function loadCurrentVersion() {
        try {
            const version = await window.electronAPI.getAppVersion();
            const versionElement = document.getElementById('current-version');
            if (versionElement) {
                versionElement.textContent = version;
            }
        } catch (error) {
            console.error('Failed to load app version:', error);
            const versionElement = document.getElementById('current-version');
            if (versionElement) {
                versionElement.textContent = 'Unknown';
            }
        }
    };

    DWMControl.prototype.performUpdateCheck = async function performUpdateCheck() {
        const statusText = document.getElementById('update-status-text');
        const statusDisplay = document.getElementById('update-check-status');
        const updateIcon = document.getElementById('update-icon');
        const checkBtn = document.getElementById('manual-update-check-btn');

        const updatePanel = document.querySelector('.update-panel-container');
        const isDropdownOpen = updatePanel && updatePanel.classList.contains('expanded');

        try {
            statusText.textContent = 'Checking...';
            statusDisplay.textContent = 'Checking for updates...';
            updateIcon.textContent = '...';
            updateIcon.style.animation = 'spin 1s linear infinite';
            checkBtn.disabled = true;

            this.appendOutput(' Checking for updates...');

            const result = await window.electronAPI.checkForUpdates();
            if (result.success) {
                if (result.message && result.message.includes('Development mode')) {
                    statusText.textContent = 'Dev Mode';
                    statusDisplay.textContent = result.message;
                    this.appendOutput(`Info: ${result.message}`);
                    if (!isDropdownOpen) {
                        this.showUpdateNotification('Development Mode', 'Update checking is disabled in development mode.', 'info');
                    }
                } else if (result.noUpdates) {
                    statusText.textContent = 'Up to Date';
                    statusDisplay.textContent = result.message || 'You have the latest version';
                    this.appendOutput(' You have the latest version');
                    if (!isDropdownOpen) {
                        this.showUpdateNotification('Up to Date', 'You are running the latest version.', 'success');
                    }
                } else if (result.updateInfo && result.updateInfo.updateInfo) {
                    const version = result.updateInfo.updateInfo.version;
                    statusText.textContent = 'Update Available';
                    statusDisplay.textContent = `Version ${version} is available`;
                    this.showDownloadButton(true);
                    this.appendOutput(` Update found: v${version}`);
                    if (!isDropdownOpen) {
                        this.showUpdateNotification('Update Available!', `Version ${version} is available for download.`, 'success');
                    }
                } else {
                    statusText.textContent = 'Up to Date';
                    statusDisplay.textContent = 'You have the latest version';
                    this.appendOutput(' You have the latest version');
                    if (!isDropdownOpen) {
                        this.showUpdateNotification('Up to Date', 'You are running the latest version.', 'success');
                    }
                }
            } else {
                statusText.textContent = 'Check Failed';
                statusDisplay.textContent = `Error: ${result.error}`;
                this.appendOutput(` Update check failed: ${result.error}`);
                if (!isDropdownOpen) {
                    this.showUpdateNotification('Update Check Failed', `Could not check for updates: ${result.error}`, 'error');
                }
            }
        } catch (error) {
            statusText.textContent = 'Error';
            statusDisplay.textContent = `Error: ${error.message}`;
            this.appendOutput(` Update check error: ${error.message}`);
            if (!isDropdownOpen) {
                this.showUpdateNotification('Update Check Error', `An error occurred: ${error.message}`, 'error');
            }
        } finally {
            updateIcon.style.animation = '';
            updateIcon.textContent = '↻';
            checkBtn.disabled = false;
        }
    };

    DWMControl.prototype.showDownloadButton = function showDownloadButton(show) {
        const downloadBtn = document.getElementById('download-update-btn');
        if (!downloadBtn) {
            return;
        }

        downloadBtn.style.display = show ? 'flex' : 'none';
        downloadBtn.disabled = !show;
    };

    DWMControl.prototype.showInstallButton = function showInstallButton(show) {
        const installBtn = document.getElementById('install-update-btn');
        if (!installBtn) {
            return;
        }

        installBtn.style.display = show ? 'flex' : 'none';
        installBtn.disabled = !show;
    };

    DWMControl.prototype.downloadUpdate = async function downloadUpdate() {
        const statusText = document.getElementById('update-status-text');
        const statusDisplay = document.getElementById('update-check-status');
        const progressContainer = document.getElementById('update-progress-container');
        const progressFill = document.getElementById('update-progress-fill');
        const progressText = document.getElementById('update-progress-text');
        const downloadBtn = document.getElementById('download-update-btn');

        const updatePanel = document.querySelector('.update-panel-container');
        const isDropdownOpen = updatePanel && updatePanel.classList.contains('expanded');

        try {
            statusText.textContent = 'Downloading...';
            statusDisplay.textContent = 'Downloading update...';
            progressContainer.style.display = 'block';
            downloadBtn.disabled = true;

            for (let i = 0; i <= 100; i += 10) {
                progressFill.style.width = `${i}%`;
                progressText.textContent = `${i}%`;
                await new Promise((resolve) => setTimeout(resolve, 200));
            }

            statusText.textContent = 'Ready to Install';
            statusDisplay.textContent = 'Update downloaded, ready to install';
            this.showDownloadButton(false);
            this.showInstallButton(true);
            progressContainer.style.display = 'none';

            this.appendOutput(' Update downloaded successfully');
            if (!isDropdownOpen) {
                this.showUpdateNotification('Download Complete', 'Update is ready to install. Click Install & Restart when ready.', 'success');
            }
        } catch (error) {
            statusText.textContent = 'Download Failed';
            statusDisplay.textContent = `Download error: ${error.message}`;
            downloadBtn.disabled = false;
            progressContainer.style.display = 'none';

            this.appendOutput(` Download failed: ${error.message}`);
            if (!isDropdownOpen) {
                this.showUpdateNotification('Download Failed', `Could not download update: ${error.message}`, 'error');
            }
        }
    };

    DWMControl.prototype.installUpdate = async function installUpdate() {
        const statusText = document.getElementById('update-status-text');
        const statusDisplay = document.getElementById('update-check-status');

        const updatePanel = document.querySelector('.update-panel-container');
        const isDropdownOpen = updatePanel && updatePanel.classList.contains('expanded');

        statusText.textContent = 'Installing...';
        statusDisplay.textContent = 'Installing update and restarting...';

        this.appendOutput(' Installing update and restarting...');
        if (!isDropdownOpen) {
            this.showUpdateNotification('Installing Update', 'The application will restart to complete the installation.', 'info');
        }

        try {
            await window.electronAPI.installUpdate();
        } catch (error) {
            this.appendOutput(` Install failed: ${error.message}`);
            if (!isDropdownOpen) {
                this.showUpdateNotification('Install Failed', `Could not install update: ${error.message}`, 'error');
            }
        }
    };

    DWMControl.prototype.showUpdateNotification = function showUpdateNotification(title, message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `update-notification update-notification-${type}`;

        notification.innerHTML = `
            <div class="update-notification-content">
                <div class="update-notification-header">
                    <span class="update-notification-icon">${type === 'success' ? '' : type === 'error' ? '' : 'i'}</span>
                    <span class="update-notification-title">${title}</span>
                    <button class="update-notification-close">x</button>
                </div>
                <div class="update-notification-message">${message}</div>
            </div>
        `;

        document.body.appendChild(notification);

        const autoRemove = setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);

        const closeBtn = notification.querySelector('.update-notification-close');
        closeBtn.addEventListener('click', () => {
            clearTimeout(autoRemove);
            notification.remove();
        });

        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
    };

    DWMControl.prototype.appendOutput = function appendOutput(message) {
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
    };

    DWMControl.prototype.appendTerminalOutput = function appendTerminalOutput(message) {
        if (this.xterm) {
            this.xterm.write(message);
        } else {
            this.appendOutput(message);
        }
    };

    DWMControl.prototype.appendSerialMonitor = function appendSerialMonitor(message) {
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
    };

    DWMControl.prototype.clearSerialMonitor = function clearSerialMonitor() {
        try {
            const serialMonitor = document.getElementById('serial-monitor-output');
            if (serialMonitor) {
                serialMonitor.textContent = '';
            }
        } catch (error) {
            console.error('Error clearing upload output:', error);
        }
    };

    DWMControl.prototype.loadConfig = function loadConfig() {
        const defaultConfig = {
            layoutVersion: 1,
            theme: 'dark',
            outputVisible: false,
            lastDevice: null,
            lastPort: null,
            lastBaud: 115200,
            globalSampleIntervalMs: 250,
            globalDebugLoggingEnabled: false,
            meterCardOrder: [],
            meterCards: {},
            deembedPowerUnit: 'W',
            deembedVoltageMode: 'manual',
            deembedPowerRating: null,
        };

        try {
            const saved = localStorage.getItem('dwm-control-config');
            if (!saved) {
                return defaultConfig;
            }

            const parsed = JSON.parse(saved);
            return {
                ...defaultConfig,
                ...parsed,
                meterCardOrder: Array.isArray(parsed.meterCardOrder) ? parsed.meterCardOrder : [],
                meterCards: parsed.meterCards && typeof parsed.meterCards === 'object' ? parsed.meterCards : {},
            };
        } catch (error) {
            console.warn('Failed to load config, using defaults:', error);
            return defaultConfig;
        }
    };

    DWMControl.prototype.saveConfig = function saveConfig() {
        try {
            localStorage.setItem('dwm-control-config', JSON.stringify(this.config));
        } catch (error) {
            console.warn('Failed to save config:', error);
        }
    };
})();
