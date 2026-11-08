@echo off
cd /d "%~dp0"
echo Starting PacePal at http://localhost:8000
py -3 -m http.server 8000
if errorlevel 1 (
  echo Python Launcher not available. Trying python instead...
  python -m http.server 8000
)
pause
