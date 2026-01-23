"""
backend/app/dispatcher.py
任务分发器：根据任务类型将任务分发给对应的 Pipeline
"""
import logging
import asyncio
from app.pipelines import pipe_a_rembg, pipe_b_comfyui, pipe_c_api, pipe_e_photoshop
from app.websocket_manager import manager
from app.schemas import WSMessage

logger = logging.getLogger("backend.dispatcher")

async def dispatch(task, task_id: str, process_pool):
    """
    根据 task.task_type 分发任务到对应的处理管道
    """
    logger.info(f"🔄 Dispatching task {task_id} | Type: {task.task_type}")
    
    try:
        result = None
        
        # --- 分发逻辑 ---
        if task.task_type == "rembg_local":
            # 发送处理中状态
            await manager.send_to_client(
                task.client_id,
                WSMessage(
                    type="status",
                    task_id=task_id,
                    data={"message": "正在进行 RemBg 抠图处理..."}
                )
            )
            # 调用 RemBg Pipeline (在进程池中运行)
            # task.payload 是前端传来的数据，例如 {"image": "base64..."}
            result = await pipe_a_rembg.run(task.payload, process_pool)
            
        elif task.task_type == "comfy_proxy":
            # 发送处理中状态
            await manager.send_to_client(
                task.client_id,
                WSMessage(
                    type="status",
                    task_id=task_id,
                    data={"message": "正在提交 ComfyUI 任务..."}
                )
            )
            result = await pipe_b_comfyui.run(task.payload)
        
        elif task.task_type == "external_api":
            # 1. 发送一个“处理中”的状态给前端
            await manager.send_to_client(
                task.client_id,
                WSMessage(
                    type="status",
                    task_id=task_id,
                    data={"message": "AI 助手正在处理..."}
                )
            )
            # 2. 调用你已经写好的 Pipe C
            result = await pipe_c_api.run(task.payload)

        elif task.task_type == "photoshop_import":
            # 1. 发送一个“处理中”的状态给前端
            await manager.send_to_client(
                task.client_id,
                WSMessage(
                    type="status",
                    task_id=task_id,
                    data={"message": "正在与 Photoshop 同步..."}
                )
            )
            # 2. 调用 Photoshop Pipeline
            result = await pipe_e_photoshop.run(task.payload)
            
        elif task.task_type == "photoshop_export":
            # 1. 发送一个“处理中”的状态给前端
            await manager.send_to_client(
                task.client_id,
                WSMessage(
                    type="status",
                    task_id=task_id,
                    data={"message": "正在发送到 Photoshop..."}
                )
            )
            # 2. 调用 Photoshop Pipeline
            result = await pipe_e_photoshop.run(task.payload)

        elif task.task_type == "bridge_sync":
            # [新增] 处理 Bridge 同步信号
            # 这里的 task.payload 应该包含 { "project_id": "...", "assets": [...] }
            # 我们将其封装为事件，广播给所有连接的客户端 (主要是前端画布)
            await manager.broadcast(
                WSMessage(
                    type="event",
                    task_id=task_id,
                    data={
                        "event": "assets_imported",
                        "project_id": task.payload.get("project_id"),
                        "assets": task.payload.get("assets", [])
                    }
                )
            )
            result = {"status": "success", "message": "Synced to canvas"}

        else:
            raise ValueError(f"Unknown task type: {task.task_type}")

        # --- 处理结果 ---
        if result:
            if result.get("status") == "error":
                # Pipeline 返回了错误
                await _send_error(task.client_id, task_id, result.get("message"))
            else:
                # 任务成功
                logger.info(f"✅ Task {task_id} completed successfully")
                await manager.send_to_client(
                    task.client_id,
                    WSMessage(
                        type="complete",
                        task_id=task_id,
                        data=result
                    ))
        
    except Exception as e:
        logger.error(f"❌ Dispatch failed for task {task_id}: {e}", exc_info=True)
        await _send_error(task.client_id, task_id, str(e))

async def _send_error(client_id: str, task_id: str, message: str):
    """辅助函数：发送错误消息"""
    await manager.send_to_client(
        client_id,
        WSMessage(
            type="error",
            task_id=task_id,
            data={"message": message}
        ))
