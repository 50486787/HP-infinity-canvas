from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel

# 任务类型枚举：对应你的三大管道
class TaskType(str, Enum):
    COMFY_PROXY = "comfy_proxy"   # Pipeline A: ComfyUI
    REMBG_LOCAL = "rembg_local"   # Pipeline B: 本地去底
    EXTERNAL_API = "external_api" # Pipeline C: 外部 API

# [核心修改] 前端提交任务的请求体
class TaskSubmit(BaseModel):
    # ⬇️⬇️⬇️ 必须加上这一行，允许接收前端传来的 task_id
    task_id: Optional[str] = None 
    
    task_type: TaskType
    payload: Dict[str, Any]  # 灵活的载荷，包含图片路径、参数等
    client_id: str           # 前端的 WebSocket ID，用于定向推送结果

# 提交任务后的立即响应
class TaskResponse(BaseModel):
    task_id: str
    status: str = "queued"
    message: str = "Task submitted successfully"

# WebSocket 推送给前端的消息结构
class WSMessage(BaseModel):
    type: str             # "progress", "complete", "error", "log"
    task_id: Optional[str] = None
    data: Dict[str, Any]  # 具体内容，如 {"progress": 0.5} 或 {"image_url": "..."}