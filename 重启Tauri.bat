@echo off
cd /d D:\实验
echo Killing old processes...
taskkill /f /im llm-wiki.exe 2>nul
timeout /t 2 /nobreak >nul
echo Starting Tauri dev (will recompile Rust)...
call npx tauri dev