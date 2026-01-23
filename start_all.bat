@echo off
chcp 65001 >nul
title AI Canvas Editor
echo ==========================================
echo      AI Canvas Editor - 全栈启动脚本
echo ==========================================

echo [1/2] 正在启动后端服务...
cd backend
REM 使用 /b 参数在当前窗口后台运行，不弹出新窗口
REM start "" /b 表示无标题、在同一窗口后台运行
start "" /b cmd /c "call start.bat"
cd ..

REM 稍微等待一下后端初始化（可选）
timeout /t 2 >nul

echo [2/2] 正在启动前端服务...
echo [提示] 关闭此窗口将同时停止前端和后端服务。
echo.

REM 进入前端目录并直接在当前窗口运行
cd frontend
call start.bat

REM 当你按 Ctrl+C 停止前端服务后，脚本会继续执行以下命令清理后端
echo.
echo [信息] 正在停止后台服务...
taskkill /IM uvicorn.exe /F >nul 2>&1
taskkill /IM python.exe /F >nul 2>&1
echo [成功] 服务已停止。
pause
