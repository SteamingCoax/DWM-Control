const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const { SerialPort } = require('serialport');
const ss = require('simple-statistics');

// Disable GPU acceleration IMMEDIATELY if safe-mode flag is present
// This must be done before app.whenReady()
if (process.argv.includes('--safe-mode') || process.argv.includes('--disable-gpu')) {
  console.log('GPU acceleration disabled via command line flag');
  app.disableHardwareAcceleration();
  // Also set additional Chromium flags for complete GPU disable
  app.commandLine.appendSwitch('--disable-gpu');
  app.commandLine.appendSwitch('--disable-gpu-compositing');
  app.commandLine.appendSwitch('--disable-gpu-rasterization');
  app.commandLine.appendSwitch('--disable-gpu-sandbox');
  app.commandLine.appendSwitch('--disable-software-rasterizer');
}

// Add additional GPU-related safeguards for Windows builds
if (process.platform === 'win32') {
  // Disable problematic GPU features that might cause missing DLL issues
  app.commandLine.appendSwitch('--disable-gpu-sandbox');
  app.commandLine.appendSwitch('--disable-software-rasterizer');
  app.commandLine.appendSwitch('--ignore-gpu-blacklist');
  app.commandLine.appendSwitch('--disable-gpu-compositing');
}

// Keep a global reference of the window object
let mainWindow;

// Configure auto-updater (only check in production)
if (app.isPackaged && process.env.NODE_ENV !== 'development') {
  autoUpdater.checkForUpdatesAndNotify();
}

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available.');
  // Send to renderer process
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available.');
  if (mainWindow) {
    mainWindow.webContents.send('update-not-available');
  }
});

autoUpdater.on('error', (err) => {
  console.log('Error in auto-updater. ' + err);
  if (mainWindow) {
    // Handle the case where no update metadata is available (normal when up-to-date)
    if (err.message.includes('latest-mac.yml') || err.message.includes('latest.yml')) {
      // Don't send an error for this case - it means no updates are available
      mainWindow.webContents.send('update-not-available');
      return;
    }
    
    // Handle actual errors
    let userMessage = 'Update check failed';
    
    if (err.message.includes('404') || err.message.includes('HttpError')) {
      userMessage = 'Update server not available';
    } else if (err.message.includes('network') || err.message.includes('ENOTFOUND')) {
      userMessage = 'Network error - check internet connection';
    } else if (err.message.includes('rate limit')) {
      userMessage = 'Too many requests - try again later';
    }
    
    mainWindow.webContents.send('update-error', userMessage);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  console.log(log_message);
  
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded');
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded');
  }
});

