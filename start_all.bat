@echo off
chcp 65001 >nul
title AI Canvas Editor
echo ==========================================
echo      AI Canvas Editor - 全栈启动脚本
echo ==========================================


REM === 自动检测并安装 Node.js ===
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 未检测到 Node.js 环境，前端无法启动。
    echo [信息] 正在尝试自动下载并安装 Node.js (LTS)...
    
    set "NODE_URL=https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    set "NODE_MSI=node_install.msi"
    
    echo [下载] 正在下载 Node.js 安装包...
    powershell -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_MSI%'"
    
    echo [安装] 正在启动安装程序，请按提示完成安装...
    start /wait msiexec /i %NODE_MSI%
    
    del %NODE_MSI%
    echo.
    echo [提示] Node.js 安装完成。请 **关闭此窗口** 并重新运行脚本以加载环境变量。
    pause
    exit
)

echo [1/2] 正在启动后端服务 (后台运行)...
REM 使用 start /min 最小化启动，确保服务拥有独立窗口进程，避免启动失败
cd backend
start "Backend" /min cmd /c "call start.bat >..\backend.log 2>&1"
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
