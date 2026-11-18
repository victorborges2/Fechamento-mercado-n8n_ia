@echo off
REM Gera o preview do e-mail e o JSON do workflow a partir do codigo em build/.
REM Clique duas vezes neste arquivo. Nao precisa de terminal.

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js nao encontrado.
  echo   Instale em https://nodejs.org e tente de novo.
  echo.
  pause
  exit /b 1
)

if not exist "config.local.js" (
  echo.
  echo   Aviso: config.local.js nao existe.
  echo   O workflow sera gerado com dados de exemplo.
  echo   Para usar os seus, copie config.exemplo.js para config.local.js e edite.
  echo.
)

echo.
node make.js
echo.
pause
