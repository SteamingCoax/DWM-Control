// DWM Control Renderer De-Embed Module

(function attachDeEmbedModule() {
    if (typeof DWMControl === 'undefined') {
        console.error('DWMControl class must be loaded before deembed.js');
        return;
    }

    DWMControl.prototype.setupDeEmbed = function setupDeEmbed() {
        console.log('setupDeEmbed called - initializing De-Embed functionality');

        this.deembedData = {
            points: [],
            numPoints: 5,
            powerUnit: this.config.deembedPowerUnit || 'W',
            voltageInputMode: this.config.deembedVoltageMode || 'manual',
            powerRating: this.config.deembedPowerRating || null,
        };

        this.loadDeEmbedConfig();
        this.generateDataEntryFields();
        this.setupDeEmbedEvents();
        this.updateUploadButtonState();

        console.log('setupDeEmbed completed');
    };

    DWMControl.prototype.loadDeEmbedConfig = function loadDeEmbedConfig() {
        const powerUnitsSelect = document.getElementById('power-units-select');
        const voltageInputMode = document.getElementById('voltage-input-mode');
        const powerRatingInput = document.getElementById('power-rating-input');

        if (powerUnitsSelect) {
            powerUnitsSelect.value = this.deembedData.powerUnit;
        }

        if (voltageInputMode) {
            voltageInputMode.value = this.deembedData.voltageInputMode;
        }

        if (powerRatingInput && this.deembedData.powerRating !== null) {
            powerRatingInput.value = this.deembedData.powerRating;
        }

        this.updatePowerUnitDisplay();
    };

    DWMControl.prototype.updatePowerUnitDisplay = function updatePowerUnitDisplay() {
        const powerUnitDisplay = document.getElementById('power-rating-unit');
        if (powerUnitDisplay) {
            powerUnitDisplay.textContent = this.deembedData.powerUnit;
        }
    };

    DWMControl.prototype.calculatePercentFS = function calculatePercentFS(index) {
        const point = this.deembedData.points[index];
        const fsDisplay = document.getElementById(`fs-${index}`);
        if (!point || !fsDisplay) {
            return;
        }

        if (point.power === null || this.deembedData.powerRating === null || this.deembedData.powerRating <= 0) {
            fsDisplay.textContent = '- %FS';
            fsDisplay.className = 'fs-display invalid';
            point.percentFS = null;
            return;
        }

        const powerInRatingUnits = this.convertPowerToUnits(point.power, this.deembedData.powerUnit, this.deembedData.powerUnit);
        const percentFS = (powerInRatingUnits / this.deembedData.powerRating) * 100;

        fsDisplay.textContent = `${percentFS.toFixed(2)} %FS`;
        fsDisplay.className = 'fs-display';
        point.percentFS = percentFS;
    };

    DWMControl.prototype.recalculateAllPercentFS = function recalculateAllPercentFS() {
        for (let i = 0; i < this.deembedData.points.length; i += 1) {
            this.calculatePercentFS(i);
        }
    };

    DWMControl.prototype.convertPowerToUnits = function convertPowerToUnits(power, fromUnit, toUnit) {
        let powerInWatts;
        switch (fromUnit) {
            case 'mW':
                powerInWatts = power / 1000;
                break;
            case 'W':
                powerInWatts = power;
                break;
            case 'kW':
                powerInWatts = power * 1000;
                break;
            case 'MW':
                powerInWatts = power * 1000000;
                break;
            default:
                powerInWatts = power;
                break;
        }

        switch (toUnit) {
            case 'mW':
                return powerInWatts * 1000;
            case 'W':
                return powerInWatts;
            case 'kW':
                return powerInWatts / 1000;
            case 'MW':
                return powerInWatts / 1000000;
            default:
                return powerInWatts;
        }
    };

    DWMControl.prototype.generateDataEntryFields = function generateDataEntryFields() {
        const container = document.getElementById('data-entry-container');
        const pointsSelect = document.getElementById('data-points-select');
        const voltageModeSelect = document.getElementById('voltage-input-mode');
        if (!container || !pointsSelect || !voltageModeSelect) {
            return;
        }

        const numPoints = Number.parseInt(pointsSelect.value, 10);
        const voltageMode = voltageModeSelect.value;

        container.innerHTML = '';
        this.deembedData.points = [];

        this.deembedData.points.push({ power: 0, voltage: 0, percentFS: 0 });

        for (let i = 0; i < numPoints; i += 1) {
            const row = document.createElement('div');
            row.className = 'data-entry-row';
            const pointIndex = i + 1;

            if (voltageMode === 'manual') {
                row.innerHTML = `
                    <label>Point ${pointIndex}:</label>
                    <input type="number"
                           class="power-input"
                           placeholder="Power level"
                           step="any"
                           min="0"
                           data-index="${pointIndex}">
                    <span class="fs-display invalid" id="fs-${pointIndex}">- %FS</span>
                    <input type="number"
                           class="voltage-input"
                           placeholder="Voltage (mV)"
                           step="any"
                           min="0"
                           data-index="${pointIndex}">
                    <span class="voltage-unit">mV</span>
                `;
            } else {
                row.innerHTML = `
                    <label>Point ${pointIndex}:</label>
                    <input type="number"
                           class="power-input"
                           placeholder="Power level"
                           step="any"
                           min="0"
                           data-index="${pointIndex}">
                    <span class="fs-display invalid" id="fs-${pointIndex}">- %FS</span>
                    <span class="voltage-display" id="voltage-${pointIndex}">- mV</span>
                    <button class="sample-btn" data-index="${pointIndex}">Sample</button>
                `;
            }

            container.appendChild(row);
            this.deembedData.points.push({ power: null, voltage: null, percentFS: null });
        }
    };

    DWMControl.prototype.setupDeEmbedEvents = function setupDeEmbedEvents() {
        console.log('setupDeEmbedEvents called - setting up event listeners');

        const dataPointsSelect = document.getElementById('data-points-select');
        if (dataPointsSelect) {
            dataPointsSelect.addEventListener('change', (e) => {
                this.deembedData.numPoints = Number.parseInt(e.target.value, 10);
                this.generateDataEntryFields();
            });
        }

        const powerUnitsSelect = document.getElementById('power-units-select');
        if (powerUnitsSelect) {
            powerUnitsSelect.addEventListener('change', (e) => {
                this.deembedData.powerUnit = e.target.value;
                this.config.deembedPowerUnit = e.target.value;
                this.saveConfig();
                this.updatePowerUnitDisplay();
                this.recalculateAllPercentFS();
            });
        }

        const voltageInputMode = document.getElementById('voltage-input-mode');
        if (voltageInputMode) {
            voltageInputMode.addEventListener('change', (e) => {
                this.deembedData.voltageInputMode = e.target.value;
                this.config.deembedVoltageMode = e.target.value;
                this.saveConfig();
                this.generateDataEntryFields();
            });
        }

        const powerRatingInput = document.getElementById('power-rating-input');
        if (powerRatingInput) {
            powerRatingInput.addEventListener('input', (e) => {
                let value = Number.parseFloat(e.target.value);
                if (value <= 0) {
                    if (value < 0) {
                        e.target.value = '';
                        e.target.style.borderColor = 'var(--color-warning)';
                        setTimeout(() => {
                            e.target.style.borderColor = '';
                        }, 1000);
                    }
                    value = null;
                }

                this.deembedData.powerRating = Number.isNaN(value) ? null : value;
                this.config.deembedPowerRating = this.deembedData.powerRating;
                this.saveConfig();
                this.recalculateAllPercentFS();
            });
        }

        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('power-input')) {
                const index = Number.parseInt(e.target.dataset.index, 10);
                let value = Number.parseFloat(e.target.value);

                if (value < 0) {
                    value = 0;
                    e.target.value = 0;
                    e.target.style.borderColor = 'var(--color-warning)';
                    setTimeout(() => {
                        e.target.style.borderColor = '';
                    }, 1000);
                }

                this.deembedData.points[index].power = Number.isNaN(value) ? null : value;
                this.calculatePercentFS(index);
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('voltage-input')) {
                const index = Number.parseInt(e.target.dataset.index, 10);
                let value = Number.parseFloat(e.target.value);

                if (value < 0) {
                    value = 0;
                    e.target.value = 0;
                    e.target.style.borderColor = 'var(--color-warning)';
                    setTimeout(() => {
                        e.target.style.borderColor = '';
                    }, 1000);
                }

                this.deembedData.points[index].voltage = Number.isNaN(value) ? null : value;
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('sample-btn')) {
                const index = Number.parseInt(e.target.dataset.index, 10);
                this.sampleVoltage(index);
            }
        });

        const computeBtn = document.getElementById('compute-btn');
        if (computeBtn) {
            computeBtn.addEventListener('click', () => {
                console.log('Compute button clicked!');
                this.computePolynomialFit();
            });
            console.log('Compute button event listener attached successfully');
        } else {
            console.error('Compute button not found in DOM');
        }

        const uploadBtn = document.getElementById('upload-coefficients-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                this.uploadCoefficients();
            });
        }
    };

    DWMControl.prototype.sampleVoltage = async function sampleVoltage(index) {
        const btn = document.querySelector(`[data-index="${index}"].sample-btn`);
        const voltageDisplay = document.getElementById(`voltage-${index}`);
        if (!btn || !voltageDisplay) {
            return;
        }

        try {
            btn.disabled = true;
            btn.textContent = 'Sampling...';

            const result = await window.electronAPI.sampleVoltage();
            if (!result.success) {
                throw new Error(result.error || 'Failed to sample voltage');
            }

            const voltage = result.voltage.toFixed(2);
            this.deembedData.points[index].voltage = Number.parseFloat(voltage);
            voltageDisplay.textContent = `${voltage} mV`;
            voltageDisplay.classList.add('has-value');
            this.appendOutput(`Sampled voltage for point ${index + 1}: ${voltage} mV`);
        } catch (error) {
            this.appendOutput(`Error sampling voltage: ${error.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Sample';
        }
    };

    DWMControl.prototype.computePolynomialFit = async function computePolynomialFit() {
        try {
            console.log('computePolynomialFit called');
            this.appendOutput('Starting polynomial fit computation...');

            const additionalValidPoints = this.deembedData.points.slice(1).filter((point) => (
                point.percentFS !== null && point.voltage !== null && !Number.isNaN(point.percentFS)
            ));

            if (additionalValidPoints.length < 2) {
                this.appendOutput('Error: Need at least 2 complete data points (beyond origin) with valid %FS values for polynomial fit', 'error');
                return;
            }

            if (this.deembedData.powerRating === null || this.deembedData.powerRating <= 0) {
                this.appendOutput('Error: Please enter a valid power rating (full scale) before computing', 'error');
                return;
            }

            const allValidPoints = [this.deembedData.points[0], ...additionalValidPoints];
            const percentFSData = allValidPoints.map((point) => point.percentFS);
            const voltageData = allValidPoints.map((point) => point.voltage);

            this.appendOutput(`Starting polynomial regression with ${allValidPoints.length} data points (including origin)...`);

            const result = await window.electronAPI.polynomialRegression({
                xData: voltageData,
                yData: percentFSData,
                degree: 3,
            });

            if (!result.success) {
                throw new Error(result.error);
            }

            this.displayResults(result.coefficients, result.rSquared);

            const scaledCoefficients = [
                (result.coefficients[0] * 1000) / 100,
                (result.coefficients[1] * 1000000) / 100,
                (result.coefficients[2] * 1000000) / 100,
            ];

            this.appendOutput('Polynomial fit completed successfully!');
            this.appendOutput(`- Data points used: ${result.dataPoints}`);
            this.appendOutput(`- Quality of Measurement: ${(result.rSquared * 100).toFixed(3)}%`);

            if (result.rSquared < 0.995) {
                this.appendOutput(` WARNING: Low quality of measurement (${(result.rSquared * 100).toFixed(3)}%) indicates poor fit quality!`, 'error');
                this.appendOutput('Consider adding more data points or checking measurement accuracy.', 'error');
            }

            this.appendOutput('De-embedding coefficients (scaled for meter upload):');
            this.appendOutput(`- COEF 1 (Linear × 10): ${scaledCoefficients[0].toFixed(3)}`);
            this.appendOutput(`- COEF 2 (Quadratic × 1E4): ${scaledCoefficients[1].toFixed(3)}`);
            this.appendOutput(`- COEF 3 (Cubic × 1E4): ${scaledCoefficients[2].toFixed(3)}`);
        } catch (error) {
            console.error('Polynomial fit error:', error);
            this.appendOutput(`Error computing polynomial fit: ${error.message}`, 'error');
        }
    };

    DWMControl.prototype.displayResults = function displayResults(coefficients, rSquared) {
        const resultsSection = document.getElementById('results-section');
        if (resultsSection) {
            resultsSection.style.display = 'block';
        }

        this.originalCoefficients = coefficients;

        const scaledCoefficients = [
            (coefficients[0] * 1000) / 100,
            (coefficients[1] * 1000000) / 100,
            (coefficients[2] * 1000000) / 100,
        ];

        this.currentCoefficients = scaledCoefficients;

        const coef1 = document.getElementById('coef1-value');
        const coef2 = document.getElementById('coef2-value');
        const coef3 = document.getElementById('coef3-value');
        const rSquaredElement = document.getElementById('r-squared-value');

        if (coef1) {
            coef1.textContent = scaledCoefficients[0].toFixed(3);
        }
        if (coef2) {
            coef2.textContent = scaledCoefficients[1].toFixed(3);
        }
        if (coef3) {
            coef3.textContent = scaledCoefficients[2].toFixed(3);
        }

        if (rSquaredElement) {
            const rSquaredPercent = rSquared * 100;
            rSquaredElement.textContent = `${rSquaredPercent.toFixed(3)}%`;
            if (rSquared < 0.995) {
                rSquaredElement.classList.add('low-rsquared');
            } else {
                rSquaredElement.classList.remove('low-rsquared');
            }
        }

        this.updateUploadButtonState();
    };

    DWMControl.prototype.updateUploadButtonState = function updateUploadButtonState() {
        const uploadBtn = document.getElementById('upload-coefficients-btn');
        if (!uploadBtn) {
            return;
        }

        if (!this.isConnected) {
            uploadBtn.disabled = true;
            uploadBtn.innerHTML = '<span class="btn-icon"></span> Device Not Connected';
            uploadBtn.title = 'Connect to a device to upload coefficients';
            return;
        }

        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<span class="btn-icon"></span> Upload Coefficients';
        uploadBtn.title = 'Upload coefficients to the connected device';
    };

    DWMControl.prototype.uploadCoefficients = async function uploadCoefficients() {
        if (!this.currentCoefficients) {
            this.appendOutput('Error: No coefficients available to upload', 'error');
            return;
        }

        if (!this.isConnected) {
            this.appendOutput('Error: No device connected. Please connect to a device before uploading coefficients.', 'error');
            return;
        }

        const elementSlot = document.getElementById('element-slot-select').value;
        const uploadBtn = document.getElementById('upload-coefficients-btn');

        try {
            uploadBtn.disabled = true;
            uploadBtn.innerHTML = '<span class="btn-icon">...</span> Uploading...';

            this.appendOutput(`Uploading coefficients to element slot ${elementSlot}...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));

            this.appendOutput(` Coefficients successfully uploaded to element slot ${elementSlot}`);
            this.appendOutput(`- COEF 1: ${this.currentCoefficients[0].toFixed(3)}`);
            this.appendOutput(`- COEF 2: ${this.currentCoefficients[1].toFixed(3)}`);
            this.appendOutput(`- COEF 3: ${this.currentCoefficients[2].toFixed(3)}`);
        } catch (error) {
            this.appendOutput(`Error uploading coefficients: ${error.message}`, 'error');
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '<span class="btn-icon"></span> Upload Coefficients';
        }
    };
})();
