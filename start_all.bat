@echo off
chcp 65001 >nul
title AI Canvas Editor
echo ==========================================
echo      AI Canvas Editor - 全栈启动脚本
echo ==========================================


echo [1/2] 正在启动后端服务 (后台运行)...
REM 使用 start /b 在当前窗口后台启动，并将日志输出到 backend.log
cd backend
start /b "" cmd /c "start.bat >..\backend.log 2>&1"
cd ..


echo [2/2] 正在启动前端服务...
echo [提示] 关闭此窗口将同时停止前端和后端服务。
echo.


REM 进入前端目录并直接在当前窗口运行，不再弹出新窗口
cd frontend
call start.bat

REM 如果前端停止了 (比如按了 Ctrl+C)，尝试清理后台的后端进程
taskkill /IM uvicorn.exe /F >nul 2>&1
taskkill /IM python.exe /F >nul 2>&1