@echo off
title LumoAI - Starting Both Servers
echo ========================================
echo Starting LumoAI Application
echo ========================================
echo.
echo Starting Auth Server on port 8765...
start "LumoAI Auth Server" cmd /k "cd /d %~dp0server && echo Auth Server Starting... && node index.js"
timeout /t 3 /nobreak >nul
echo.
echo Starting Vite Dev Server on port 3000...
start "LumoAI Vite Server" cmd /k "cd /d %~dp0 && echo Vite Server Starting... && npm run dev:client"
echo.
echo ========================================
echo Both servers are starting!
echo ========================================
echo.
echo Two windows should have opened:
echo   1. Auth Server (port 8765)
echo   2. Vite Dev Server (port 3000)
echo.
echo Keep both windows open!
echo.
echo Open your browser at: http://localhost:3000
echo ========================================
pause
