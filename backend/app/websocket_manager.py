import json
import logging
from typing import Dict, Union, Any
from fastapi import WebSocket

# 尝试导入 WSMessage，如果没有就用 Any (防止循环导入报错)
try:
    from app.schemas import WSMessage
except ImportError:
    WSMessage = Any

logger = logging.getLogger("backend")

class ConnectionManager:
    """
    WebSocket 连接管理器 (增强版)
    负责维护活跃连接，并提供安全的消息推送方法
    """
    def __init__(self):
        # 存储活跃连接: client_id -> WebSocket
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        """建立连接"""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"✅ WebSocket connected: {client_id}. Total active: {len(self.active_connections)}")

    def disconnect(self, client_id: str):
        """断开连接"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"❌ WebSocket disconnected: {client_id}. Remaining: {len(self.active_connections)}")

    async def send_to_client(self, client_id: str, message: Union[WSMessage, Dict, str]):
        """
        向指定 client_id 发送消息
        自动处理 Pydantic 模型、字典或字符串的序列化
        """
        if client_id not in self.active_connections:
            logger.warning(f"⚠️ Client {client_id} not connected. Message dropped.")
            return

        websocket = self.active_connections[client_id]
        
        try:
            # --- 1. 统一序列化为 JSON 字符串 ---
            text_data = ""
            
            # 情况 A: 已经是字符串
            if isinstance(message, str):
                text_data = message
                
            # 情况 B: Pydantic 对象 (优先尝试 V2 写法，兼容 V1)
            elif hasattr(message, "model_dump_json"):
                text_data = message.model_dump_json()
            elif hasattr(message, "json") and callable(message.json):
                text_data = message.json()
                
            # 情况 C: 字典或其他对象 -> 转 dict 后再 dumps
            else:
                data_to_encode = message
                # 如果是 Pydantic 对象但没上面的方法，尝试转 dict
                if hasattr(message, "model_dump"):
                    data_to_encode = message.model_dump()
                elif hasattr(message, "dict"):
                    data_to_encode = message.dict()
                
                text_data = json.dumps(data_to_encode)

            # --- 2. 发送数据 ---
            # 打印日志证明我们尝试发送了 (只打印前100个字符避免日志爆炸)
            preview = text_data[:100] + "..." if len(text_data) > 100 else text_data
            logger.info(f"📤 Sending to {client_id} | Content: {preview}")
            
            await websocket.send_text(text_data)
            
        except Exception as e:
            logger.error(f"❌ Error sending to {client_id}: {e}")
            # 发送失败通常意味着连接已断开，清理之
            self.disconnect(client_id)

    async def broadcast(self, message: Union[WSMessage, Dict, str]):
        """广播消息给所有连接的客户端"""
        for client_id in list(self.active_connections.keys()):
            await self.send_to_client(client_id, message)

# 全局单例
manager = ConnectionManager()