function createWindow() {
  // Create the browser window with modern styling
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      // Additional security and compatibility settings
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'default',
    show: false // Don't show until ready
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Bring to front on macOS
    if (process.platform === 'darwin') {
      mainWindow.moveTop();
    }
    
    // Check for updates after a short delay (skip in development)
    setTimeout(() => {
      if (process.env.NODE_ENV !== 'development' && app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
      }
    }, 3000);
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development and for debugging packaged app
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
  
  // Handle any renderer process crashes gracefully
  mainWindow.webContents.on('crashed', (event, killed) => {
    console.error('Renderer process crashed:', { killed });
    // Optionally restart the window or show an error dialog
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Application Error',
      message: 'The application has crashed. Please restart the application.',
      buttons: ['OK']
    });
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  try {
    createWindow();
  } catch (error) {
    console.error('Failed to create window:', error);
    // Try to create a minimal window as fallback
    try {
      app.disableHardwareAcceleration();
      createWindow();
    } catch (fallbackError) {
      console.error('Fallback window creation also failed:', fallbackError);
      app.quit();
    }
  }
  
  app.on('activate', () => {
    // On macOS, re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Handle app-level errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until explicitly quit
  if (process.platform !== 'darwin') app.quit();
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});

// IPC Handlers for DFU functionality
ipcMain.handle('get-dfu-devices', async () => {
  return new Promise((resolve, reject) => {
    const dfuUtilPath = getDfuUtilPath();
    
    console.log('DFU Debug - Platform:', process.platform);
    console.log('DFU Debug - Path:', dfuUtilPath);
    console.log('DFU Debug - __dirname:', __dirname);
    console.log('DFU Debug - NODE_ENV:', process.env.NODE_ENV);
    
    // Check if dfu-util exists (skip check for system commands on macOS/Linux)
    const isSystemCommand = process.platform !== 'win32' && dfuUtilPath === 'dfu-util';
    console.log('DFU Debug - Is system command:', isSystemCommand);
    
    if (!isSystemCommand) {
      const fileExists = fs.existsSync(dfuUtilPath);
      console.log('DFU Debug - File exists:', fileExists);
      console.log('DFU Debug - Full path check:', dfuUtilPath);
      
      if (!fileExists) {
        const errorMsg = process.platform === 'win32' 
          ? `dfu-util.exe not found at: ${dfuUtilPath}. Please ensure Programs/dfu-util/dfu-util.exe exists.`
          : 'dfu-util not found. Please install dfu-util or ensure it\'s in your PATH.';
        
        resolve({ 
          success: false, 
          error: errorMsg, 
          output: '',
          needsSetup: true 
        });
        return;
      }
    }
    
    const child = spawn(dfuUtilPath, ['-l']);
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      console.log('DFU Debug - dfu-util exit code:', code);
      console.log('DFU Debug - stdout length:', stdout.length);
      console.log('DFU Debug - stderr length:', stderr.length);
      console.log('DFU Debug - stdout content:', stdout);
      console.log('DFU Debug - stderr content:', stderr);
      
      if (code === 0 || stdout.length > 0) {
        const devices = parseDfuDevices(stdout);
        console.log('DFU Debug - parsed devices:', devices.length);
        
        if (devices.length === 0 && process.platform === 'win32') {
          // Provide Windows-specific guidance when no devices found
          resolve({ 
            success: false, 
            error: 'No DFU devices found', 
            output: stdout,
            windowsHelp: true
          });
        } else {
          resolve({ success: true, devices, output: stdout });
        }
      } else {
        const errorMsg = process.platform === 'win32'
          ? 'DFU scan failed. This may indicate driver issues or permissions problems.'
          : 'DFU scan failed';
          
        resolve({ 
          success: false, 
          error: stderr || errorMsg, 
          output: stderr,
          windowsHelp: process.platform === 'win32'
        });
      }
    });
    
    child.on('error', (error) => {
      const errorMsg = process.platform === 'win32'
        ? `Failed to run dfu-util: ${error.message}. Try running as Administrator.`
        : `Failed to run dfu-util: ${error.message}`;
        
      resolve({ 
        success: false, 
        error: errorMsg, 
        output: '',
        windowsHelp: process.platform === 'win32'
      });
    });
  });
});

ipcMain.handle('upload-firmware', async (event, { hexFilePath, deviceInfo }) => {
  return new Promise((resolve, reject) => {
    // Convert hex to bin first
    convertHexToBin(hexFilePath)
      .then(binFilePath => {
        const dfuUtilPath = getDfuUtilPath();
        const args = [
          '-a', '0',
          '-i', '0',
          '-D', binFilePath,
          '-s', '0x08000000:leave',
          '-R'
        ];
        
        const child = spawn(dfuUtilPath, args);
        let output = '';
        
        child.stdout.on('data', (data) => {
          const line = data.toString();
          output += line;
          event.sender.send('upload-progress', line);
        });
        
        child.stderr.on('data', (data) => {
          const line = data.toString();
          output += line;
          event.sender.send('upload-progress', line);
        });
        
        child.on('close', (code) => {
          // Clean up temporary bin file
          if (fs.existsSync(binFilePath)) {
            fs.unlinkSync(binFilePath);
          }
          
          if (code === 0 || code === 74) { // 74 is success code for DFU
            resolve({ success: true, output });
          } else {
            resolve({ success: false, error: `Upload failed with code ${code}`, output });
          }
        });
        
        child.on('error', (error) => {
          resolve({ success: false, error: error.message, output });
        });
      })
      .catch(error => {
        resolve({ success: false, error: error.message, output: '' });
      });
  });
});

