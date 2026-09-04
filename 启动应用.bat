@echo off
title LLM Wiki 启动器
echo ========================================
echo   LLM Wiki 知识管理系统 - 启动脚本
echo ========================================
echo.

cd /d D:\实验

echo [1/2] 启动 Vite Dev Server (端口5173)...
start "Vite Dev Server" /min cmd /c "npx vite --port 5173"

echo [2/2] 等待 Vite 就绪...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo  启动完成！
echo  - 浏览器访问: http://localhost:5173/
echo  - Vite 在后台最小化窗口运行
echo ========================================
echo.
echo 要启动 Tauri 桌面应用，请运行: npm run tauri:dev
echo.

start http://localhost:5173/

echo 已自动打开浏览器。按任意键关闭此窗口...
pause >nul