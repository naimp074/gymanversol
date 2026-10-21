@echo off
setlocal
cd /d "%~dp0"
title Anversol Gym - Red WiFi
where node >nul 2>nul
if errorlevel 1 (
  echo Se necesita Node.js 22.18 o superior instalado en esta PC.
  echo Luego volve a abrir iniciar-gym-red.cmd.
  pause
  exit /b 1
)
if not defined PORT set PORT=3000
set HOST=0.0.0.0
echo.
echo Anversol Gym - Acceso por WiFi
echo En esta PC: http://localhost:%PORT%/admin
call :print_lan
echo Sitio web en /  -  Portal de socios en /socios  -  Administracion en /admin
echo Tambien podes escanear el codigo QR de la pantalla de inicio.
echo Si el celular no entra, ejecuta permitir-red.cmd y acepta el permiso de Windows.
echo Deja esta ventana abierta mientras uses el sistema.
echo Para detenerlo, presiona Ctrl+C.
echo.

netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo El puerto %PORT% ya esta en uso: Anversol ya esta corriendo.
  echo No hace falta abrir otra ventana. Usa las direcciones de arriba en el celular.
  start http://localhost:%PORT%/admin
  echo.
  pause
  exit /b 0
)

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORT%/admin"
node server.mjs
if errorlevel 1 pause
exit /b %errorlevel%

:print_lan
echo En el celular, misma WiFi:
powershell -NoProfile -Command "$p=$env:PORT; $skip='radmin|hamachi|zerotier|tailscale|vmware|virtualbox|hyper-v|vethernet|docker|wsl|loopback|bluetooth|vpn|virtual'; Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notmatch $skip -and ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[0-1])\.') } | ForEach-Object { Write-Host ('  http://' + $_.IPAddress + ':' + $p) }"
echo   http://anversol.local:%PORT%
goto :eof
