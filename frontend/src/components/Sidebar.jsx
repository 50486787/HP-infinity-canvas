import React from 'react';
import { 
  MousePointer2, LayoutGrid, Square, Circle as CircleIcon, Triangle, 
  Type, Image as ImageIcon, PenTool, Brush, Settings 
} from 'lucide-react';

const Sidebar = ({ activeTool, onToolSelect, onAddObject }) => {

  const tools = [
    { id: 'select', icon: <MousePointer2 size={20} />, label: '选择', type: 'mode' },
    { id: 'frame', icon: <LayoutGrid size={20} />, label: '画布', type: 'action' },
    { id: 'image', icon: <ImageIcon size={20} />, label: '上传', type: 'action' },
    { id: 'text', icon: <Type size={20} />, label: '文字', type: 'action' },
    { id: 'shape', icon: <Square size={20} />, label: '形状', type: 'action' },
    { id: 'spline', icon: <PenTool size={20} />, label: '钢笔', type: 'mode' },
    { id: 'draw', icon: <Brush size={20} />, label: '涂鸦', type: 'mode' },
  ];

  return (
    <aside className="h-screen w-[72px] bg-white border-r border-gray-200 flex flex-col items-center py-6 select-none z-50 shrink-0">
      <div className="flex-1 flex flex-col justify-center gap-4 w-full px-3">
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={(e) => {
              // 其他按钮，正常通知
              if (tool.type === 'mode') {
                onToolSelect(tool.id);
              } else {
                onAddObject(tool.id); 
                onToolSelect('select'); 
              }
            }}
            className={`
              group relative flex items-center justify-center w-full aspect-square rounded-xl transition-all duration-200
              ${activeTool === tool.id ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}
            `}
          >
            {tool.icon}
            <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              {tool.label}
            </span>
          </button>
        ))}
      </div>
      
      <div className="mt-auto flex flex-col gap-4 px-3 w-full">
        <button className="flex items-center justify-center w-full aspect-square rounded-xl text-gray-500 hover:bg-gray-100" title="选项">
           <Settings size={20} />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;