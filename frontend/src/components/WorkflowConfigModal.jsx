import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Save, Settings, Layers, Zap, Upload, FileJson, Monitor } from 'lucide-react';

/**
 * WorkflowConfigModal
 * 用于新增/编辑 ComfyUI 工作流配置
 * 核心功能：建立前端输入参数(Slots)与 ComfyUI 节点(Node ID)的映射关系
 */
const WorkflowConfigModal = ({ isOpen, onClose, onSave, initialData = null }) => {
  // --- 基础信息 State ---
  const [name, setName] = useState('');
  const [workflowJson, setWorkflowJson] = useState('');
  const [jsonFilename, setJsonFilename] = useState(''); // 新增：记录文件名
  const fileInputRef = useRef(null);

  // --- 输出节点 State (改为数组) ---
  const [outputNodes, setOutputNodes] = useState([]); 

  // --- 映射配置 State ---
  // 1. 固定插槽 (Fixed Slots) - 界面常驻，Key 不可变
  const [fixedSlots, setFixedSlots] = useState({
    image: { nodeId: '', fieldName: 'image' }, 
    mask: { nodeId: '', fieldName: 'image' },       
    prompt: { nodeId: '', fieldName: 'value' }      
  });

  // 2. 自定义插槽 (Custom Slots) - 动态数组
  const [customSlots, setCustomSlots] = useState([]);

  // --- 初始化/重置 ---
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // 编辑模式：回填数据
        setName(initialData.name || '');
        setWorkflowJson(initialData.json || '');
        setJsonFilename(initialData.jsonFilename || ''); // 回填文件名
        
        // [Modified] 初始化输出节点列表
        if (initialData.outputNodes && Array.isArray(initialData.outputNodes)) {
            setOutputNodes(initialData.outputNodes.map((n, i) => ({
                id: Date.now() + i, // 临时 ID
                name: n.name || '',
                nodeId: n.nodeId || ''
            })));
        } else if (initialData.outputNodeId) {
            // 兼容旧数据
            setOutputNodes([{ id: Date.now(), name: 'Output', nodeId: initialData.outputNodeId || '' }]);
        } else {
            setOutputNodes([]);
        }
        
        // 解析 mappings 回填到 fixed 和 custom
        const initialFixed = { 
            image: { nodeId: '', fieldName: 'image' }, 
            mask: { nodeId: '', fieldName: 'image' }, 
            prompt: { nodeId: '', fieldName: 'value' } 
        };
        const initialCustom = [];

        (initialData.mappings || []).forEach(m => {
          // [Fix] 兼容旧数据：将 base_image 映射为 image
          const slotName = m.slot_name === 'base_image' ? 'image' : m.slot_name;

          if (['image', 'mask', 'prompt'].includes(slotName)) {
            const defaultField = initialFixed[slotName].fieldName;
            initialFixed[slotName] = { nodeId: m.node_id || '', fieldName: m.field_name || defaultField };
          } else {
            initialCustom.push({
              id: Date.now() + Math.random(), // 临时唯一ID用于React Key
              name: m.slot_name,
              nodeId: m.node_id || '',
              fieldName: m.field_name || ''
            });
          }
        });
        setFixedSlots(initialFixed);
        setCustomSlots(initialCustom);
      } else {
        // 新增模式：清空
        setName('');
        setWorkflowJson('');
        setJsonFilename('');
        setOutputNodes([{ id: Date.now(), name: 'Output', nodeId: '' }]); // 默认给一个空行
        setFixedSlots({ 
            image: { nodeId: '', fieldName: 'image' }, 
            mask: { nodeId: '', fieldName: 'image' }, 
            prompt: { nodeId: '', fieldName: 'value' } 
        });
        setCustomSlots([]);
      }
    }
  }, [isOpen, initialData]);

  // --- 处理函数 ---
  
  // 文件选择处理
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setJsonFilename(file.name);
    // 如果名称为空，自动填入文件名
    if (!name) setName(file.name.replace(/\.json$/i, ''));

    const reader = new FileReader();
    reader.onload = (ev) => {
      setWorkflowJson(ev.target.result);
    };
    reader.readAsText(file);
  };

  // 输出节点操作
  const addOutputNode = () => {
    setOutputNodes([...outputNodes, { id: Date.now(), name: '', nodeId: '' }]);
  };
  const removeOutputNode = (id) => {
    setOutputNodes(outputNodes.filter(n => n.id !== id));
  };
  const updateOutputNode = (id, field, value) => {
    setOutputNodes(outputNodes.map(n => n.id === id ? { ...n, [field]: value } : n));
  };

  // 固定插槽变更
  const handleFixedChange = (key, field, value) => {
    setFixedSlots(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  // 自定义插槽变更
  const addCustomSlot = () => {
    setCustomSlots([...customSlots, { id: Date.now(), name: '', nodeId: '' }]);
  };

  const removeCustomSlot = (id) => {
    setCustomSlots(customSlots.filter(slot => slot.id !== id));
  };

  const updateCustomSlot = (id, field, value) => {
    setCustomSlots(customSlots.map(slot => 
      slot.id === id ? { ...slot, [field]: value } : slot
    ));
  };

  // 保存
  const handleSave = () => {
    // 1. 收集固定插槽 (只收集已填写的)
    const mappings = [];
    Object.entries(fixedSlots).forEach(([key, data]) => {
      if (data.nodeId && data.nodeId.trim() !== '') {
        mappings.push({ slot_name: key, node_id: data.nodeId.trim(), field_name: data.fieldName.trim() });
      }
    });

    // 2. 收集自定义插槽
    customSlots.forEach(slot => {
      if (slot.name && slot.nodeId) {
        mappings.push({ slot_name: slot.name.trim(), node_id: slot.nodeId.trim(), field_name: slot.fieldName.trim() });
      }
    });

    // 3. 收集输出节点
    const validOutputNodes = outputNodes
        .filter(n => n.nodeId && n.nodeId.trim() !== '')
        .map(n => ({ name: n.name.trim(), nodeId: n.nodeId.trim() }));

    // 3. 构造最终对象
    const workflowData = {
      ...(initialData || {}), // [Fix] 保留原对象其他字段 (防止丢失未在此处编辑的属性)
      id: initialData?.id || Date.now().toString(), // 如果是新增则生成ID
      type: 'comfy', // [Critical] 强制指定类型为 comfy，防止被识别为 api 助手
      name,
      json: workflowJson,
      jsonFilename, // 保存文件名以便下次显示
      outputNodes: validOutputNodes, // 新字段
      outputNodeId: validOutputNodes.length > 0 ? validOutputNodes[0].nodeId : '', // 兼容字段：取第一个
      mappings
    };

    onSave(workflowData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-[800px] max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            <Settings className="text-blue-600" size={20} />
            <h2 className="text-lg font-semibold text-gray-800">
              {initialData ? '编辑工作流配置' : '新增工作流配置'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* 1. 基础信息 */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">工作流名称</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例如：SDXL 风格化重绘"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">工作流文件 (.json)</label>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => fileInputRef.current.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <Upload size={16} />
                  {jsonFilename ? '重新选择文件' : '选择工作流文件'}
                </button>
                {jsonFilename && <span className="text-sm text-gray-600 flex items-center gap-1"><FileJson size={14}/> {jsonFilename}</span>}
                {!jsonFilename && !workflowJson && <span className="text-xs text-gray-400">请上传 ComfyUI 导出的 API 格式 JSON</span>}
              </div>
              {/* 隐藏的 Textarea 用于调试或确认已加载内容，实际使用中用户不需要看 */}
              {workflowJson && <div className="mt-2 text-[10px] text-gray-400 truncate font-mono">已加载: {workflowJson.substring(0, 60)}...</div>}
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* 2. 输入映射 (Mappings) */}
          <div>
            <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Layers size={18} className="text-purple-500"/> 输入映射 (Input Mappings)
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              将前端的参数（如提示词、图片）映射到 ComfyUI 工作流中具体的节点 ID。
            </p>

            {/* 固定插槽区 */}
            <div className="bg-blue-50/50 rounded-lg p-4 border border-blue-100 mb-4">
              <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">固定插槽 (Fixed Slots)</h4>
              <div className="space-y-3">
                {/* Base Image */}
                <div className="flex items-center gap-4">
                  <div className="w-32 text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Zap size={14} className="text-orange-500"/> 底图 (Image)
                  </div>
                  <div className="flex-1 flex gap-2">
                  <input 
                    type="text" 
                    value={fixedSlots.image.nodeId}
                    onChange={e => handleFixedChange('image', 'nodeId', e.target.value)}
                    placeholder="节点 ID (例如 10)"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded bg-white focus:border-blue-500 outline-none text-sm min-w-0"
                  />
                  <input 
                    type="text" 
                    value={fixedSlots.image.fieldName}
                    onChange={e => handleFixedChange('image', 'fieldName', e.target.value)}
                    placeholder="字段名 (如 image)"
                    className="w-24 px-3 py-1.5 border border-gray-300 rounded bg-white focus:border-blue-500 outline-none text-sm"
                  />
                  </div>
                  <div className="w-8"></div>
                </div>

                {/* Mask */}
                <div className="flex items-center gap-4">
                  <div className="w-32 text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Layers size={14} className="text-gray-500"/> 蒙版 (Mask)
                  </div>
                  <div className="flex-1 flex gap-2">
                  <input 
                    type="text" 
                    value={fixedSlots.mask.nodeId}
                    onChange={e => handleFixedChange('mask', 'nodeId', e.target.value)}
                    placeholder="节点 ID (可选)"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded bg-white focus:border-blue-500 outline-none text-sm min-w-0"
                  />
                  <input 
                    type="text" 
                    value={fixedSlots.mask.fieldName}
                    onChange={e => handleFixedChange('mask', 'fieldName', e.target.value)}
                    placeholder="字段名 (如 image)"
                    className="w-24 px-3 py-1.5 border border-gray-300 rounded bg-white focus:border-blue-500 outline-none text-sm"
                  />
                  </div>
                  <div className="w-8"></div>
                </div>

                {/* Prompt */}
                <div className="flex items-center gap-4">
                  <div className="w-32 text-sm font-medium text-gray-700 flex items-center gap-2">
                    <span className="text-green-600 font-bold text-xs">T</span> 提示词 (Prompt)
                  </div>
                  <div className="flex-1 flex gap-2">
                  <input 
                    type="text" 
                    value={fixedSlots.prompt.nodeId}
                    onChange={e => handleFixedChange('prompt', 'nodeId', e.target.value)}
                    placeholder="节点 ID (例如 6)"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded bg-white focus:border-blue-500 outline-none text-sm min-w-0"
                  />
                  <input 
                    type="text" 
                    value={fixedSlots.prompt.fieldName}
                    onChange={e => handleFixedChange('prompt', 'fieldName', e.target.value)}
                    placeholder="字段名 (如 value)"
                    className="w-24 px-3 py-1.5 border border-gray-300 rounded bg-white focus:border-blue-500 outline-none text-sm"
                  />
                  </div>
                  <div className="w-8"></div>
                </div>
              </div>
            </div>

            {/* 自定义插槽区 */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">自定义插槽 (Custom Slots)</h4>
              
              <div className="space-y-2">
                {customSlots.map((slot) => (
                  <div key={slot.id} className="flex items-center gap-4 group">
                    <div className="w-32">
                      <input 
                        type="text" 
                        value={slot.name}
                        onChange={e => updateCustomSlot(slot.id, 'name', e.target.value)}
                        placeholder="参数名 (如 steps)"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:border-purple-500 outline-none"
                      />
                    </div>
                    <div className="flex-1 flex gap-2">
                    <input 
                      type="text" 
                      value={slot.nodeId}
                      onChange={e => updateCustomSlot(slot.id, 'nodeId', e.target.value)}
                      placeholder="节点 ID"
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded bg-white focus:border-purple-500 outline-none text-sm min-w-0"
                    />
                    <input 
                      type="text" 
                      value={slot.fieldName}
                      onChange={e => updateCustomSlot(slot.id, 'fieldName', e.target.value)}
                      placeholder="字段名"
                      className="w-24 px-3 py-1.5 border border-gray-300 rounded bg-white focus:border-purple-500 outline-none text-sm"
                    />
                    </div>
                    <button 
                      onClick={() => removeCustomSlot(slot.id)}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <button 
                onClick={addCustomSlot}
                className="mt-4 flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700 font-medium px-2 py-1 rounded hover:bg-purple-50 transition-colors"
              >
                <Plus size={16} /> 添加自定义输入项
              </button>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* 3. 输出节点配置区 (Moved Here) */}
          <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Monitor size={16} className="text-gray-500"/> 输出节点 (Output Nodes)
              </label>
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-2">
                {outputNodes.map((node, index) => (
                  <div key={node.id} className="flex items-center gap-3">
                      <div className="w-32">
                          <input 
                              type="text" 
                              value={node.name}
                              onChange={e => updateOutputNode(node.id, 'name', e.target.value)}
                              placeholder="名称 (如 result)"
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:border-blue-500 outline-none"
                          />
                      </div>
                      <input 
                          type="text" 
                          value={node.nodeId}
                          onChange={e => updateOutputNode(node.id, 'nodeId', e.target.value)}
                          placeholder="节点 ID (如 9)"
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded bg-white focus:border-blue-500 outline-none text-sm"
                      />
                      <button 
                          onClick={() => removeOutputNode(node.id)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          disabled={outputNodes.length === 1 && index === 0} // 至少保留一个
                      >
                          <Trash2 size={16} />
                      </button>
                  </div>
                ))}
                <button 
                  onClick={addOutputNode}
                  className="mt-2 flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                >
                  <Plus size={14} /> 添加输出节点
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">后端将监听这些节点的输出结果。</p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            取消
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm flex items-center gap-2 transition-colors"
          >
            <Save size={16} /> 保存配置
          </button>
        </div>

      </div>
    </div>
  );
};

export default WorkflowConfigModal;
