"""
backend/config.py
全局配置管理
"""
from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path

class Settings(BaseSettings):
    # ComfyUI 地址 (默认本地)
    COMFY_URL: str = "http://127.0.0.1:8188"
    
    # OpenAI API Key (从环境变量或 .env 文件读取)
    OPENAI_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_LOCAL_URL: str = "http://127.0.0.1:8021"

    # [新增] 服务基础地址 (用于生成图片 URL, 结尾不带 /)
    SERVER_BASE_URL: str = "http://localhost:8020"

    # [新增] 工作区根目录 (默认为项目根目录下的 workspace)
    # backend/config.py -> backend/ -> code3-10/ -> workspace
    WORKSPACE_DIR: Path = Path(__file__).resolve().parent.parent / "workspace"

    # 允许的跨域来源
    CORS_ORIGINS: list[str] = ["*"]

    class Config:
        # 允许从 .env 文件加载环境变量
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
