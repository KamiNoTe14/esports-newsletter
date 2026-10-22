@echo off
rem Asks for the OBS WebSocket password again (for highlight clips), then starts the relay.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0levelup-rl-relay.ps1" -SetupClips
pause
