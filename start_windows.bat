@echo off
cd /d "%~dp0"
echo.
echo WELP - Home Workout Helper
echo Open http://localhost:8000 in Chrome or Edge.
echo.
where node >nul 2>&1
if %errorlevel%==0 (
  if exist ".env" (
    echo Starting WELP with local environment config...
    node --env-file=.env server.mjs
  ) else (
    echo Starting WELP without Gemini API key. Local coach is available.
    node server.mjs
  )
) else (
  echo Node.js 22+ not found. Starting the static fallback with Python...
  echo Gemini voice will be unavailable until you install Node.js.
  py -3 -m http.server 8000
  if errorlevel 1 python -m http.server 8000
)
pause
