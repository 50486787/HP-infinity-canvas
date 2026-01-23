import shutil
import os
import json
import time
import uuid
import logging
import zipfile
import io
from pathlib import Path
from config import settings

logger = logging.getLogger("backend.project_manager")

# 项目根目录: 直接放在 workspace 下，扁平化管理
PROJECTS_DIR = settings.WORKSPACE_DIR

def init_projects_system():
    """初始化项目目录结构"""
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"✅ Project System Initialized at: {PROJECTS_DIR}")

def create_project(name: str) -> dict:
    """
    创建新项目
    目录名格式: YYYYMMDD_HHMMSS_{ShortUUID} (方便按时间排序)
    """
    # 1. 生成项目ID (文件夹名)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    short_uuid = uuid.uuid4().hex[:6]
    project_id = f"Project_{timestamp}_{short_uuid}"
    
    # 2. 创建目录结构
    project_path = PROJECTS_DIR / project_id
    (project_path / "inputs").mkdir(parents=True, exist_ok=True)
    (project_path / "generations").mkdir(parents=True, exist_ok=True)
    
    # 3. 创建 project.json
    project_data = {
        "id": project_id,
        "name": name,
        "created_at": timestamp,
        "updated_at": timestamp,
        "version": "1.0",
        "canvas": {
            "width": 1080,
            "height": 1080,
            "background": "#ffffff"
        },
        "layers": []
    }
    
    json_path = project_path / "project.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(project_data, f, indent=2, ensure_ascii=False)
        
    logger.info(f"✨ Created Project: {name} ({project_id})")
    return project_data

def list_projects() -> list:
    """获取项目列表 (按文件夹名倒序，即时间倒序)"""
    projects = []
    if not PROJECTS_DIR.exists():
        return []
        
    # 遍历目录
    for folder in sorted(PROJECTS_DIR.iterdir(), reverse=True):
        # [修改] 只识别以 Project_ 开头的文件夹，忽略 inputs/generations/workflow 等系统目录
        if folder.is_dir() and folder.name.startswith("Project_"):
            json_path = folder / "project.json"
            if json_path.exists():
                try:
                    data = json.loads(json_path.read_text(encoding="utf-8"))
                    # 补充文件夹名称作为 ID，确保前端能找到它
                    data["id"] = folder.name 
                    projects.append(data)
                except Exception as e:
                    logger.error(f"⚠️ Error reading project {folder.name}: {e}")
                    
    return projects

def get_project(project_id: str) -> dict:
    """获取指定项目详情"""
    project_path = PROJECTS_DIR / project_id
    json_path = project_path / "project.json"
    
    if not json_path.exists():
        return None
        
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
        data["id"] = project_id # 确保 ID 存在
        return data
    except Exception as e:
        logger.error(f"Error reading project {project_id}: {e}")
        return None

def update_project(project_id: str, data: dict):
    """保存/更新项目数据 (覆盖 project.json)"""
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists():
        raise FileNotFoundError(f"Project {project_id} does not exist")
        
    json_path = project_path / "project.json"
    
    # 自动更新修改时间
    data["updated_at"] = time.strftime("%Y%m%d_%H%M%S")
    # 确保 ID 一致
    data["id"] = project_id
    
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    logger.info(f"💾 Project Saved: {project_id}")

def delete_project(project_id: str):
    """删除项目 (物理删除文件夹)"""
    project_path = PROJECTS_DIR / project_id
    if project_path.exists():
        shutil.rmtree(project_path)
        logger.info(f"🗑️ Deleted Project: {project_id}")
    else:
        raise FileNotFoundError(f"Project {project_id} not found")

def import_project(file_bytes: bytes) -> dict:
    """导入项目 ZIP 包"""
    # 1. 生成新 ID
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    short_uuid = uuid.uuid4().hex[:6]
    project_id = f"Project_{timestamp}_{short_uuid}"
    project_dir = PROJECTS_DIR / project_id
    
    # 2. 解压
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes), 'r') as zf:
            zf.extractall(project_dir)
    except Exception as e:
        if project_dir.exists():
            shutil.rmtree(project_dir)
        raise ValueError(f"Invalid ZIP file: {e}")
        
    # 3. 修正 project.json 中的 ID
    json_path = project_dir / "project.json"
    if json_path.exists():
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
            data["id"] = project_id
            # 保持原有的 name, created_at 等信息
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return data
        except Exception as e:
            logger.error(f"Error patching imported project.json: {e}")
            
    return {"id": project_id, "name": "Imported Project"}

def export_project(project_id: str) -> io.BytesIO:
    """打包项目为 ZIP (用于导出)"""
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists():
        raise FileNotFoundError(f"Project {project_id} not found")
        
    # 创建内存中的 ZIP
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        # 遍历目录
        for root, dirs, files in os.walk(project_path):
            for file in files:
                file_path = Path(root) / file
                # 计算在 ZIP 中的相对路径 (相对于项目根目录)
                arcname = file_path.relative_to(project_path)
                zf.write(file_path, arcname)
                
    memory_file.seek(0)
    return memory_file