// IPC Handlers for Serial Port functionality
ipcMain.handle('get-serial-ports', async () => {
  try {
    const ports = await SerialPort.list();
    return { success: true, ports };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// File selection dialog
ipcMain.handle('select-hex-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Firmware (.hex) File',
    filters: [
      { name: 'Intel Hex Files', extensions: ['hex'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, filePath: result.filePaths[0] };
  }
  
  return { success: false };
});

// Get file statistics
ipcMain.handle('get-file-stats', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return { 
      size: stats.size,
      mtime: stats.mtime,
      ctime: stats.ctime
    };
  } catch (error) {
    throw new Error(`Failed to get file stats: ${error.message}`);
  }
});

// Download latest firmware from GitHub
ipcMain.handle('download-latest-firmware', async () => {
  try {
    console.log('Starting GitHub firmware download...');
    
    // First test network connectivity
    console.log('Testing network connectivity...');
    
    // Fetch latest release info from GitHub API
    const releaseInfo = await fetchLatestRelease();
    console.log('Release info received:', releaseInfo ? releaseInfo.tag_name : 'null');
    
    if (!releaseInfo) {
      throw new Error('No releases found');
    }
    
    // Find .hex file in release assets
    const hexAsset = releaseInfo.assets.find(asset => 
      asset.name.toLowerCase().endsWith('.hex')
    );
    
    console.log('Found assets:', releaseInfo.assets.map(a => a.name));
    console.log('Selected hex asset:', hexAsset ? hexAsset.name : 'none');
    
    if (!hexAsset) {
      throw new Error('No .hex file found in latest release');
    }
    
    // Create downloads directory in a more accessible location
    const os = require('os');
    const downloadsDir = path.join(os.homedir(), 'Downloads', 'DWM-Control-Firmware');
    console.log('Downloads directory:', downloadsDir);
    
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
      console.log('Created downloads directory');
    }
    
    // Download the firmware file
    const fileName = hexAsset.name;
    const filePath = path.join(downloadsDir, fileName);
    
    console.log('Downloading to:', filePath);
    await downloadFile(hexAsset.browser_download_url, filePath);
    console.log('Download completed successfully');
    
    return {
      success: true,
      filePath: filePath,
      fileName: fileName,
      version: releaseInfo.tag_name,
      size: hexAsset.size,
      releaseDate: releaseInfo.published_at
    };
    
  } catch (error) {
    console.error('GitHub download error:', error);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to download firmware: ${error.message}`);
  }
});

// De-embed voltage sampling
ipcMain.handle('sample-voltage', async () => {
  try {
    // In a real implementation, this would communicate with the actual power meter
    // For now, we'll simulate a realistic voltage reading
    
    // Simulate some delay for actual hardware communication
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    // Generate a realistic voltage reading (0.1 to 2000 mV range)
    // In practice, this would be replaced with actual meter communication
    const voltage = Math.random() * 1900 + 100; // 100-2000 mV range
    
    return {
      success: true,
      voltage: voltage,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Voltage sampling error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// De-embed polynomial regression

// De-embed polynomial regression
ipcMain.handle('polynomial-regression', async (event, { xData, yData, degree = 3 }) => {
  try {
    console.log('Polynomial regression called with data:', { xData, yData, degree });
    
    // Validate input data
    if (!Array.isArray(xData) || !Array.isArray(yData)) {
      throw new Error('Input data must be arrays');
    }
    
    if (xData.length !== yData.length) {
      throw new Error('X and Y data arrays must have the same length');
    }
    
    if (xData.length < degree + 1) {
      throw new Error(`Need at least ${degree + 1} data points for degree ${degree} polynomial`);
    }

    // For polynomial regression, use the existing helper functions
    const coefficients = calculateZeroOffsetPolynomial(xData, yData, degree);
    
    // Calculate R-squared
    const meanY = yData.reduce((sum, y) => sum + y, 0) / yData.length;
    const predictedY = xData.map(x => {
      let result = 0;
      for (let j = 0; j < coefficients.length; j++) {
        result += coefficients[j] * Math.pow(x, j + 1);
      }
      return result;
    });
    
    const ssRes = yData.reduce((sum, y, i) => sum + Math.pow(y - predictedY[i], 2), 0);
    const ssTot = yData.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);
    
    // Create equation string
    let equation = 'y = ';
    for (let i = coefficients.length - 1; i >= 0; i--) {
      const coeff = coefficients[i];
      const power = i + 1;
      
      if (i === coefficients.length - 1) {
        equation += `${coeff.toFixed(6)}`;
      } else {
        equation += coeff >= 0 ? ` + ${coeff.toFixed(6)}` : ` - ${Math.abs(coeff).toFixed(6)}`;
      }
      
      if (power > 1) {
        equation += `x^${power}`;
      } else {
        equation += 'x';
      }
    }
    
    console.log('Polynomial regression result:', { coefficients, rSquared, equation });
    
    return {
      success: true,
      coefficients: coefficients,
      rSquared: rSquared,
      equation: equation,
      dataPoints: xData.length
    };
    
  } catch (error) {
    console.error('Polynomial regression error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});


// Helper function for zero-offset polynomial calculation
function calculateZeroOffsetPolynomial(x, y, degree) {
  const n = x.length;
  
  // Create design matrix (without constant term for zero offset)
  const A = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 1; j <= degree; j++) {
      row.push(Math.pow(x[i], j));
    }
    A.push(row);
  }
  
  // Calculate A^T * A
  const AT = transpose(A);
  const ATA = multiply(AT, A);
  const ATy = multiplyVector(AT, y);
  
  // Solve using Gaussian elimination
  return gaussianElimination(ATA, ATy);
}

function transpose(matrix) {
  return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
}

function multiply(a, b) {
  const result = [];
  for (let i = 0; i < a.length; i++) {
    result[i] = [];
    for (let j = 0; j < b[0].length; j++) {
      result[i][j] = 0;
      for (let k = 0; k < a[0].length; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

function multiplyVector(matrix, vector) {
  return matrix.map(row => 
    row.reduce((sum, val, i) => sum + val * vector[i], 0)
  );
}

function gaussianElimination(A, b) {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);
  
  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    
    // Swap rows
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
    
    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      const c = augmented[k][i] / augmented[i][i];
      for (let j = i; j <= n; j++) {
        augmented[k][j] -= c * augmented[i][j];
      }
    }
  }
  
  // Back substitution
  const solution = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    solution[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      solution[i] -= augmented[i][j] * solution[j];
    }
    solution[i] /= augmented[i][i];
  }
  
  return solution;
}

// Helper function to fetch latest release from GitHub
function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    console.log('Fetching latest release from GitHub API...');
    
    const options = {
      hostname: 'api.github.com',
      path: '/repos/SteamingCoax/DWM-V2_Firmware/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'DWM-Control-App',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    
    console.log('Request options:', options);
    
    const req = https.request(options, (res) => {
      let data = '';
      
      console.log('Response status:', res.statusCode);
      console.log('Response headers:', res.headers);
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const releaseInfo = JSON.parse(data);
            console.log('Successfully parsed release info');
            resolve(releaseInfo);
          } else {
            console.log('GitHub API error response:', data);
            reject(new Error(`GitHub API returned status ${res.statusCode}`));
          }
        } catch (error) {
          console.error('JSON parse error:', error);
          reject(new Error(`Failed to parse GitHub API response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(new Error(`GitHub API request failed: ${error.message}`));
    });
    
    req.setTimeout(30000, () => {
      console.log('Request timed out');
      req.abort();
      reject(new Error('GitHub API request timed out'));
    });
    
    req.end();
  });
}

