@echo off
setlocal
net session >nul 2>&1
if errorlevel 1 (
  echo Windows va a pedir permiso para que el celular pueda entrar a Anversol.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo Permitiendo Anversol Gym en la red del gimnasio...
powershell -NoProfile -Command ^
  "Get-NetFirewallRule -DisplayName 'Node.js JavaScript Runtime' -ErrorAction SilentlyContinue | Where-Object { $_.Action -eq 'Block' -and $_.Direction -eq 'Inbound' } | Disable-NetFirewallRule;" ^
  "Get-NetFirewallRule -DisplayName 'Anversol Gym' -ErrorAction SilentlyContinue | Remove-NetFirewallRule;" ^
  "$node = (Get-Command node -ErrorAction SilentlyContinue).Source; if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' };" ^
  "New-NetFirewallRule -DisplayName 'Anversol Gym' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private,Domain -Program $node | Out-Null;" ^
  "New-NetFirewallRule -DisplayName 'Anversol Gym mDNS' -Direction Inbound -Action Allow -Protocol UDP -LocalPort 5353 -Profile Private,Domain -Program $node | Out-Null;" ^
  "Write-Host 'Listo. En el iPhone usa la IP 192.168 de la ventana de Anversol, por ejemplo http://192.168.1.61:3000'"
echo.
pause
