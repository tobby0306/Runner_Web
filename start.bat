@echo off
echo Starting Runner Pulse Analytics Local Server...
py serve.py
if errorlevel 1 (
    python serve.py
)
pause
