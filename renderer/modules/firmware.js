// Firmware upload (DFU) methods — attached to DWMControl.prototype
// Extracted from renderer.js

(function attachFirmwareModule() {
    if (typeof DWMControl === 'undefined') {
        console.error('DWMControl not defined before firmware module loaded');
        return;
    }

    DWMControl.prototype.refreshDfuDevices = async function() {
        const deviceCombo = document.getElementById('device-combo');
        const installDriverBtn = document.getElementById('install-driver-btn');

        if (!deviceCombo) { return; }

        if (installDriverBtn) installDriverBtn.style.display = 'none';

        try {
            const result = await window.electronAPI.getDfuDevices();
            deviceCombo.innerHTML = '';

            if (!result || !result.success) {
                const errMsg = (result && result.error) ? result.error : 'Failed to enumerate DFU devices.';
                this.appendOutput(errMsg);
                const option = document.createElement('option');
                option.textContent = 'No DFU devices found';
                option.disabled = true;
                deviceCombo.appendChild(option);
                this.selectedDevice = null;

                if (result && result.windowsHelp && installDriverBtn) {
                    installDriverBtn.style.display = '';
                }
            } else {
                const devices = result.devices || [];
                if (devices.length === 0) {
                    const option = document.createElement('option');
                    option.textContent = 'No DFU devices found';
                    option.disabled = true;
                    deviceCombo.appendChild(option);
                    this.selectedDevice = null;
                } else {
                    devices.forEach((device, index) => {
                        const option = document.createElement('option');
                        option.value = JSON.stringify(device);
                        const sn = device.serial ? ` — SN: ${device.serial}` : '';
                        option.textContent = `DFU Device ${index + 1}${sn}`;
                        deviceCombo.appendChild(option);
                    });

                    this.selectedDevice = devices[0];
                }
            }
        } catch (error) {
            this.appendOutput(`Failed to enumerate DFU devices: ${error.message}`);
            deviceCombo.innerHTML = '<option disabled>Error enumerating devices</option>';
            this.selectedDevice = null;
        }

        this.updateUploadButton();
    };

    DWMControl.prototype.installUsbDriver = async function() {
        const btn = document.getElementById('install-driver-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Installing…'; }

        this.appendOutput('Installing WinUSB driver for DFU device…');
        this.appendOutput('A UAC prompt will appear — please click Yes to allow the installation.');

        try {
            const result = await window.electronAPI.installWinUsbDriver();

            // Always show pnputil output for diagnostics
            if (result && result.output) {
                result.output.split('\n').forEach(line => {
                    const trimmed = line.trim();
                    if (trimmed) this.appendOutput(trimmed);
                });
            }

            if (result && result.success) {
                this.appendOutput('Driver installed. Refreshing device list…');
                if (btn) { btn.disabled = false; btn.textContent = 'Install USB Driver'; }
                // Give Windows 3 s to finish binding the driver before rescanning
                setTimeout(() => this.refreshDfuDevices(), 3000);
            } else {
                const msg = (result && result.error) ? result.error : 'Driver installation failed.';
                if (!result || !result.output) {
                    // Only show the error text if we didn't already print pnputil output
                    this.appendOutput(`Error: ${msg}`);
                }
                this.appendOutput('If this keeps failing, install the driver manually using Zadig: https://zadig.akeo.ie');
                if (btn) { btn.disabled = false; btn.textContent = 'Install USB Driver'; }
            }
        } catch (error) {
            this.appendOutput(`Driver installation error: ${error.message}`);
            if (btn) { btn.disabled = false; btn.textContent = 'Install USB Driver'; }
        }
    };

    DWMControl.prototype.selectHexFile = async function() {
        try {
            const filePath = await window.electronAPI.selectHexFile();
            if (filePath) {
                await this.handleFileSelection(filePath);
            }
        } catch (error) {
            this.appendOutput(`File selection failed: ${error.message}`);
        }
    };

    DWMControl.prototype.downloadLatestFirmware = async function() {
        const downloadButton = document.getElementById('download-firmware-btn');
        if (downloadButton) {
            downloadButton.disabled = true;
            downloadButton.textContent = 'Downloading...';
        }

        try {
            const result = await window.electronAPI.downloadLatestFirmware();
            if (result && result.filePath) {
                await this.handleFileSelection(result.filePath);
                this.appendOutput(`Downloaded firmware: ${result.filePath}`);
            } else {
                this.appendOutput('Download completed but no file path was returned.');
            }
        } catch (error) {
            let userMessage = `Firmware download failed: ${error.message}`;

            if (error.message && error.message.includes('net::')) {
                userMessage = 'Network error — check your internet connection and try again.';
            } else if (error.message && error.message.toLowerCase().includes('not found')) {
                userMessage = 'No firmware release found. Check the GitHub releases page manually.';
            } else if (error.message && error.message.toLowerCase().includes('permission')) {
                userMessage = 'Permission denied writing to downloads folder.';
            }

            this.appendOutput(userMessage);
        } finally {
            if (downloadButton) {
                downloadButton.disabled = false;
                downloadButton.textContent = 'Download Latest';
            }
        }
    };

    DWMControl.prototype.handleFileSelection = async function(filePath) {
        if (!filePath) { return; }

        try {
            const stats = await window.electronAPI.getFileStats(filePath);
            const fileInfo = document.getElementById('file-info');
            const fileName = document.getElementById('file-name');
            const fileSize = document.getElementById('file-size');
            const uploadButton = document.getElementById('upload-btn');

            this.selectedHexFile = filePath;

            if (fileInfo) { fileInfo.style.display = 'block'; }
            if (fileName) { fileName.textContent = filePath.split('/').pop() || filePath; }
            if (fileSize) {
                const sizeKb = stats && stats.size ? (stats.size / 1024).toFixed(1) : '?';
                fileSize.textContent = `${sizeKb} KB`;
            }
            if (uploadButton) { uploadButton.disabled = false; }

            this.appendOutput(`Selected firmware: ${filePath}`);
        } catch (error) {
            this.appendOutput(`Could not read file info: ${error.message}`);
        }

        this.updateUploadButton();
    };

    DWMControl.prototype.uploadFirmware = async function() {
        if (!this.selectedHexFile) {
            this.appendOutput('No firmware file selected.');
            return;
        }

        if (!this.selectedDevice) {
            this.appendOutput('No DFU device selected.');
            return;
        }

        if (this.isUploading) {
            this.appendOutput('Upload already in progress.');
            return;
        }

        this.isUploading = true;
        this.updateUploadButton();

        const progressContainer = document.querySelector('.progress-container');
        if (progressContainer) { progressContainer.style.display = 'block'; }

        this.updateProgressBar(0, 'Starting DFU upload...');
        this.appendSerialMonitor('Starting DFU firmware upload...');

        try {
            const result = await window.electronAPI.uploadFirmware({
                hexFilePath: this.selectedHexFile,
                deviceInfo: this.selectedDevice,
            });

            if (result && result.output) {
                result.output.split('\n').forEach((line) => {
                    if (line.trim()) {
                        this.appendSerialMonitor(line);
                        const pct = this.parseProgressFromDfuOutput(line);
                        if (pct !== null) {
                            this.updateProgressBar(pct, line.trim());
                        }
                    }
                });
            }

            if (result && result.success) {
                this.updateProgressBar(100, 'Upload complete!');
                this.appendSerialMonitor('Firmware upload successful.');
            } else {
                this.updateProgressBar(0, 'Upload failed');
                this.appendSerialMonitor(`Upload failed: ${result && result.error ? result.error : 'Unknown error'}`);
            }
        } catch (error) {
            this.updateProgressBar(0, 'Upload error');
            this.appendSerialMonitor(`Upload error: ${error.message}`);
            this.appendOutput(`DFU upload error: ${error.message}`);
        } finally {
            this.isUploading = false;
            this.updateUploadButton();

            setTimeout(() => {
                if (progressContainer) { progressContainer.style.display = 'none'; }
            }, 4000);
        }
    };

    DWMControl.prototype.updateProgressBar = function(percentage, message) {
        const fill = document.querySelector('.progress-fill');
        const text = document.querySelector('.progress-text');
        const safePercent = Math.max(0, Math.min(100, percentage));

        if (fill) { fill.style.width = `${safePercent}%`; }
        if (text) { text.textContent = message || `${safePercent}%`; }
    };

    DWMControl.prototype.parseProgressFromDfuOutput = function(line) {
        if (!line) { return null; }

        if (/opening dfu/i.test(line)) { return 10; }
        if (/matching dfu/i.test(line)) { return 20; }
        if (/claiming usb/i.test(line)) { return 30; }
        if (/determining device/i.test(line)) { return 40; }
        if (/downloading.*element/i.test(line)) { return 50; }

        const downloadMatch = line.match(/Download\s+\[([= >]+)\]\s+(\d+)%/i);
        if (downloadMatch) {
            const pct = Number.parseInt(downloadMatch[2], 10);
            return 50 + Math.round(pct * 0.45);
        }

        if (/done!/.test(line)) { return 100; }
        if (/successfully/i.test(line)) { return 100; }
        if (/error/i.test(line)) { return null; }

        return null;
    };

    DWMControl.prototype.updateUploadButton = function() {
        const uploadButton = document.getElementById('upload-btn');
        if (!uploadButton) { return; }
        uploadButton.disabled = !this.selectedHexFile || !this.selectedDevice || this.isUploading;
    };

})();
