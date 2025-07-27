@echo off
echo Fixing SerialPort binding issue...

REM Kill any running electron processes
taskkill /f /im electron.exe 2>nul

echo Installing electron-rebuild...
npm install --save-dev electron-rebuild

echo Rebuilding native modules for Electron...
npx electron-rebuild --force

echo Done! Now try: npm run dev
pause