// Helper function to download a file
function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    console.log('Starting download from:', url);
    console.log('Saving to:', filePath);
    
    const file = fs.createWriteStream(filePath);
    
    const request = https.get(url, (response) => {
      console.log('Download response status:', response.statusCode);
      console.log('Download response headers:', response.headers);
      
      if (response.statusCode === 200) {
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log('File download completed successfully');
          resolve();
        });
        
        file.on('error', (error) => {
          console.error('File write error:', error);
          fs.unlink(filePath, () => {}); // Clean up failed download
          reject(error);
        });
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlink(filePath, () => {}); // Clean up
        console.log('Following redirect to:', response.headers.location);
        // Handle redirect
        downloadFile(response.headers.location, filePath)
          .then(resolve)
          .catch(reject);
      } else {
        file.close();
        fs.unlink(filePath, () => {}); // Clean up
        reject(new Error(`Download failed with status ${response.statusCode}`));
      }
    });
    
    request.on('error', (error) => {
      console.error('Download request error:', error);
      file.close();
      fs.unlink(filePath, () => {}); // Clean up
      reject(error);
    });
    
    request.setTimeout(60000, () => {
      console.log('Download request timed out');
      request.abort();
      file.close();
      fs.unlink(filePath, () => {}); // Clean up
      reject(new Error('Download timed out'));
    });
  });
}

