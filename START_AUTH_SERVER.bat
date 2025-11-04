@echo off
title LumoAI Auth Server
cd /d "%~dp0server"
echo ========================================
echo Starting LumoAI Authentication Server
echo ========================================
echo.
echo MongoDB URI: mongodb://127.0.0.1:27017/Lumo_AI
echo Server Port: 8765
echo.
echo IMPORTANT: Keep this window open!
echo Close this window to stop the server.
echo ========================================
echo.
node index.js
echo.
echo Server stopped!
pause
