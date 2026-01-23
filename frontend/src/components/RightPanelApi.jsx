import React, { useState, useRef, useEffect } from 'react';
import { 
  Image as ImageIcon, Maximize, Type,
  ChevronDown, Activity, Loader, Menu,
  RotateCcw, ArrowUp, Settings, Plus, Trash2
} from 'lucide-react';
import SlotItem from './SlotItem';

const RightPanelApi = ({ 
    workflows, activeWorkflowId, bindings, 
    onSwitchWorkflow, onClearBinding, 
    onExecute, chatMessages, onNewChat,
    apiConfig, onApiConfigChange
}) => {
    const [isExecuting, setIsExecuting] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [showConfig, setShowConfig] = useState(false);
    const scrollRef = useRef(null);
    
    const activeWorkflow = workflows.find(w => w.id === activeWorkflowId);
    const visibleWorkflows = workflows.filter(w => w.type === 'api');

    // 获取当前激活的配置对象
    const activeProfile = apiConfig.profiles?.find(p => p.id === apiConfig.activeId) || {};

    // 更新当前配置的字段
    const updateActiveProfile = (field, value) => {
        onApiConfigChange(prev => ({
            ...prev,
            profiles: prev.profiles.map(p => 
                p.id === prev.activeId ? { ...p, [field]: value } : p
            )
        }));
    };

    const handleAddProfile = () => {
        const newId = Date.now().toString();
        onApiConfigChange(prev => ({
            ...prev,
            activeId: newId,
            profiles: [...prev.profiles, {
                id: newId,
                name: 'New Profile',
                model: "gemini/gemini-2.5-flash-image",
                apiKey: "",
                baseUrl: "",
                contextLimit: 10
            }]
        }));
    };

    const handleDeleteProfile = () => {
        if (apiConfig.profiles.length <= 1) {
            alert("至少保留一个配置");
            return;
        }
        if (!window.confirm("确定删除当前配置吗？")) return;
        
        onApiConfigChange(prev => {
            const newProfiles = prev.profiles.filter(p => p.id !== prev.activeId);
            return {
                ...prev,
                activeId: newProfiles[0].id,
                profiles: newProfiles
            };
        });
    };

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [chatMessages]);

    const handleAction = async () => {
        if (!inputValue.trim() && !bindings.image && !bindings.prompt) return;
        
        setIsExecuting(true);
        await onExecute(activeWorkflow?.type || 'api', inputValue);
        setInputValue("");
        setIsExecuting(false);
    };

    const handleDragStart = (e, content, type, sourceIds) => {
        e.dataTransfer.setData('content', content);
        e.dataTransfer.setData('dragType', type);
        if (sourceIds && sourceIds.length > 0) {
            e.dataTransfer.setData('sourceIds', JSON.stringify(sourceIds));
        }
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Config Section */}
            <div className="bg-white border-b border-gray-200">
                <button 
                    onClick={() => setShowConfig(!showConfig)}
                    className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <Settings size={14}/>
                        <span>模型配置 ({activeProfile.name || 'Default'})</span>
                    </div>
                    <ChevronDown size={12} className={`transition-transform ${showConfig ? 'rotate-180' : ''}`}/>
                </button>
                
                {showConfig && (
                    <div className="p-3 bg-gray-50 space-y-3 border-t border-gray-100">
                        {/* Profile Selector & Actions */}
                        <div className="flex items-center gap-2">
                            <select 
                                value={apiConfig.activeId} 
                                onChange={(e) => onApiConfigChange({...apiConfig, activeId: e.target.value})}
                                className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded bg-white focus:border-blue-500 outline-none"
                            >
                                {apiConfig.profiles.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <button onClick={handleAddProfile} className="p-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-600" title="新建配置"><Plus size={14}/></button>
                            <button onClick={handleDeleteProfile} className="p-1.5 bg-white border border-gray-300 rounded hover:bg-red-50 text-red-500" title="删除配置"><Trash2 size={14}/></button>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">配置名称 (Name)</label>
                            <input 
                                type="text" 
                                value={activeProfile.name || ''} 
                                onChange={(e) => updateActiveProfile('name', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white focus:border-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">模型 (Model)</label>
                            <input 
                                type="text" 
                                value={activeProfile.model || ''} 
                                onChange={(e) => updateActiveProfile('model', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white focus:border-blue-500 outline-none"
                                placeholder="gemini/gemini-1.5-flash"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">API Key</label>
                            <input 
                                type="password" 
                                value={activeProfile.apiKey || ''} 
                                onChange={(e) => updateActiveProfile('apiKey', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white focus:border-blue-500 outline-none"
                                placeholder="sk-..."
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">API Base URL (可选)</label>
                            <input 
                                type="text" 
                                value={activeProfile.baseUrl || ''} 
                                onChange={(e) => updateActiveProfile('baseUrl', e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white focus:border-blue-500 outline-none"
                                placeholder="https://api.openai.com/v1"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">上下文数量 (History Limit)</label>
                            <input 
                                type="number" 
                                value={activeProfile.contextLimit || 10} 
                                onChange={(e) => updateActiveProfile('contextLimit', parseInt(e.target.value))}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* 1. 聊天区域 */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
                <div className="absolute top-3 right-3 z-10">
                    <button onClick={onNewChat} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm text-[10px] text-gray-600 hover:bg-gray-50 hover:text-red-500 transition-colors" title="清空并新建对话">
                        <RotateCcw size={10}/> 新对话
                    </button>
                </div>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                    {chatMessages.length === 0 && (
                        <div className="text-center mt-8 space-y-3">
                            <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mx-auto border border-gray-100"><Activity size={16} className="text-gray-300"/></div>
                            <div className="text-xs text-gray-400 leading-relaxed px-4">绑定下方素材，输入指令开始对话</div>
                        </div>
                    )}
                    {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[95%] rounded-lg px-3 py-3 text-sm border shadow-sm ${msg.role === 'user' ? 'bg-white border-gray-200 text-gray-800' : 'bg-gray-50 border-gray-100 text-gray-600'}`}>
                                {msg.type === 'card' ? (
                                    <div className="flex flex-col gap-2">
                                        {msg.image && (
                                            <div className="rounded-lg overflow-hidden bg-gray-50 border border-gray-200 mb-1">
                                                <img src={msg.image} alt="context" className={`w-full h-auto block ${msg.role === 'assistant' ? 'cursor-grab active:cursor-grabbing' : ''}`} style={{ maxHeight: '300px', objectFit: 'contain' }} draggable={msg.role === 'assistant'} onDragStart={(e) => handleDragStart(e, msg.image, 'chatImage', msg.sourceIds)} />
                                            </div>
                                        )}
                                        {msg.text && (
                                            <div className={`text-xs leading-relaxed break-words relative group ${msg.role === 'assistant' ? 'cursor-grab active:cursor-grabbing' : ''}`} draggable={msg.role === 'assistant'} onDragStart={(e) => handleDragStart(e, msg.text, 'chatText', msg.sourceIds)}>
                                                {msg.text}
                                                {msg.role === 'assistant' && <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"><Menu size={10} className="text-gray-400"/></div>}
                                            </div>
                                        )}
                                    </div>
                                ) : ( <span className="leading-snug">{msg.content}</span> )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 分隔线 */}
            <div className="h-px bg-gray-100 w-full shrink-0"></div>

            {/* 2. 工作流选择器 */}
            <div className="h-10 flex items-center px-3 bg-white shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Activity size={14} className="text-gray-400"/>
                    <div className="relative flex-1 group">
                        <select value={activeWorkflowId} onChange={(e) => onSwitchWorkflow(e.target.value)} className="w-full bg-transparent font-medium text-xs text-gray-700 outline-none appearance-none cursor-pointer pr-4">
                            {visibleWorkflows.map(w => ( <option key={w.id} value={w.id}>{w.name}</option>))}
                        </select>
                        <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none"/>
                    </div>
                </div>
            </div>

             {/* 分隔线 */}
             <div className="h-px bg-gray-100 w-full shrink-0"></div>

            {/* 3. 插槽区域 */}
            <div className="p-3 bg-gray-50/50 space-y-1.5 shrink-0">
                <SlotItem label="图像 (Image)" icon={ImageIcon} binding={bindings.image} onClear={() => onClearBinding('image')} />
                <SlotItem label="遮罩 (Mask)" icon={Maximize} binding={bindings.mask} onClear={() => onClearBinding('mask')} />
                <SlotItem label="提示词 (Prompt)" icon={Type} binding={bindings.prompt} onClear={() => onClearBinding('prompt')} />
            </div>

            {/* 4. 输入区域 */}
            <div className="p-3 border-t border-gray-200 bg-white shrink-0">
                <div className="flex flex-col gap-2">
                     <div className="relative">
                        <textarea value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAction(); } }} placeholder="输入指令..." className="w-full bg-white border border-gray-200 rounded-lg py-2 px-3 text-xs focus:ring-1 focus:ring-gray-300 focus:border-gray-300 outline-none resize-none min-h-[60px]" />
                    </div>
                    <button onClick={handleAction} disabled={isExecuting || (!inputValue.trim() && !bindings.image)} className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm border ${!inputValue.trim() && !bindings.image ? 'bg-gray-50 text-gray-300 border-gray-100' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 active:scale-95'}`}>
                        {isExecuting ? <Loader size={14} className="animate-spin"/> : <ArrowUp size={14}/>}
                        <span>发送指令</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RightPanelApi;
