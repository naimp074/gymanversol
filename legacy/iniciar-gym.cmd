@echo off
setlocal
cd /d "%~dp0"
title Anversol Gym
where node >nul 2>nul
if errorlevel 1 (
  echo Se necesita Node.js 22.18 o superior instalado en esta PC.
  echo Luego volve a abrir iniciar-gym.cmd.
  pause
  exit /b 1
)
if not defined PORT set PORT=3000
echo.
echo Anversol Gym - Servidor local
echo Administracion: http://localhost:%PORT%/admin
echo Sitio web:      http://localhost:%PORT%
echo Socios:         http://localhost:%PORT%/socios
echo Deja esta ventana abierta mientras uses el sistema.
echo Para detenerlo, presiona Ctrl+C.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORT%/admin"
node server.mjs
if errorlevel 1 pause
