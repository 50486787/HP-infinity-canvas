@echo off
chcp 65001 >nul
echo ==========================================
echo      AI Canvas Editor - 后端启动脚本
echo ==========================================

REM 1. 检查是否安装了 uv
uv --version >nul 2>&1
if %errorlevel% equ 0 goto :start_app

echo [警告] 未检测到 uv 工具。
echo 正在尝试通过 Python pip 安装 uv...

REM 检查 Python 是否存在
python --version >nul 2>&1
if %errorlevel% neq 0 goto :error_no_python

REM 尝试安装 uv
pip install uv
if %errorlevel% neq 0 goto :error_install_uv

echo [成功] uv 安装完成。
goto :start_app

:error_no_python
echo [错误] 你的电脑既没有安装 uv，也没有安装 Python。
echo 请先安装 Python (推荐 3.10+): https://www.python.org/
echo 安装时请务必勾选 "Add Python to PATH"。
pause
exit

:error_install_uv
echo [错误] 自动安装 uv 失败。
echo 请手动打开终端运行: pip install uv
pause
exit

:start_app
REM 2. 启动服务
echo [信息] 正在启动后端服务...
echo [提示] 如果是首次运行，uv 会自动配置虚拟环境并安装依赖，请耐心等待。
echo.

REM 强制 Python 使用 UTF-8 编码，防止 Windows 下打印 Emoji 报错
set PYTHONUTF8=1

REM uv run 会自动检查 pyproject.toml/uv.lock 并同步环境
uv run python -m uvicorn main:app --reload --port 8020

if %errorlevel% neq 0 (
    echo.
    echo [错误] 服务启动失败，请检查报错信息。
    pause
)