// Helper functions
function getDfuUtilPath() {
  // Use the same reliable development detection as the auto-updater
  const isExplicitDev = process.env.NODE_ENV === 'development';
  const isRunningFromSource = !app.isPackaged;
  const isDev = isExplicitDev && isRunningFromSource;
  
  const basePath = isDev ? __dirname : process.resourcesPath;
  
  console.log('getDfuUtilPath - isExplicitDev:', isExplicitDev);
  console.log('getDfuUtilPath - isRunningFromSource:', isRunningFromSource);
  console.log('getDfuUtilPath - isDev:', isDev);
  console.log('getDfuUtilPath - basePath:', basePath);
  console.log('getDfuUtilPath - __dirname:', __dirname);
  console.log('getDfuUtilPath - process.resourcesPath:', process.resourcesPath);
  console.log('getDfuUtilPath - app.isPackaged:', app.isPackaged);
  
  if (process.platform === 'win32') {
    const fullPath = path.join(basePath, 'Programs', 'dfu-util', 'dfu-util.exe');
    console.log('getDfuUtilPath - Windows full path:', fullPath);
    return fullPath;
  } else if (process.platform === 'darwin') {
    // On macOS, try bundled version first when packaged, then system
    if (!isDev) {
      const bundledPath = path.join(basePath, 'Programs', 'dfu-util', 'dfu-util');
      console.log('getDfuUtilPath - macOS bundled path:', bundledPath);
      if (fs.existsSync(bundledPath)) {
        // Make sure the bundled dfu-util is executable
        try {
          fs.chmodSync(bundledPath, 0o755);
          console.log('getDfuUtilPath - Using bundled dfu-util for installed app');
          return bundledPath;
        } catch (error) {
          console.log('Failed to set executable permissions on bundled dfu-util:', error);
        }
      } else {
        console.log('getDfuUtilPath - Bundled dfu-util not found, falling back to system');
      }
    } else {
      console.log('getDfuUtilPath - Development mode, using system dfu-util');
    }
    // Fallback to system dfu-util
    console.log('getDfuUtilPath - Using system dfu-util');
    return 'dfu-util';
  } else {
    // For Linux, try the bundled version first, fallback to system
    const bundledPath = path.join(basePath, 'Programs', 'dfu-util', 'dfu-util');
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }
    return 'dfu-util';
  }
}

function parseDfuDevices(output) {
  const devices = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (line.includes('Found DFU')) {
      // More flexible regex to match different dfu-util output formats
      const match = line.match(/Found DFU: \[([0-9a-f]{4}):([0-9a-f]{4})\]/i);
      if (match) {
        const vid = match[1];
        const pid = match[2];
        
        // Extract serial number - try multiple patterns
        let serial = 'unknown';
        const serialMatch = line.match(/serial="([^"]+)"/);
        if (serialMatch) {
          serial = serialMatch[1];
        } else {
          // Alternative pattern if serial is at the end without quotes
          const altSerialMatch = line.match(/serial=([^\s,]+)/);
          if (altSerialMatch) {
            serial = altSerialMatch[1];
          }
        }
        
        // Extract alt interface number for better identification
        let altInterface = 0;
        const altMatch = line.match(/alt=(\d+)/);
        if (altMatch) {
          altInterface = parseInt(altMatch[1]);
        }
        
        // Extract interface name if available
        let interfaceName = '';
        const nameMatch = line.match(/name="([^"]+)"/);
        if (nameMatch) {
          interfaceName = nameMatch[1];
        }
        
        devices.push({
          vid: vid,
          pid: pid,
          serial: serial,
          alt: altInterface,
          name: interfaceName,
          description: line.trim()
        });
      }
    }
  }
  
  // Group by device (same VID:PID:Serial) and keep only the main flash interface (usually alt=0)
  const deviceMap = {};
  for (const device of devices) {
    const key = `${device.vid}:${device.pid}:${device.serial}`;
    
    // Prefer the main flash interface (alt=0) or "Internal Flash" interface
    if (!deviceMap[key] || 
        device.alt === 0 || 
        device.name.toLowerCase().includes('internal flash')) {
      deviceMap[key] = device;
    }
  }
  
  return Object.values(deviceMap);
}

