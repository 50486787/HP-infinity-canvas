import React from 'react';
import { X } from 'lucide-react';

const SlotItem = ({ label, icon: Icon, binding, onClear }) => (
    <div className={`flex items-center p-2 rounded-lg border transition-all text-xs ${binding ? 'bg-white border-gray-300 shadow-sm' : 'bg-gray-50 border-dashed border-gray-200'}`}>
        <div className={`w-6 h-6 rounded flex items-center justify-center mr-2 shrink-0 ${binding ? 'bg-gray-100 text-gray-700' : 'bg-transparent text-gray-300'}`}>
            <Icon size={12}/>
        </div>
        <div className="flex-1 min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
            <div className="text-[11px] font-medium text-gray-700 truncate">
                {binding ? (binding.type + (binding.text ? `: ${binding.text}`: '')) : '空'}
            </div>
        </div>
        {binding && (
            <button onClick={onClear} className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors"><X size={12}/></button>
        )}
    </div>
);

export default SlotItem;
