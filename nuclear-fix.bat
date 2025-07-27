@echo off
echo ========================================
echo NUCLEAR OPTION - Complete Clean Fix
echo ========================================
echo This will completely rebuild everything from scratch
echo.

REM Kill any running processes
taskkill /f /im electron.exe 2>nul
taskkill /f /im node.exe 2>nul

echo Step 1: Complete cleanup...
if exist "node_modules" (
    echo Removing node_modules directory...
    rmdir /s /q "node_modules"
)

if exist "package-lock.json" (
    echo Removing package-lock.json...
    del "package-lock.json"
)

echo.
echo Step 2: Clearing all caches...
npm cache clean --force

echo.
echo Step 3: Fresh install with rebuild...
npm install

echo.
echo Step 4: Installing electron-rebuild...
npm install --save-dev electron-rebuild

echo.
echo Step 5: Rebuilding for Electron...
npx electron-rebuild

echo.
echo Step 6: Testing the application...
echo ========================================
npm run dev

echo.
echo If this still fails, there may be a deeper compatibility issue.
pause
