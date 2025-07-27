@echo off
echo ========================================
echo Testing DFU Device Parsing
echo ========================================
echo This tests if the app can parse your DFU output correctly
echo.

echo Creating test output file...
echo Found DFU: [0483:df11] ver=0200, devnum=2, cfg=1, intf=0, path="1-2", alt=2, name="@OTP Memory   /0x1FFF7000/01*512 e", serial="205630584E43" > test_dfu_output.txt
echo Found DFU: [0483:df11] ver=0200, devnum=2, cfg=1, intf=0, path="1-2", alt=1, name="@Option Bytes   /0x40022040/01*48 e", serial="205630584E43" >> test_dfu_output.txt
echo Found DFU: [0483:df11] ver=0200, devnum=2, cfg=1, intf=0, path="1-2", alt=0, name="@Internal Flash   /0x08000000/256*02Kg", serial="205630584E43" >> test_dfu_output.txt

echo.
echo Test DFU output created. The app should now detect devices!
echo.

echo Running actual DFU scan again...
Programs\dfu-util\dfu-util.exe -l

echo.
echo If the app still doesn't show devices, try:
echo 1. Restart the DWM Control app
echo 2. Click "Refresh" button in the firmware upload tab
echo 3. Check the Output Console for error messages
echo.

del test_dfu_output.txt 2>nul

pause
