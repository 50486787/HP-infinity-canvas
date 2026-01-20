@echo off
chcp 65001 >nul
echo ==========================================
echo      正在关闭 AI Canvas Editor...
echo ==========================================

REM 关闭后端进程 (Python/Uvicorn)
taskkill /IM "uvicorn.exe" /F >nul 2>&1
taskkill /IM "python.exe" /F >nul 2>&1

REM 关闭前端窗口 (根据窗口标题)
taskkill /FI "WINDOWTITLE eq AI Canvas Editor" /T /F >nul 2>&1

REM 强制清理可能残留的 Node.js 进程 (可选，如果上面关不掉的话)
taskkill /IM "node.exe" /F >nul 2>&1

echo [成功] 所有服务已停止。
timeout /t 2 >nul
