@echo off
title Chess.com Discord Pinger
echo ==================================================
echo ♟️  Starting Chess.com Discord Pinger Dashboard...
echo 🔗 Opening http://localhost:3001 in Chrome...
echo ==================================================
start chrome "http://localhost:3001" 2>nul || start http://localhost:3001
"C:\Program Files\Adobe\Adobe Photoshop 2024\node.exe" server.mjs
pause
