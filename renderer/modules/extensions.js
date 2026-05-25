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
        let hasMacSignatureError = false;
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
                    updateText.textContent = label || 'Update Available';
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
            hasMacSignatureError = false;
            updateInfo = info;
            manualCheckRequested = false;
            setButtonState('available');
            this.appendOutput(` Update available: v${info.version}. Click "Update Available" to install.`);
        });

        window.electronAPI.onUpdateNotAvailable(() => {
            if (isInstallingUpdate) {
                return;
            }
            hasMacSignatureError = false;
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
            const isMacSignatureError = typeof error === 'string' && error.includes('not signed for macOS auto-update');
            hasMacSignatureError = isMacSignatureError;
            if (isInstallingUpdate) {
                setButtonState('installing', 'Install failed');
            }
            isUpdateDownloaded = false;
            manualCheckRequested = false;
            if (!isInstallingUpdate) {
                setButtonState(updateInfo ? 'available' : 'idle');
            }
            this.appendOutput(` Update error: ${error}`);

            if (isMacSignatureError) {
                this.showUpdateNotification('Signed Build Required', 'This app install is not signed for macOS auto-update. Install an official signed release build first.', 'error');
            }
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
            if (isInstallingUpdate || hasMacSignatureError) {
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
                // Flush latest preferences before app restart/install.
                this.saveConfig();
                this.appendOutput(' Installing update and restarting...');
                setButtonState('installing', 'Installing...');
                const installResult = await window.electronAPI.installUpdate();
                if (installResult && installResult.success === false) {
                    isInstallingUpdate = false;
                    setButtonState('downloaded');
                    this.appendOutput(` Install failed: ${installResult.error || 'Unknown error'}`);
                    this.showUpdateNotification('Install Failed', installResult.error || 'Could not install update.', 'error');
                } else {
                    // If the app does not quit for update shortly after success,
                    // restore the button so the user is not stuck on "Installing...".
                    setTimeout(() => {
                        if (isInstallingUpdate) {
                            isInstallingUpdate = false;
                            setButtonState('downloaded');
                            this.appendOutput(' Install did not restart automatically. Verify this is a packaged app and in /Applications, then try again.');
                            this.showUpdateNotification(
                                'Install Not Completed',
                                'The app did not restart to apply the update. Ensure you are running the packaged app from /Applications and try again.',
                                'error'
                            );
                        }
                    }, 12000);
                }
            } else if (updateInfo) {
                if (!window.confirm(`Version ${updateInfo.version} is available.\n\nDownload and install now?`)) {
                    return;
                }
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

    DWMControl.prototype._normalizeLoadedConfig = function _normalizeLoadedConfig(defaultConfig, parsed) {
        const cfg = (parsed && typeof parsed === 'object') ? parsed : {};

        const asStringArray = (value) => Array.isArray(value)
            ? value.filter(v => typeof v === 'string' && v.length > 0)
            : [];

        const normalizeMeterCardPrefs = (prefs) => {
            if (!prefs || typeof prefs !== 'object') return {};
            const out = {};

            if (prefs.viewMode === 'meters' || prefs.viewMode === 'history') {
                out.viewMode = prefs.viewMode;
            }

            const allowedLayouts = new Set(['dual', 'single-L', 'single-R', 'wide-left', 'wide-right', 'stacked']);
            if (typeof prefs.cardLayout === 'string' && allowedLayouts.has(prefs.cardLayout)) {
                out.cardLayout = prefs.cardLayout;
            }

            const allowedMetrics = new Set(['avg', 'peak', 'inst', 'max', 'min', 'dev']);
            if (typeof prefs.gaugeMetricL === 'string' && allowedMetrics.has(prefs.gaugeMetricL)) out.gaugeMetricL = prefs.gaugeMetricL;
            if (typeof prefs.gaugeMetricR === 'string' && allowedMetrics.has(prefs.gaugeMetricR)) out.gaugeMetricR = prefs.gaugeMetricR;

            const allowedDisplays = new Set(['gauge', 'numeric']);
            if (typeof prefs.gaugeDisplayL === 'string' && allowedDisplays.has(prefs.gaugeDisplayL)) out.gaugeDisplayL = prefs.gaugeDisplayL;
            if (typeof prefs.gaugeDisplayR === 'string' && allowedDisplays.has(prefs.gaugeDisplayR)) out.gaugeDisplayR = prefs.gaugeDisplayR;

            if (Number.isFinite(prefs.historyWindowMs) && prefs.historyWindowMs > 0) {
                out.historyWindowMs = Number.parseInt(prefs.historyWindowMs, 10);
            }

            if (Array.isArray(prefs.historyLines) && prefs.historyLines.length > 0) {
                const lines = prefs.historyLines
                    .filter(v => typeof v === 'string' && allowedMetrics.has(v));
                if (lines.length) out.historyLines = [...new Set(lines)].slice(0, 6);
            }

            if (Number.isFinite(prefs.pepHoldMs) && prefs.pepHoldMs >= 0) {
                out.pepHoldMs = Number.parseInt(prefs.pepHoldMs, 10);
            }

            return out;
        };

        const meterCards = {};
        if (cfg.meterCards && typeof cfg.meterCards === 'object') {
            Object.entries(cfg.meterCards).forEach(([key, prefs]) => {
                if (typeof key !== 'string' || !key) return;
                meterCards[key] = normalizeMeterCardPrefs(prefs);
            });
        }

        const swrCards = Array.isArray(cfg.swrCards)
            ? cfg.swrCards
                .filter(c => c && typeof c === 'object' && typeof c.id === 'string' && c.id.length > 0)
                .map(c => ({
                    id: c.id,
                    fwdKey: typeof c.fwdKey === 'string' ? c.fwdKey : null,
                    refKey: typeof c.refKey === 'string' ? c.refKey : null,
                    fwdMetric: typeof c.fwdMetric === 'string' ? c.fwdMetric : 'avg',
                    refMetric: typeof c.refMetric === 'string' ? c.refMetric : 'avg',
                    viewMode: c.viewMode === 'history' ? 'history' : 'gauges',
                    cardLayout: (typeof c.cardLayout === 'string' && c.cardLayout) ? c.cardLayout : 'both',
                    historyWindowMs: (Number.isFinite(c.historyWindowMs) && c.historyWindowMs > 0)
                        ? Number.parseInt(c.historyWindowMs, 10)
                        : 30000,
                }))
            : [];

        const meterCardOrder = asStringArray(cfg.meterCardOrder);
        let boardCardOrder = asStringArray(cfg.boardCardOrder);

        // Migration: synthesize mixed board order if missing.
        if (boardCardOrder.length === 0) {
            boardCardOrder = [
                ...meterCardOrder.map(key => `meter:${key}`),
                ...swrCards.map(c => `swr:${c.id}`),
            ];
        }

        // Keep board order complete for known cards.
        meterCardOrder.forEach(key => {
            const token = `meter:${key}`;
            if (!boardCardOrder.includes(token)) boardCardOrder.push(token);
        });
        swrCards.forEach(c => {
            const token = `swr:${c.id}`;
            if (!boardCardOrder.includes(token)) boardCardOrder.push(token);
        });

        return {
            ...defaultConfig,
            ...cfg,
            layoutVersion: Math.max(Number.parseInt(cfg.layoutVersion || defaultConfig.layoutVersion, 10) || 1, 1),
            meterCardOrder,
            boardCardOrder,
            meterCards,
            swrCards,
        };
    };

    DWMControl.prototype.loadConfig = function loadConfig() {
        const defaultConfig = {
            layoutVersion: 2,
            theme: 'dark',
            outputVisible: false,
            lastDevice: null,
            lastPort: null,
            lastBaud: 115200,
            globalSampleIntervalMs: 250,
            globalDebugLoggingEnabled: false,
            meterCardOrder: [],
            boardCardOrder: [],
            swrCards: [],
            meterCards: {},
            deembedPowerUnit: 'W',
            deembedVoltageMode: 'manual',
            deembedPowerRating: null,
        };

        try {
            const mainRaw = localStorage.getItem('dwm-control-config');
            const backupRaw = localStorage.getItem('dwm-control-config-backup');

            if (!mainRaw && !backupRaw) {
                return defaultConfig;
            }

            let parsed = null;
            if (mainRaw) {
                try { parsed = JSON.parse(mainRaw); } catch (_) { parsed = null; }
            }
            if (!parsed && backupRaw) {
                try { parsed = JSON.parse(backupRaw); } catch (_) { parsed = null; }
            }
            if (!parsed) {
                return defaultConfig;
            }

            const normalized = this._normalizeLoadedConfig(defaultConfig, parsed);

            // Self-heal primary/backup keys when one is missing or stale.
            const normalizedJson = JSON.stringify(normalized);
            if (mainRaw !== normalizedJson) localStorage.setItem('dwm-control-config', normalizedJson);
            if (backupRaw !== normalizedJson) localStorage.setItem('dwm-control-config-backup', normalizedJson);

            return normalized;
        } catch (error) {
            console.warn('Failed to load config, using defaults:', error);
            return defaultConfig;
        }
    };

    DWMControl.prototype.saveConfig = function saveConfig() {
        try {
            const payload = JSON.stringify(this.config);
            localStorage.setItem('dwm-control-config', payload);
            // Keep a mirrored backup key so preferences survive partial storage loss.
            localStorage.setItem('dwm-control-config-backup', payload);
        } catch (error) {
            console.warn('Failed to save config:', error);
        }
    };
})();
