import React, { useState } from 'react';
import { 
  Image as ImageIcon, Maximize, Type,
  ChevronDown, Plus, Activity, Loader,
  Play, Settings, Trash2, Download, Box
} from 'lucide-react';
import WorkflowConfigModal from './WorkflowConfigModal';
import SlotItem from './SlotItem';

const RightPanelComfy = ({ 
    workflows, activeWorkflowId, bindings, 
    onSwitchWorkflow = () => {}, onClearBinding, onAddWorkflow = () => {}, 
    onDeleteWorkflow = () => {}, 
    onExecute
}) => {
    const [isExecuting, setIsExecuting] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalInitialData, setModalInitialData] = useState(null);

    const activeWorkflow = workflows.find(w => w.id === activeWorkflowId);
    const visibleWorkflows = workflows.filter(w => w.type !== 'api');

    const handleAddClick = () => {
        setModalInitialData(null); // 新增模式
        setIsModalOpen(true);
    };

    const handleEditClick = () => {
        if (activeWorkflow) {
            setModalInitialData(activeWorkflow); // 编辑模式
            setIsModalOpen(true);
        }
    };

    const handleAction = async () => {
        setIsExecuting(true);
        await onExecute(activeWorkflow?.type || 'comfy');
        setIsExecuting(false);
    };

    // [New] 导出工作流
    const handleExportClick = () => {
        if (!activeWorkflow) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeWorkflow, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", (activeWorkflow.name || "workflow") + ".json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    // [New] 删除工作流
    const handleDeleteClick = () => {
        if (!activeWorkflow) return;
        if (window.confirm(`确定要删除工作流 "${activeWorkflow.name}" 吗？`)) {
            onDeleteWorkflow(activeWorkflow.id);
        }
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* 1. 说明区域 */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
                <div className="flex-1 p-5 space-y-4 text-sm text-gray-600 leading-relaxed font-normal bg-gray-50/50">
                    <p>当前处于 <strong className="font-bold text-gray-800">配置模式</strong>。</p>
                    <p>右键点击画布上的对象，可以将它们绑定到下方的插槽中作为输入。</p>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-gray-500">
                        <li><strong>画框 (Frame):</strong> 右键可 <span className="font-semibold text-gray-600">合成图片</span> 或 <span className="font-semibold text-gray-600">生成遮罩</span>。</li>
                        <li><strong>图片/形状:</strong> 右键可设为 <span className="font-semibold text-gray-600">底图</span> 或 <span className="font-semibold text-gray-600">遮罩</span>。</li>
                        <li><strong>文字:</strong> 右键可设为 <span className="font-semibold text-gray-600">提示词</span>。</li>
                    </ul>
                    <p>绑定完成后，点击下方的 "运行工作流" 按钮执行操作。</p>
                 </div>
            </div>

            {/* 分隔线 */}
            <div className="h-px bg-gray-100 w-full shrink-0"></div>

            {/* 2. 工作流选择器 */}
            <div className="h-10 flex items-center px-3 bg-white shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Activity size={14} className="text-gray-400"/>
                    <div className="relative flex-1 group">
                        <select value={activeWorkflowId || ""} onChange={(e) => onSwitchWorkflow(e.target.value)} className="w-full bg-transparent font-medium text-xs text-gray-700 outline-none appearance-none cursor-pointer pr-4">
                            {visibleWorkflows.map(w => ( <option key={w.id} value={w.id}>{w.name}</option>))}
                        </select>
                        <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none"/>
                    </div>
                </div>
                <button onClick={handleExportClick} className="ml-1 text-gray-300 hover:text-gray-600 transition-colors" title="导出配置 (JSON)" disabled={!activeWorkflow}><Download size={14}/></button>
                <button onClick={handleEditClick} className="ml-1 text-gray-300 hover:text-gray-600 transition-colors" title="配置当前工作流" disabled={!activeWorkflow}><Settings size={14}/></button>
                <button onClick={handleDeleteClick} className="ml-1 text-gray-300 hover:text-red-500 transition-colors" title="删除当前工作流" disabled={!activeWorkflow}><Trash2 size={14}/></button>
                <button onClick={handleAddClick} className="ml-2 text-gray-300 hover:text-gray-600 transition-colors" title="新增工作流"><Plus size={14}/></button>
            </div>

             {/* 分隔线 */}
             <div className="h-px bg-gray-100 w-full shrink-0"></div>

            {/* 3. 插槽区域 */}
            <div className="p-3 bg-gray-50/50 space-y-1.5 shrink-0">
                {activeWorkflow?.mappings && activeWorkflow.mappings.length > 0 ? (
                    activeWorkflow.mappings.map(m => {
                        const name = m.slot_name;
                        let label = name;
                        let Icon = Box; // 默认图标
                        
                        if (name === 'image') { label = '图像 (Image)'; Icon = ImageIcon; }
                        else if (name === 'mask') { label = '遮罩 (Mask)'; Icon = Maximize; }
                        else if (name === 'prompt') { label = '提示词 (Prompt)'; Icon = Type; }
                        
                        return <SlotItem key={name} label={label} icon={Icon} binding={bindings[name]} onClear={() => onClearBinding(name)} />;
                    })
                ) : (
                    <>
                        <SlotItem label="图像 (Image)" icon={ImageIcon} binding={bindings.image} onClear={() => onClearBinding('image')} />
                        <SlotItem label="遮罩 (Mask)" icon={Maximize} binding={bindings.mask} onClear={() => onClearBinding('mask')} />
                        <SlotItem label="提示词 (Prompt)" icon={Type} binding={bindings.prompt} onClear={() => onClearBinding('prompt')} />
                    </>
                )}
            </div>

            {/* 4. 运行区域 */}
            <div className="p-3 border-t border-gray-200 bg-white shrink-0">
                <button onClick={handleAction} disabled={isExecuting || (!bindings.image && !bindings.prompt)} className={`w-full py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm border ${isExecuting || (!bindings.image && !bindings.prompt) ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50 active:scale-95'}`}>
                    {isExecuting ? <><Loader size={14} className="animate-spin"/> 处理中...</> : <><Play size={14} fill="currentColor"/> 运行工作流</>}
                </button>
            </div>
            
            {/* 配置弹窗 */}
            <WorkflowConfigModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onSave={(data) => { onAddWorkflow(data); setIsModalOpen(false); }} 
                initialData={modalInitialData}
            />
        </div>
    );
};

export default RightPanelComfy;
