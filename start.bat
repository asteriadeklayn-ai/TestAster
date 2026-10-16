@echo off
chcp 65001 >nul
title Test platformasi
cd /d "%~dp0"
echo %~dp0 | find /i "\Temp\" >nul
if not errorlevel 1 goto inzip
if not exist server\index.js goto nofiles
echo [1/3] Node.js tekshirilmoqda...
where node >nul 2>nul
if errorlevel 1 goto nonode
node -v
if exist node_modules goto run
echo [2/3] Kutubxonalar o'rnatilmoqda (internet kerak, 1-3 daqiqa)...
call npm install
if errorlevel 1 goto npmfail
:run
echo [3/3] Dastur ishga tushmoqda...
echo Brauzer ochiladi: http://localhost:3000  (bu oynani yopmang)
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
node server\index.js
echo.
echo Dastur to'xtadi. Yuqoridagi xatolik matniga qarang.
pause
exit /b
:inzip
echo XATO: Zip fayl hali ochilmagan. Zip ustida sichqonchaning o'ng tugmasi - "Extract All" (Hammasini chiqarish)
echo qiling, keyin ochilgan papkadan start.bat ni ishga tushiring.
pause
exit /b
:nofiles
echo XATO: server papkasi topilmadi. start.bat faylini papkadan tashqariga chiqarmang.
pause
exit /b
:nonode
echo XATO: Node.js o'rnatilmagan. https://nodejs.org saytidan "LTS" ni yuklab o'rnating,
echo kompyuterni qayta yoqing va start.bat ni yana ishga tushiring.
pause
exit /b
:npmfail
echo XATO: kutubxonalarni yuklab bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.
pause
exit /b
