// frontend/src/utils/websocket.js
// 【调试专用版】

class WebSocketClient {
  constructor() {
    this.ws = null;
    this.clientId = crypto.randomUUID(); 
    this.callbacks = new Map(); 
    this.isConnected = false;
    this.url = 'ws://localhost:8020/ws';
  }

  connect(url = 'ws://localhost:8020/ws') {
    this.url = url;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(`${url}/${this.clientId}`);

    this.ws.onopen = () => {
      console.log('✅ [WS] 连接成功 | ClientID:', this.clientId);
      this.isConnected = true;
    };

    this.ws.onmessage = (event) => {
      console.log("📩 [WS] 收到消息原始数据:", event.data);

      try {
        const msg = JSON.parse(event.data);
        const incomingId = msg.task_id;

        // --- [调试核心] 打印当前状态 ---
        console.log(`🔍 [WS] 正在核对任务 ID: ${incomingId}`);
        console.log("📋 [WS] 当前等待中的任务列表:", Array.from(this.callbacks.keys()));
        
        if (incomingId && this.callbacks.has(incomingId)) {
          const cb = this.callbacks.get(incomingId);
          
          if (msg.type === 'complete') {
            console.log("✅ [WS] 匹配成功！任务完成，正在返回数据...");
            cb.resolve(msg.data); 
            this.callbacks.delete(incomingId);
          } else if (msg.type === 'error') {
            console.error("❌ [WS] 匹配成功！但任务报错:", msg.data);
            cb.reject(msg.data);
            this.callbacks.delete(incomingId);
          } else if (msg.type === 'status') {
            console.log(`⏳ [WS] 进度更新: ${msg.data?.message}`);
          }
        } else {
            console.warn(`⚠️ [WS] 收到消息但找不到对应任务！(ID: ${incomingId}) 可能原因：超时被清理、ID不匹配、或页面刷新丢失状态`);
        }
      } catch (e) {
        console.error("❌ [WS] 解析失败:", e);
      }
    };

    this.ws.onclose = () => {
      console.log('❌ [WS] 连接断开');
      this.isConnected = false;
    };
  }

  async sendTask(taskType, payload) {
    if (!this.isConnected) {
      console.warn("[WS] 未连接，尝试重连...");
      this.connect(this.url);
      alert("连接断开，正在重连...请稍后重试");
      return;
    }

    const taskId = crypto.randomUUID();
    console.log(`📤 [WS] 正在发送任务 | 生成新 ID: ${taskId}`);

    // 构造数据
    const message = {
      task_id: taskId,     
      task_type: taskType, 
      payload: payload,    
      client_id: this.clientId
    };

    return new Promise((resolve, reject) => {
      // 1. 先记录到本子上
      this.callbacks.set(taskId, { resolve, reject });
      console.log("📝 [WS] 已将 ID 加入等待列表:", taskId);
      
      try {
          // 2. 发送出去
          this.ws.send(JSON.stringify(message));
      } catch (e) {
          this.callbacks.delete(taskId);
          reject(e);
      }

      // 3. 超时保护 (30秒)
      setTimeout(() => {
          if (this.callbacks.has(taskId)) {
              console.error(`⏰ [WS] 任务超时，放弃等待 ID: ${taskId}`);
              this.callbacks.delete(taskId);
              reject(new Error("请求超时，后端没有响应 (30s)"));
          }
      }, 30000);
    });
  }
}

export const wsClient = new WebSocketClient();