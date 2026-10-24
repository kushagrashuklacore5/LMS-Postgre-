@echo off
echo Starting Backend and Frontend Services...

cd /d "%~dp0server"
echo Starting Backend...
start "Backend" cmd /c "npm start"

timeout /t 5 /nobreak >nul

cd /d "%~dp0client"
echo Starting Frontend...
start "Frontend" cmd /c "npm run dev"

echo.
echo Services are starting...
echo.
echo Frontend: http://localhost:5174
echo Backend:  http://localhost:5002
echo.
echo This window can be closed safely.
echo Services will continue running in background.
echo.
echo To stop services, close the Backend and Frontend windows.
pause
