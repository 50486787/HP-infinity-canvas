"""
backend/app/pipelines/pipe_e_photoshop.py
Pipeline E: 与 Adobe Photoshop 的交互管道
"""
import logging
import asyncio
import json
import uuid
import os
from urllib.parse import urlparse, unquote
from typing import Dict, Any
from config import settings
from app.utils import ps_bridge
from app.websocket_manager import manager # [New] 引入 WebSocket 管理器以支持广播

logger = logging.getLogger("backend.pipeline.photoshop")

async def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    执行与 Photoshop 的交互任务。
    
    Args:
        payload (Dict[str, Any]): 前端传来的数据负载。
                                   例如: {"action": "import_layers", "project_id": "..."}
                                   
    Returns:
        Dict[str, Any]: 返回给前端的结果。
    """
    logger.info(f"🎨 Executing Photoshop task with payload: {payload}")
    
    # 从 payload 中获取具体动作和项目ID
    action = payload.get("action")
    project_id = payload.get("project_id")

    try:
        # 1. 准备路径 (存放在 workspace/{project_id}/ps_exchange)
        if project_id:
            project_dir = settings.WORKSPACE_DIR / project_id
            ps_exchange_dir = project_dir / "ps_exchange"
            # 确保目录存在
            ps_exchange_dir.mkdir(parents=True, exist_ok=True)
            
            # 构造前端访问的 URL 前缀 (/files 映射到 workspace)
            url_prefix = f"/files/{project_id}/ps_exchange"
        else:
            # 如果没有 project_id (极少情况)，回退到临时目录
            ps_exchange_dir = settings.WORKSPACE_DIR / "temp_ps"
            ps_exchange_dir.mkdir(parents=True, exist_ok=True)
            url_prefix = "/files/temp_ps"

        # 2. 执行动作
        if action == "import_layers":
            # === PS -> Canvas ===
            logger.info(f"📥 Importing layers from Photoshop to {ps_exchange_dir}")
            
            # [Fix] 在主线程捕获事件循环，以便在子线程中使用
            loop = asyncio.get_running_loop()

            # 在线程池中运行阻塞的 COM 操作
            def _do_import():
                # 调用 ps_bridge，传入动态计算的路径
                json_path = ps_bridge.export_scene_to_canvas(str(ps_exchange_dir), url_prefix)
                
                if isinstance(json_path, dict) and "error" in json_path:
                    raise Exception(json_path["error"])
                
                # 读取生成的 JSON
                with open(json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                # [新增] 提取画布容器信息，供前端创建对应大小的 Frame
                canvas_info = {
                    "width": data.get("canvas_width"),
                    "height": data.get("canvas_height"),
                }

                # 转换为前端 Canvas 需要的格式
                # [Fix] Photoshop 导出列表是 [顶层, ..., 底层]
                # Konva 渲染顺序是 [底层, ..., 顶层] (数组尾部在最上面)
                # 因此需要反转列表，确保视觉层级正确
                new_objects = []
                source_layers = data.get("layers", [])
                for layer in reversed(source_layers):
                    new_objects.append({
                        "type": "image",
                        "id": layer["id"], # 使用 ps_bridge 生成的唯一ID
                        "attrs": {
                            "src": layer["src"], # 已经是 /files/... 的 URL
                            "x": layer["x"],
                            "y": layer["y"],
                            "width": layer["width"],
                            "height": layer["height"],
                            "name": layer["name"],
                            "opacity": layer.get("opacity", 100) / 100.0 # 转换透明度 0-1
                        }
                    })
                
                # [New] 广播结果给所有前端客户端
                logger.info("📡 Broadcasting import result to all clients...")
                # 这样即使是 PS 插件触发的任务，浏览器端也能收到更新
                future = asyncio.run_coroutine_threadsafe(
                    manager.broadcast({
                        "type": "complete",
                        "data": {"canvas_info": canvas_info, "new_objects": new_objects}
                    }),
                    loop
                )
                # [Fix] 添加回调以捕获广播过程中的错误
                def broadcast_callback(fut):
                    try: fut.result()
                    except Exception as e: logger.error(f"❌ Broadcast failed: {e}")
                future.add_done_callback(broadcast_callback)

                return {"status": "success", "canvas_info": canvas_info, "new_objects": new_objects}

            return await asyncio.to_thread(_do_import)

        elif action == "export_to_ps":
            # === Canvas -> PS ===
            # 支持多图层导出 (layers 数组)，同时也兼容单图层参数
            layers = payload.get("layers", [])
            # 兼容旧的单图模式
            if not layers and "image_path" in payload:
                layers = [{
                    "image_path": payload["image_path"],
                    "x": payload.get("x", 0),
                    "y": payload.get("y", 0),
                    "width": payload.get("width"),
                    "height": payload.get("height")
                }]

            # 获取画布容器尺寸 (如果前端没传，默认 2000)
            canvas_width = payload.get("canvas_width", 2000)
            canvas_height = payload.get("canvas_height", 2000)

            logger.info(f"📤 Exporting {len(layers)} layers to Photoshop (Canvas: {canvas_width}x{canvas_height})")
            
            def _do_export():
                # 1. 构造临时 manifest JSON
                # 利用 ps_bridge 的还原能力，支持多图层 + 尺寸还原
                temp_dir = ps_exchange_dir # [Fix] 使用项目内的 ps_exchange 目录，该目录在函数开头已创建
                manifest_layers = []
                for l in layers:
                    local_path = _resolve_path(l.get("image_path"))
                    if not local_path: continue
                    
                    manifest_layers.append({
                        "filename": local_path, # ps_bridge 支持绝对路径
                        "name": "From Canvas",
                        "x": l.get("x", 0),
                        "y": l.get("y", 0),
                        "width": l.get("width"),
                        "height": l.get("height")
                    })
                
                manifest = {
                    "canvas_width": canvas_width,
                    "canvas_height": canvas_height,
                    "layers": manifest_layers
                }
                
                json_path = temp_dir / f"export_{uuid.uuid4().hex[:6]}.json"
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(manifest, f, indent=2)
                
                # 2. 调用 ps_bridge 的智能导入
                # 传入 JSON 路径，ps_bridge 会自动解析并还原所有图层
                force_new = payload.get("force_new_document", False)
                result = ps_bridge.smart_import_to_ps(str(json_path), force_new_document=force_new)
                
                if isinstance(result, dict) and "error" in result:
                    raise Exception(result["error"])
                
                count = result.get("count", 0) if isinstance(result, dict) else "?"
                return {"status": "success", "message": f"Exported {count} layers to Photoshop"}
                
            return await asyncio.to_thread(_do_export)
        
        else:
            return {"status": "error", "message": f"Unknown action: {action}"}

    except Exception as e:
        logger.error(f"❌ Photoshop task failed: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

def _resolve_path(path_str: str) -> str:
    """辅助函数：将前端传来的 URL 或路径转换为本地绝对路径"""
    if not path_str:
        return ""
    
    # 1. 如果是完整 URL (http://...), 提取路径部分
    if path_str.startswith("http"):
        parsed = urlparse(path_str)
        path_str = unquote(parsed.path) # 解码 URL 编码
        
    # 2. 如果是 /files/ 开头的路径 (映射到 workspace)
    if path_str.startswith("/files/"):
        # 去掉 /files/ 前缀
        rel_path = path_str[len("/files/"):]
        # 拼接到 workspace 根目录
        return str(settings.WORKSPACE_DIR / rel_path)
        
    # 3. 如果已经是本地存在的绝对路径，直接返回
    if os.path.exists(path_str):
        return path_str
        
    return path_str
