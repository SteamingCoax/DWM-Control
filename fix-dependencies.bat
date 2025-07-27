@echo off
echo ========================================
echo Fix Missing Dependencies (fd-slicer)
echo ========================================
echo.

echo The error shows 'fd-slicer' module is missing.
echo This often happens on network drives or with corrupted installations.
echo.

echo Step 1: Complete cleanup...
if exist "node_modules" (
    echo Removing node_modules...
    rmdir /s /q "node_modules"
)
if exist "package-lock.json" (
    echo Removing package-lock.json...
    del "package-lock.json"
)

echo.
echo Step 2: Clear all npm caches...
npm cache clean --force

echo.
echo Step 3: Install fd-slicer manually first...
npm install fd-slicer

echo.
echo Step 4: Install yauzl (which needs fd-slicer)...
npm install yauzl

echo.
echo Step 5: Install extract-zip...
npm install extract-zip

echo.
echo Step 6: Now install all dependencies...
npm install

if errorlevel 1 (
    echo Installation still failing.
    echo.
    echo This is likely due to the network drive Z:
    echo.
    echo SOLUTION: Copy this project to C:\Projects\DWM-Control
    echo Then run the installation from the local drive.
    echo.
    pause
    exit /b 1
)

echo.
echo Dependencies installed successfully!
echo Testing application...
npm run dev

pause
