@echo off
chcp 65001 >nul
title virex-trader launcher

REM ====================================================================
REM   Local dev launcher:
REM     - PostgreSQL -> Docker container (only the DB)
REM     - backend    -> local (npm, NestJS)
REM     - frontend   -> local (npm, Next.js)
REM
REM   No container rebuilds needed for code changes — the apps run locally
REM   with hot reload, only the database lives in Docker.
REM
REM   Change HOST / ports in ONE place — right here.
REM ====================================================================
set "HOST=localhost"
set "WEB_PORT=8090"
set "API_PORT=8091"
REM ====================================================================

set "API_URL=http://%HOST%:%API_PORT%"
set "WEB_URL=http://%HOST%:%WEB_PORT%"

REM --- Make sure Docker is running ---
docker info >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [!] Docker is not running. Start Docker Desktop and try again.
  echo.
  pause
  exit /b 1
)

REM --- Start ONLY the database (wait until it is healthy) ---
echo   Starting PostgreSQL in Docker...
docker compose up -d --wait db

REM --- Free the app ports in case the full-docker stack is still up ---
docker compose stop api web >nul 2>&1

REM --- Sync DB schema (idempotent; safe to run every time) ---
echo   Syncing database schema (prisma db push)...
pushd "%~dp0backend"
call npx prisma db push --skip-generate
popd

echo.
echo   DB   -^>  localhost:5432   ( docker )
echo   API  -^>  %API_URL%
echo   WEB  -^>  %WEB_URL%      ( open this one in the browser )
echo.

REM --- API window: port + CORS origin passed via environment ---
set "PORT=%API_PORT%"
set "FRONTEND_URL=%WEB_URL%"
start "virex-backend" cmd /k "cd /d %~dp0backend && npm run start:dev"

REM --- WEB window: port via -p, API url via environment ---
set "NEXT_PUBLIC_API_URL=%API_URL%"
start "virex-frontend" cmd /k "cd /d %~dp0frontend && npm run dev -- -p %WEB_PORT% -H %HOST%"

REM --- open the browser once the servers have warmed up ---
echo   Opening %WEB_URL% in ~12s...
timeout /t 12 /nobreak >nul
start "" %WEB_URL%

echo.
echo   Two windows opened (virex-backend / virex-frontend). DB stays in Docker.
echo   Run stop.bat to stop the apps (and the DB container).
echo.
pause
