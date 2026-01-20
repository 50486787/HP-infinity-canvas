"""
backend/app/pipelines/pipe_b_comfyui.py
Pipeline B: ComfyUI 代理任务 (WebSocket + HTTP)
"""
import json
import logging
import uuid
import urllib.parse
import httpx
import websockets
import base64
import asyncio
from typing import Dict, Any, List, Union
from app.utils import storage

# 尝试导入配置，如果失败则使用默认值
try:
    from config import settings
except ImportError:
    class Settings:
        COMFY_URL = "http://127.0.0.1:8188"
    settings = Settings()

logger = logging.getLogger("backend.pipe_b_comfyui")

async def upload_image(image_data_b64: str, filename_prefix: str = "upload_") -> str:
    """
    上传 Base64 图片到 ComfyUI 并返回文件名
    """
    try:
        # 1. 处理 Base64 头部
        if "," in image_data_b64:
            header, encoded = image_data_b64.split(",", 1)
        else:
            encoded = image_data_b64
        
        # 2. 解码
        img_bytes = base64.b64decode(encoded)
        
        # 3. 准备上传
        # 生成随机文件名避免冲突
        filename = f"{filename_prefix}{uuid.uuid4()}.png"
        
        # ComfyUI upload api expects multipart/form-data
        files = {"image": (filename, img_bytes, "image/png")}
        data = {"overwrite": "true"}
        
        async with httpx.AsyncClient(trust_env=False) as client:
            resp = await client.post(f"{settings.COMFY_URL}/upload/image", files=files, data=data)
            
            if resp.status_code == 200:
                resp_json = resp.json()
                # ComfyUI 返回 {"name": "...", "subfolder": "...", "type": "..."}
                return resp_json.get("name")
            else:
                raise Exception(f"Upload failed: {resp.status_code} {resp.text}")
                
    except Exception as e:
        logger.error(f"Image upload exception: {e}")
        raise e

async def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    执行 ComfyUI 任务
    payload 结构:
    {
        "workflow": { ... },  # ComfyUI API 格式 JSON
        "inputs": {           # (可选) 按节点 ID 修改输入
            "25": { "image": "data:image/png;base64,..." }, # Base64 会自动上传
            "30": { "text": "A beautiful sunset" },         # 文本直接替换
            "40": { "image": "G:/my_images/test.png" }      # 本地路径直接替换
        },
        "output_node_id": "100", # (Legacy) 指定监听哪个节点的输出
        "output_nodes": [        # (New) 支持多个输出节点
            {"name": "image", "nodeId": "100"},
            {"name": "mask", "nodeId": "101"}
        ]
    }
    """
    client_id = str(uuid.uuid4())
    ws_url = settings.COMFY_URL.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = f"{ws_url}/ws?clientId={client_id}"
    
    # [新增] 获取项目ID
    project_id = payload.get("project_id")

    workflow = payload.get("workflow")
    inputs_map = payload.get("inputs", {})
    
    # [Modified] 解析输出节点列表
    output_nodes = payload.get("output_nodes", [])
    # 兼容旧字段
    if not output_nodes and payload.get("output_node_id"):
        output_nodes = [{"nodeId": str(payload.get("output_node_id"))}]
    
    # 提取所有需要监听的 Node ID 集合
    target_node_ids = set(str(n.get("nodeId")) for n in output_nodes if n.get("nodeId"))
    
    if not workflow:
        return {"status": "error", "message": "No workflow provided"}
    if not target_node_ids:
        return {"status": "error", "message": "No output nodes provided"}

    # [New] 用于收集所有节点的输出结果
    collected_results = []

    # --- 1. 预处理：智能上传与参数替换 ---
    for node_id, fields in inputs_map.items():
        if node_id not in workflow:
            logger.warning(f"Node ID {node_id} not found in workflow, skipping.")
            continue
            
        for field_name, value in fields.items():
            # 智能上传：只有当值是 Base64 图片字符串时才上传
            if isinstance(value, str) and value.startswith("data:image"):
                logger.info(f"Uploading image for Node {node_id}, Field {field_name}...")
                try:
                    filename = await upload_image(value)
                    workflow[node_id]["inputs"][field_name] = filename
                except Exception as e:
                    return {"status": "error", "message": f"Failed to upload image: {str(e)}"}
            else:
                # 普通值（文本、数字、本地文件路径）直接替换
                workflow[node_id]["inputs"][field_name] = value

    # --- 2. 连接并执行 ---
    logger.info(f"Connecting to ComfyUI: {ws_url}")
    try:
        async with websockets.connect(ws_url) as ws:
            # 发送任务
            prompt_payload = {"prompt": workflow, "client_id": client_id}
            
            async with httpx.AsyncClient(trust_env=False) as http_client:
                resp = await http_client.post(f"{settings.COMFY_URL}/prompt", json=prompt_payload)
                if resp.status_code != 200:
                    return {"status": "error", "message": f"ComfyUI Error: {resp.text}"}
                
                prompt_id = resp.json().get("prompt_id")
                logger.info(f"Task Queued: {prompt_id}")

            # --- 3. 监听并捕获指定节点的输出 ---
            while True:
                out = await ws.recv()
                if isinstance(out, str):
                    message = json.loads(out)
                    msg_type = message["type"]
                    data = message["data"]

                    if msg_type == "executed":
                        node_id = str(data.get("node"))
                        
                        # [Modified] 检查是否在目标列表中
                        if node_id in target_node_ids:
                            output_data = data.get("output", {})
                            logger.info(f"Target Node {node_id} executed. Capturing output...")
                            
                            # 情况 A: 输出是图片
                            if "images" in output_data:
                                for image in output_data["images"]:
                                    # 下载图片
                                    query = urllib.parse.urlencode({
                                        "filename": image.get("filename"),
                                        "subfolder": image.get("subfolder", ""),
                                        "type": image.get("type", "output")
                                    })
                                    img_url = f"{settings.COMFY_URL}/view?{query}"
                                    
                                    async with httpx.AsyncClient(trust_env=False) as client:
                                        img_resp = await client.get(img_url)
                                        if img_resp.status_code == 200:
                                            # [Modified] Save to storage and return URL
                                            save_result = storage.save_generated_image(img_resp.content, prefix="comfy", project_id=project_id)
                                            collected_results.append({"type": "image", "value": save_result["url"]})
                                        else:
                                            logger.error(f"Failed to download output: {img_url}")
                            
                            # 情况 B: 输出是文本
                            elif "text" in output_data:
                                for text_val in output_data["text"]:
                                    collected_results.append({"type": "text", "value": text_val})
                            
                            # 情况 C: 其他常见文本字段 (string)
                            elif "string" in output_data:
                                for text_val in output_data["string"]:
                                    collected_results.append({"type": "text", "value": text_val})
                            
                            # [Modified] 标记该节点已完成
                            target_node_ids.discard(node_id)
                            
                            # [Modified] 只有当所有目标节点都执行完毕后，才返回结果
                            if not target_node_ids:
                                return {
                                    "status": "success",
                                    "data": collected_results
                                }
                    
                    # 监听执行中断
                    elif msg_type == "execution_interrupted":
                         return {"status": "error", "message": "ComfyUI execution interrupted"}

    except Exception as e:
        logger.error(f"ComfyUI Pipeline Failed: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}
