"""
backend/app/utils/storage.py
文件存储管理器：负责 Inputs 和 Generations 的文件读写
结构：
项目根目录/
  ├── backend/
  └── workspace/       <-- 我们要读写这里
      ├── inputs/
      └── generations/
"""
import os
import uuid
import shutil
import hashlib # [新增] 用于计算哈希去重
import logging
import aiofiles
from pathlib import Path
from fastapi import UploadFile
from config import settings

# --- 1. 定位路径 ---
WORKSPACE_DIR = settings.WORKSPACE_DIR
PROJECTS_DIR = WORKSPACE_DIR # [修改] 项目直接位于 workspace 下

# 服务地址 (如果部署到服务器，请修改这里)
SERVER_BASE_URL = settings.SERVER_BASE_URL

logger = logging.getLogger("backend.storage")

# --- 初始化函数 ---
def init_storage():
    """系统启动时调用：确保存储目录存在"""
    print(f"✅ Storage System Initialized at: {WORKSPACE_DIR}")
    logger.info(f"✅ Storage System Initialized at: {WORKSPACE_DIR}")

# --- 2. 核心功能: 保存上传 (Inputs) - [含去重逻辑] ---
async def save_upload_file(file: UploadFile, project_id: str = None, type: str = "inputs") -> dict:
    """保存用户上传的原图 (支持存入指定项目)"""
    
    # [强制] 必须提供 project_id，取消公共存储区
    if not project_id:
        raise ValueError("❌ Upload failed: project_id is required. Public storage is disabled.")

    # [修改] 支持动态目录 (inputs, generations, ps_exchange)
    valid_types = ["inputs", "generations", "ps_exchange"]
    sub_dir = type if type in valid_types else "inputs"

    save_dir = PROJECTS_DIR / project_id / sub_dir
    # URL 映射: /files/{id}/{sub_dir}/... (因为 workspace 挂载在 /files)
    url_prefix = f"/files/{project_id}/{sub_dir}"

    save_dir.mkdir(parents=True, exist_ok=True)

    # 1. 读取文件内容
    content = await file.read()
    
    # 2. 计算 Hash (SHA-256)
    file_hash = hashlib.sha256(content).hexdigest()
    
    # 3. 构造文件名: {原名stem}_{hash前8位}{后缀}
    original_name = file.filename or "upload.png"
    name_stem = Path(original_name).stem
    suffix = Path(original_name).suffix
    
    # 使用 hash 前8位作为唯一标识，既防重名又防内容重复
    new_filename = f"{name_stem}_{file_hash[:8]}{suffix}"
    save_path = save_dir / new_filename
    
    # 构造 URL
    url_path = f"{url_prefix}/{new_filename}"
    full_url = f"{SERVER_BASE_URL}{url_path}"

    # 4. [去重检测] 如果文件已存在，直接返回 URL
    if save_path.exists():
        logger.info(f"⚡ File exists (Hash match): {new_filename}")
        return {
            "filename": new_filename,
            "path": str(save_path),
            "url": full_url,
            "relative_url": url_path
        }
    
    # 5. 写入文件 (使用 aiofiles 异步写入，避免阻塞)
    async with aiofiles.open(save_path, "wb") as f:
        await f.write(content)
        
    logger.info(f"📂 Saved uploaded file: {new_filename}")
    return {
        "filename": new_filename,
        "path": str(save_path),
        "url": full_url,
        "relative_url": url_path
    }

# --- 3. 核心功能: 保存生成结果 (Generations) ---
def save_generated_image(image_bytes: bytes, prefix: str = "gen", ext: str = "png", project_id: str = None) -> dict:
    """保存生成图 (支持存入指定项目)"""
    
    # [强制] 必须提供 project_id
    if not project_id:
        raise ValueError("❌ Save failed: project_id is required for generated images.")

    save_dir = PROJECTS_DIR / project_id / "generations"
    url_prefix = f"/files/{project_id}/generations"

    save_dir.mkdir(parents=True, exist_ok=True)

    # [修改] 使用短 UUID (8位) 防止重复，同时保持文件名简洁
    short_id = uuid.uuid4().hex[:8]
    filename = f"{prefix}_{short_id}.{ext}"
    save_path = save_dir / filename
    
    with open(save_path, "wb") as f:
        f.write(image_bytes)
        
    # 构造 URL
    url_path = f"{url_prefix}/{filename}"
    full_url = f"{SERVER_BASE_URL}{url_path}"
    
    logger.info(f"💾 Saved generated image: {filename}")

    return {
        "filename": filename,
        "path": str(save_path),
        "url": full_url,
        "relative_url": url_path,
        "type": "image"
    }