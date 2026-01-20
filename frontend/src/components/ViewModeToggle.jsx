import React from 'react';
import { Maximize, Share2 } from 'lucide-react';

// --- 新增：视图模式切换悬浮栏 ---
const ViewModeToggle = ({ viewMode, onViewModeChange }) => {
    return (
        <div className="absolute top-4 left-4 z-50 bg-white rounded-lg shadow-md border border-gray-200 p-1 flex items-center gap-1 select-none">
            <button 
                onClick={() => onViewModeChange('canvas')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    viewMode === 'canvas' 
                    ? 'bg-gray-100 text-gray-900 shadow-sm' 
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
            >
                <Maximize size={14}/> 无限画布 
            </button>
            <button 
                onClick={() => onViewModeChange('tree')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    viewMode === 'tree' 
                    ? 'bg-zinc-800 text-white shadow-sm' 
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
            >
                <Share2 size={14}/> 关系树 
            </button>
        </div>
    );
};

export default ViewModeToggle;