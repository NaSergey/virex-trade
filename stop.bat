@echo off
chcp 65001 >nul
title stop virex-trader

echo Stopping local Node.js servers (api + web)...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel%==0 (
  echo   Apps stopped.
) else (
  echo   No local apps were running.
)

echo Stopping PostgreSQL container...
docker compose stop db >nul 2>&1
echo   DB container stopped (data is kept in the volume).

timeout /t 2 /nobreak >nul
