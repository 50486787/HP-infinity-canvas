import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Editor from './pages/Editor';
import { wsClient } from './utils/websocket';

function App() {
  // 初始化 WebSocket 连接并设置全局监听
  useEffect(() => {
    // 1. 启动连接 (这是最关键的一步！)
    wsClient.connect();

    // 2. 添加全局监听器
    const unsubscribe = wsClient.addListener((data) => {
      // 监听 Bridge 发来的 "assets_imported" 事件
      if (data.event === 'assets_imported') {
        console.log("📢 [App] 收到 Bridge 导入的图片:", data.assets);
        // 注意：为了让画布更新，你通常需要在 Editor.jsx 里也写类似的监听逻辑来更新 state
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/project/:projectId" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;