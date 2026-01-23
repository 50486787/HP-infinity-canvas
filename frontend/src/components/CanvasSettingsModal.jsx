import React from 'react';
import { X, Grid, Magnet, Eye } from 'lucide-react';

const CanvasSettingsModal = ({ isOpen, onClose, settings, onSettingsChange }) => {
  if (!isOpen) return null;

  const handleChange = (key, value) => {
    onSettingsChange(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-[320px] rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <Magnet size={16} className="text-blue-500"/> 画布吸附设置
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
        </div>
        
        <div className="p-4 space-y-5">
          {/* 网格吸附 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Grid size={16} className="text-gray-400"/> 网格吸附
              </label>
              <input 
                type="checkbox" 
                checked={settings.snapToGrid} 
                onChange={e => handleChange('snapToGrid', e.target.checked)}
                className="toggle-checkbox"
              />
            </div>
            {settings.snapToGrid && (
              <div className="flex items-center justify-between pl-6">
                <span className="text-xs text-gray-500">网格大小 (px)</span>
                <input 
                  type="number" 
                  min="1" max="100" 
                  value={settings.gridSize} 
                  onChange={e => handleChange('gridSize', Number(e.target.value))}
                  className="w-16 px-2 py-1 text-xs border border-gray-300 rounded text-center focus:border-blue-500 outline-none"
                />
              </div>
            )}
          </div>

          <hr className="border-gray-100"/>

          {/* 智能对齐 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Magnet size={16} className="text-gray-400"/> 智能对齐 (Smart Guides)
              </label>
              <input 
                type="checkbox" 
                checked={settings.smartGuides} 
                onChange={e => handleChange('smartGuides', e.target.checked)}
                className="toggle-checkbox"
              />
            </div>
            {settings.smartGuides && (
               <div className="flex items-center justify-between pl-6">
                <span className="text-xs text-gray-500">吸附阈值 (px)</span>
                <input 
                  type="number" 
                  min="1" max="20" 
                  value={settings.snapThreshold} 
                  onChange={e => handleChange('snapThreshold', Number(e.target.value))}
                  className="w-16 px-2 py-1 text-xs border border-gray-300 rounded text-center focus:border-blue-500 outline-none"
                />
              </div>
            )}
          </div>
          
          <hr className="border-gray-100"/>

          {/* 辅助线显示 */}
           <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Eye size={16} className="text-gray-400"/> 显示辅助线
              </label>
              <input 
                type="checkbox" 
                checked={settings.showGuides} 
                onChange={e => handleChange('showGuides', e.target.checked)}
                className="toggle-checkbox"
              />
            </div>
        </div>
      </div>
    </div>
  );
};

export default CanvasSettingsModal;
