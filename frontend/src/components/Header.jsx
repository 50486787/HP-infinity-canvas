import React, { useRef } from 'react';
import { 
  ChevronDown, Undo2, Redo2, Save, FolderOpen, Package, FileJson, ArrowLeft, HelpCircle
} from 'lucide-react';

const Header = ({ 
    fileName, setFileName, 
    onUndo, onRedo, canUndo, canRedo,
    onSaveStructure, // 存 JSON
    onPackProject,   // 存 ZIP
    onOpen,
    onBack,          // [New] 返回回调
    saveStatus,      // [New] 同步状态
    onShowHelp       // [New] 显示帮助
}) => {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) onOpen(file);
    e.target.value = '';
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-40 select-none shrink-0 relative">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".zip,.canvas,.json" className="hidden" />

      {/* Left: File Info */}
      <div className="flex items-center gap-4 w-1/3">
         <button onClick={onBack} className="text-gray-500 hover:text-blue-600 transition-colors p-1 rounded hover:bg-gray-100" title="返回首页">
             <ArrowLeft size={20} />
         </button>
         <div className="h-6 w-px bg-gray-200"></div>
         <div className="flex items-center gap-1 group border-b border-transparent hover:border-gray-300 transition-colors">
            <input 
              type="text" 
              value={fileName} 
              onChange={(e) => setFileName(e.target.value)}
              className="font-semibold text-gray-800 text-sm bg-transparent outline-none w-auto min-w-[120px]"
            />
         </div>
      </div>

      {/* Center: Undo/Redo */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-100">
          <button onClick={onUndo} disabled={!canUndo} className={`p-2 rounded-md transition-all ${!canUndo ? 'text-gray-300' : 'text-gray-500 hover:bg-white'}`}>
            <Undo2 size={18} />
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1"></div>
          <button onClick={onRedo} disabled={!canRedo} className={`p-2 rounded-md transition-all ${!canRedo ? 'text-gray-300' : 'text-gray-500 hover:bg-white'}`}>
            <Redo2 size={18} />
          </button>
      </div>
      
      {/* Right: Actions */}
      <div className="flex items-center gap-2 w-1/3 justify-end">
        <span className="text-xs text-gray-400 font-mono mr-2 select-none">
            {saveStatus === 'Synced' && '已同步'}
            {saveStatus === 'Saving' && '同步中...'}
            {saveStatus === 'Unsaved' && '等待同步...'}
            {saveStatus === 'Error' && '同步失败'}
        </span>

        <button onClick={() => fileInputRef.current.click()} className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors">
            <FolderOpen size={16} /> 打开快照
        </button>
        
        <div className="w-px h-6 bg-gray-200 mx-1"></div>

        <button onClick={onSaveStructure} className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors" title="仅保存结构 (JSON)">
            <FileJson size={16} /> 保存快照
        </button>
        
        <button onClick={onPackProject} className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 shadow-sm text-sm font-medium transition-colors" title="全量打包 (ZIP)">
            <Package size={16} /> 打包工程
        </button>

        <div className="w-px h-6 bg-gray-200 mx-1"></div>
        
        <button onClick={onShowHelp} className="p-2 text-gray-500 hover:text-blue-600 transition-colors rounded-full hover:bg-gray-100" title="帮助">
             <HelpCircle size={20} />
        </button>
      </div>
    </header>
  );
};

export default Header;