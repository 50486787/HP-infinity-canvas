@echo off
chcp 65001 >nul
echo ==========================================
echo      AI Canvas Editor - 自动启动脚本
echo ==========================================

REM 1. 检查是否安装了 Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 你的电脑还没安装 Node.js。
    echo 请先去 https://nodejs.org/ 下载安装 "LTS" 版本。
    echo 安装完后，再双击这个脚本就行了。
    pause
    exit
)

REM 2. 检查是否需要安装依赖 (如果没有 node_modules 文件夹，就自动安装)
if not exist "node_modules" (
    echo [信息] 第一次运行，正在自动安装依赖... (可能需要几分钟，请耐心等待)
    call npm install
)

REM 3. 启动项目
echo [信息] 正在启动... 启动成功后请在浏览器访问显示的 Local 地址。
echo.
call npm run dev -- --open