import { useState, useEffect, useCallback } from 'react';

// 默认工作流数据
const DEFAULT_WORKFLOWS = [
    { 
        id: '1', 
        name: 'ComfyUI 基础文生图', 
        type: 'comfy', 
        json: '', 
        mappings: [] 
    },
    { 
        id: 'api_default', 
        type: 'api', 
        name: 'AI 助手', 
        description: '通用对话助手' 
    }
];

export const useWorkflowSystem = () => {
    // 1. 工作流列表：优先从 localStorage 读取
    const [workflows, setWorkflows] = useState(() => {
        try {
            const saved = localStorage.getItem('lovart_workflows');
            return saved ? JSON.parse(saved) : DEFAULT_WORKFLOWS;
        } catch (e) {
            console.error("读取工作流缓存失败", e);
            return DEFAULT_WORKFLOWS;
        }
    });

    // 2. 当前选中 ID
    const [activeWorkflowId, setActiveWorkflowId] = useState(() => {
        const savedId = localStorage.getItem('lovart_active_workflow_id');
        return savedId || DEFAULT_WORKFLOWS[0].id;
    });

    // 3. 聊天记录
    const [chatMessages, setChatMessages] = useState(() => {
        try {
            const saved = localStorage.getItem('lovart_chat_messages');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

    // 4. 绑定状态 (全局 Map: workflowId -> { image, mask, prompt })
    // App.jsx 和 CanvasBoard 需要 setAllBindings 来更新特定工作流的绑定
    const [allBindings, setAllBindings] = useState({});

    // 计算属性：当前选中工作流的绑定 (供 App.jsx 使用)
    const currentBindings = allBindings[activeWorkflowId] || { image: null, mask: null, prompt: null };

    // 5. 会话上下文 (用于 API 助手)
    const [activeSessionSources, setActiveSessionSources] = useState([]);

    // --- 持久化副作用 ---
    useEffect(() => {
        localStorage.setItem('lovart_workflows', JSON.stringify(workflows));
    }, [workflows]);

    useEffect(() => {
        localStorage.setItem('lovart_active_workflow_id', activeWorkflowId);
    }, [activeWorkflowId]);

    useEffect(() => {
        localStorage.setItem('lovart_chat_messages', JSON.stringify(chatMessages));
    }, [chatMessages]);

    // --- Actions ---

    // 切换工作流
    const onSwitchWorkflow = useCallback((id) => {
        setActiveWorkflowId(id);
    }, []);

    // 清除绑定
    const handleClearBinding = useCallback((key) => {
        setAllBindings(prev => ({
            ...prev,
            [activeWorkflowId]: {
                ...prev[activeWorkflowId],
                [key]: null
            }
        }));
    }, [activeWorkflowId]);

    // 新建聊天
    const handleNewChat = useCallback(() => {
        setChatMessages([]);
        setActiveSessionSources([]);
    }, []);

    // 删除工作流
    const handleDeleteWorkflow = useCallback((id) => {
        setWorkflows(prev => {
            const newWorkflows = prev.filter(w => w.id !== id);
            return newWorkflows;
        });
        // 如果删除的是当前选中的，重置选中状态
        if (activeWorkflowId === id) {
            setActiveWorkflowId(null);
        }
    }, [activeWorkflowId]);

    // [New] 复制工作流
    const handleDuplicateWorkflow = useCallback((id) => {
        setWorkflows(prev => {
            const source = prev.find(w => w.id === id);
            if (!source) return prev;
            
            const newWorkflow = {
                ...source,
                id: Date.now().toString(),
                name: `${source.name} (副本)`
            };
            return [...prev, newWorkflow];
        });
    }, []);

    // 上传图片 (连接后端)
    const uploadImage = useCallback(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            // 假设后端运行在 8020 端口
            const res = await fetch('http://localhost:8020/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.status === 'success') {
                return data.file.url;
            }
        } catch (e) {
            console.error("Upload failed, falling back to local blob", e);
        }
        // 降级方案：使用本地 Blob URL
        return URL.createObjectURL(file);
    }, []);

    // 模拟去底任务
    const runRemBgTask = useCallback(async (url) => {
        return url; 
    }, []);

    return {
        // 状态
        workflows,
        activeWorkflowId,
        currentBindings,     // [Fix] 导出计算后的当前绑定
        chatMessages,
        activeSessionSources,

        // Setters (供 App.jsx 直接使用)
        setWorkflows,        // [Fix] 必须导出，App.jsx 的 handleAddWorkflow 依赖它
        setActiveWorkflowId,
        setAllBindings,      // [Fix] 必须导出，CanvasBoard 依赖它
        setChatMessages,
        setActiveSessionSources,

        // 封装好的 Actions
        onSwitchWorkflow,
        handleClearBinding,
        handleNewChat,
        handleDeleteWorkflow,
        handleDuplicateWorkflow, // [New] 导出复制功能
        uploadImage,
        runRemBgTask
    };
};
