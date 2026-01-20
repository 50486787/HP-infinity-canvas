"""
backend/app/pipelines/pipe_a_rembg.py
Pipeline A: 本地 RemBg 抠图任务 (支持文件存储)
"""
import os
import urllib.parse
from pathlib import Path
import base64
import io
import logging
import requests
from typing import Dict, Any
from PIL import Image

# [新增] 引入存储模块
from app.utils import storage

# 1. 配置 RemBg 模型保存路径 (必须在导入 rembg 之前设置)
# 获取 backend 根目录
BASE_DIR = Path(__file__).resolve().parents[2]
MODEL_DIR = BASE_DIR / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# 设置环境变量 U2NET_HOME，覆盖默认的 ~/.u2net
os.environ["U2NET_HOME"] = str(MODEL_DIR)

import rembg

# 配置子进程日志
logger = logging.getLogger("backend.pipe_a_rembg")

# 全局变量缓存模型 Session (在 Worker 进程中复用)
_rembg_sessions = {}

def _get_session(model_name: str = "u2net"):
    """
    获取或创建 RemBg Session。
    """
    global _rembg_sessions
    if model_name not in _rembg_sessions:
        logger.info(f"Initializing RemBg session with model: {model_name}")
        _rembg_sessions[model_name] = rembg.new_session(model_name)
    return _rembg_sessions[model_name]

def _run_rembg_sync(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    [同步函数] 在独立进程中运行。
    """
    try:
        # 1. 解析输入
        image_input = payload.get("image")
        model_name = payload.get("model", "u2net")
        
        # [新增] 获取项目ID
        project_id = payload.get("project_id")
        
        if not project_id:
            return {"status": "error", "message": "Missing project_id in payload for RemBg task"}

        if not image_input:
            return {"status": "error", "message": "No image data provided"}

        # [新增] 尝试从 URL 中提取原文件名，用于生成结果文件名
        prefix = "rembg"
        if isinstance(image_input, str) and image_input.startswith("http"):
            try:
                path = urllib.parse.urlparse(image_input).path
                filename = os.path.basename(path)
                stem = os.path.splitext(filename)[0]
                prefix = f"{stem}_rembg"
            except Exception:
                pass

        input_image = None

        # --- [核心修改] 智能读取图片 (支持 URL 或 Base64) ---
        if image_input.startswith("http"):
            # 情况 A: 如果是 URL (已上传到 workspace/inputs 的图片)
            try:
                # 直接通过网络流读取，不保存临时文件
                resp = requests.get(image_input, stream=True)
                resp.raise_for_status()
                input_image = Image.open(io.BytesIO(resp.content))
            except Exception as e:
                return {"status": "error", "message": f"Failed to download image from URL: {e}"}
            
        elif "," in image_input:
            # 情况 B: 兼容旧逻辑 (Base64)
            _, encoded = image_input.split(",", 1)
            try:
                img_bytes = base64.b64decode(encoded)
                input_image = Image.open(io.BytesIO(img_bytes))
            except Exception as e:
                return {"status": "error", "message": f"Invalid Base64 data: {e}"}
        else:
            return {"status": "error", "message": "Unknown image format (must be URL or Base64)"}

        # 2. 执行 RemBg (核心计算)
        session = _get_session(model_name)
        output_image = rembg.remove(input_image, session=session)

        # 3. 保存结果
        output_buffer = io.BytesIO()
        output_image.save(output_buffer, format="PNG")
        img_bytes = output_buffer.getvalue()

        # [核心修改] 调用 storage 保存文件，而不是返回 Base64
        # 结果会自动存入 backend/workspace/{project_id}/generations/
        save_result = storage.save_generated_image(img_bytes, prefix=prefix, project_id=project_id)
        
        logger.info(f"💾 RemBg result saved to disk: {save_result['filename']}")
        
        return {
            "status": "success",
            # 返回 URL 给前端，前端 img.src 直接用这个 URL 即可
            "image": save_result["url"], 
            # 附带详细资产信息 (供后续 project.json 使用)
            "assets": save_result
        }

    except Exception as e:
        logger.error(f"RemBg processing failed: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

async def run(payload: Dict[str, Any], process_pool) -> Dict[str, Any]:
    """
    [异步包装器] 主线程调用此函数。
    """
    import asyncio
    
    loop = asyncio.get_running_loop()
    
    logger.info("Submitting RemBg task to process pool...")
    result = await loop.run_in_executor(process_pool, _run_rembg_sync, payload)
    
    return result