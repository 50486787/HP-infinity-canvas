# AI Canvas Editor - Backend

这是项目的后端服务，基于 Python 和 FastAPI，使用 `uv` 进行包管理。

## 🚀 快速开始

1. **安装 Python**: 确保电脑安装了 Python (3.10 或更高版本)。
2. **一键运行**: 双击 `start.bat`。
   - 脚本会自动检测并安装 `uv` 工具。
   - `uv` 会自动创建虚拟环境并下载所有依赖。
   - 服务启动在: `http://127.0.0.1:8020`

## 🛠️ 常用命令 (开发者)

如果你习惯使用命令行：

```bash
# 同步依赖
uv sync

# 启动服务
uv run uvicorn main:app --reload --port 8020
```