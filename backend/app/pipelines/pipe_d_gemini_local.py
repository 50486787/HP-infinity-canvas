"""
backend/app/pipelines/pipe_d_gemini_local.py
Pipeline D: 本地 Gemini 服务调用 (Port 8021)
通常用于调用本地运行的浏览器自动化/爬虫版 Gemini
"""
import logging
import base64
import os
from typing import Dict, Any
import httpx
from config import settings
from app.utils import storage

logger = logging.getLogger("backend.pipe_d_local")

async def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    调用本地运行的 Gemini 服务
    Payload 参数:
    - user_input (str): 提示词
    - file_path (str): 本地文件路径 (可选)
    - ratio (str): 图片比例 (可选, 默认 auto)
    - new_chat (bool): 是否开启新对话 (默认 True)
    """
    # [新增] 获取项目ID (如果前端传了)
    project_id = payload.get("project_id")

    # 确保配置中有 GEMINI_LOCAL_URL，否则使用默认
    base_url = getattr(settings, "GEMINI_LOCAL_URL", "http://127.0.0.1:8021")
    url = f"{base_url}/chat"
    
    # 构造发给 8021 的请求体，字段名必须与 server.py 中的 GeminiRequest 一致
    gemini_payload = {
        "user_input": payload.get("user_input", payload.get("prompt", "")), # 兼容 prompt 字段
        "file_path": payload.get("file_path"),
        "ratio": payload.get("ratio", "auto"),
        "new_chat": payload.get("new_chat", True)
    }

    logger.info(f"🚀 Calling Gemini Local Service at {url}...")

    try:
        # trust_env=False 忽略代理，timeout 设置长一点因为本地爬虫处理可能较慢
        async with httpx.AsyncClient(trust_env=False, timeout=120.0) as client:
            resp = await client.post(url, json=gemini_payload)
            
            if resp.status_code != 200:
                return {"status": "error", "message": f"Gemini Service Error: {resp.text}"}
            
            result = resp.json()
            logger.info(f"🔍 Raw Gemini Response: {result}")
            
            # 处理返回结果
            # server.py 返回的是 {"status": "success", "images": ["本地路径..."], "text": "..."}
            response_data = {
                "status": result.get("status", "error"),
                "info": result.get("text") or result.get("message", "")
            }

            images = result.get("images", [])
            if images:
                img_path = images[0]
                if os.path.exists(img_path):
                    # [Modified] Read file and save to storage, return URL
                    with open(img_path, "rb") as img_file:
                        content = img_file.read()
                        save_result = storage.save_generated_image(content, prefix="gemini", project_id=project_id)
                        response_data["image"] = save_result["url"]
                        response_data["assets"] = save_result
                else:
                    logger.error(f"❌ Image path returned but file not found: {img_path}")
                    response_data["info"] = (response_data["info"] or "") + f" [Error: File not found at {img_path}]"
            
            return response_data

    except Exception as e:
        logger.error(f"❌ Gemini Local Call Failed: {e}")
        return {"status": "error", "message": str(e)}