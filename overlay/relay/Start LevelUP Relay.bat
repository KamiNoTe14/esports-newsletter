@echo off
rem Starts the LevelUP Rocket League relay. Keep this window open while streaming Rocket League.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0levelup-rl-relay.ps1"
pause
