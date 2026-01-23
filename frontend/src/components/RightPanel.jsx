import React, { useState, useEffect } from 'react';
import { MessageSquare, Cpu, ChevronRight, ChevronLeft } from 'lucide-react';
import RightPanelComfy from './RightPanelComfy';
import RightPanelApi from './RightPanelApi';

const RightPanel = ({ 
    workflows, activeWorkflowId, bindings = {}, 
    onSwitchWorkflow = () => {}, onClearBinding, onAddWorkflow = () => {},
    onDeleteWorkflow = () => {}, 
    onExecute, chatMessages, onNewChat,
    apiConfig, onApiConfigChange
}) => {
    const activeWorkflow = workflows.find(w => w.id === activeWorkflowId);
    
    // [Modified] 使用本地状态管理 Tab，解决无工作流时无法切换的问题
    const [tab, setTab] = useState(activeWorkflow?.type === 'api' ? 'api' : 'comfy');
    const [isCollapsed, setIsCollapsed] = useState(false);
    const isChatMode = tab === 'api';

    // 当外部 activeWorkflow 变化时，同步 Tab 状态
    useEffect(() => {
        if (activeWorkflow) {
            setTab(activeWorkflow.type === 'api' ? 'api' : 'comfy');
        }
    }, [activeWorkflow]);

    // --- 模式切换逻辑 ---
    const switchToMode = (targetMode) => {
        if (tab === targetMode) return;
        setTab(targetMode);
        
        // 尝试切换到该模式下的第一个工作流，如果没有则清空选择
        const target = workflows.find(w => targetMode === 'api' ? w.type === 'api' : w.type !== 'api');
        if (target) {
            onSwitchWorkflow(target.id);
        } else {
            onSwitchWorkflow(null);
        }
    };

    return (
        <aside className={`${isCollapsed ? 'w-0 border-none' : 'w-[360px] border-l'} bg-white border-gray-200 h-full flex flex-col font-sans z-20 shadow-xl shrink-0 transition-all duration-300 relative`}>
            
            {/* Collapse Toggle Button */}
            <button 
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -left-3 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-full p-1 shadow-md hover:bg-gray-50 z-50 text-gray-500"
                title={isCollapsed ? "展开面板" : "折叠面板"}
            >
                {isCollapsed ? <ChevronLeft size={14}/> : <ChevronRight size={14}/>}
            </button>

            <div className={`flex flex-col h-full w-[360px] ${isCollapsed ? 'hidden' : 'flex'}`}>
                {/* 0. 顶部模式切换 Tabs */}
                <div className="flex items-center p-1.5 m-2 bg-gray-100/80 rounded-lg shrink-0 gap-1">
                    <button 
                        onClick={() => switchToMode('comfy')}
                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${!isChatMode ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                    >
                        <Cpu size={14}/> ComfyUI
                    </button>
                    <button 
                        onClick={() => switchToMode('api')}
                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${isChatMode ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                    >
                        <MessageSquare size={14}/> AI 助手
                    </button>
                </div>

                {/* 内容区域 */}
                {isChatMode ? (
                    <RightPanelApi 
                        workflows={workflows}
                        activeWorkflowId={activeWorkflowId}
                        bindings={bindings}
                        onSwitchWorkflow={onSwitchWorkflow}
                        onClearBinding={onClearBinding}
                        onExecute={onExecute}
                        chatMessages={chatMessages}
                        onNewChat={onNewChat}
                        apiConfig={apiConfig}
                        onApiConfigChange={onApiConfigChange}
                    />
                ) : (
                    <RightPanelComfy 
                        workflows={workflows}
                        activeWorkflowId={activeWorkflowId}
                        bindings={bindings}
                        onSwitchWorkflow={onSwitchWorkflow}
                        onClearBinding={onClearBinding}
                        onAddWorkflow={onAddWorkflow}
                        onDeleteWorkflow={onDeleteWorkflow}
                        onExecute={onExecute}
                    />
                )}
            </div>
        </aside>
    );
};

export default RightPanel;