function convertHexToBin(hexFilePath) {
  return new Promise((resolve, reject) => {
    try {
      const hexData = fs.readFileSync(hexFilePath, 'utf8');
      console.log(`Converting hex file: ${hexFilePath}`);
      
      // Create temporary bin file
      const tempDir = require('os').tmpdir();
      const binFilePath = path.join(tempDir, `firmware_temp_${Date.now()}.bin`);
      
      // Parse the hex file manually to avoid memory issues
      const lines = hexData.split('\n').filter(line => line.trim().startsWith(':'));
      console.log(`Processing ${lines.length} hex lines`);
      
      // Find the address range
      let minAddr = 0x08000000; // STM32 flash start
      let maxAddr = 0x08000000;
      let baseAddr = 0;
      
      // First pass: find the actual address range
      for (const line of lines) {
        if (line.length < 11) continue;
        
        const recType = parseInt(line.substr(7, 2), 16);
        if (recType === 0x04) { // Extended Linear Address
          baseAddr = parseInt(line.substr(9, 4), 16) << 16;
        } else if (recType === 0x00) { // Data record
          const addr = baseAddr + parseInt(line.substr(3, 4), 16);
          const dataLen = parseInt(line.substr(1, 2), 16);
          minAddr = Math.min(minAddr, addr);
          maxAddr = Math.max(maxAddr, addr + dataLen - 1);
        }
      }
      
      console.log(`Address range: 0x${minAddr.toString(16)} - 0x${maxAddr.toString(16)}`);
      
      const size = maxAddr - minAddr + 1;
      if (size > 1024 * 1024) { // 1MB limit
        throw new Error(`Firmware too large: ${size} bytes`);
      }
      
      // Create buffer for the exact size needed
      const buffer = Buffer.alloc(size, 0xFF);
      baseAddr = 0;
      
      // Second pass: fill the buffer with data
      for (const line of lines) {
        if (line.length < 11) continue;
        
        const recType = parseInt(line.substr(7, 2), 16);
        if (recType === 0x04) { // Extended Linear Address
          baseAddr = parseInt(line.substr(9, 4), 16) << 16;
        } else if (recType === 0x00) { // Data record
          const addr = baseAddr + parseInt(line.substr(3, 4), 16);
          const dataLen = parseInt(line.substr(1, 2), 16);
          
          for (let i = 0; i < dataLen; i++) {
            const byteVal = parseInt(line.substr(9 + i * 2, 2), 16);
            const bufferIndex = addr + i - minAddr;
            if (bufferIndex >= 0 && bufferIndex < buffer.length) {
              buffer[bufferIndex] = byteVal;
            }
          }
        }
      }
      
      console.log(`Converted to binary: ${buffer.length} bytes`);
      
      // Write binary data to file
      fs.writeFileSync(binFilePath, buffer);
      resolve(binFilePath);
    } catch (error) {
      console.error('Hex to bin conversion error:', error);
      reject(error);
    }
  });
}

// IPC handlers for manual update checking
ipcMain.handle('check-for-updates', async () => {
  try {
    // Simple and reliable development mode detection
    // Only consider it development if explicitly set or if running from source
    const isExplicitDev = process.env.NODE_ENV === 'development';
    const isRunningFromSource = !app.isPackaged;
    
    console.log('Update check debug info:', {
      NODE_ENV: process.env.NODE_ENV,
      isPackaged: app.isPackaged,
      isExplicitDev: isExplicitDev,
      isRunningFromSource: isRunningFromSource,
      execPath: process.execPath
    });
    
    // Only skip update checks if explicitly in development AND running from source
    if (isExplicitDev && isRunningFromSource) {
      console.log('Development mode: Simulating update check');
      return { 
        success: true, 
        updateInfo: null,
        message: 'Development mode: Update checking is disabled'
      };
    }
    
    console.log('Production mode: Checking for real updates');
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result };
  } catch (error) {
    console.error('Update check error:', error);
    
    // Handle the case where no update metadata is available (normal when up-to-date)
    if (error.message.includes('latest-mac.yml') || error.message.includes('latest.yml')) {
      return { 
        success: true, 
        updateInfo: null, 
        noUpdates: true,
        message: 'You have the latest version'
      };
    }
    
    // Handle actual errors
    let userMessage = 'Failed to check for updates';
    
    if (error.message.includes('404') || error.message.includes('HttpError')) {
      userMessage = 'Update server not available - please try again later';
    } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      userMessage = 'Network error - please check your internet connection';
    } else if (error.message.includes('rate limit')) {
      userMessage = 'Too many requests - please wait a moment before trying again';
    }
    
    return { success: false, error: userMessage };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', async () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});
