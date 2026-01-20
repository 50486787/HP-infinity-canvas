import React, { useState, useEffect } from 'react';
import { 
  Move, LayoutGrid, ChevronDown, Check, BoxSelect, CircleDashed, Sparkles, 
  Lock, Unlock, Square, Circle as CircleIcon, Triangle, Bold, AlignLeft, 
  AlignCenter, AlignRight, Scissors, Trash2,
  Crop, Maximize, RotateCcw, Loader2 // [FIXED] 引入 Loader2
} from 'lucide-react';

// 通用按钮样式常量
const BTN_TOOL_CLASS = "relative flex items-center gap-1.5 px-2 py-1.5 hover:bg-gray-100 rounded-md text-gray-700 text-xs font-medium transition-colors";

// [Refactor] 将子组件提取到外部，防止父组件重渲染时导致 input 失去焦点/重置
const ColorPicker = ({ type = 'fill', selectedObject, onUpdateObject, isGlobalLocked }) => (
    <div className="relative flex items-center group w-4 h-4 mr-1" title={type === 'fill' ? "填充颜色" : "边框颜色"}>
        {type === 'fill' ? (
           <div className="w-4 h-4 rounded-full border border-gray-300 shadow-sm cursor-pointer" style={{ backgroundColor: selectedObject.fill || 'transparent', backgroundImage: selectedObject.fill === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)' : 'none', backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px' }}></div>
        ) : (
           <div 
             className="w-4 h-4 rounded-sm border-2 cursor-pointer shadow-sm box-border" 
             style={{ 
                borderColor: (!selectedObject.stroke || selectedObject.stroke === 'transparent') ? '#d1d5db' : selectedObject.stroke,
                borderStyle: (!selectedObject.stroke || selectedObject.stroke === 'transparent') ? 'dashed' : 'solid'
             }}
           ></div>
        )}
        <input 
            type="color" 
            value={!selectedObject[type] || selectedObject[type] === 'transparent' ? '#000000' : selectedObject[type]} 
            onChange={(e) => onUpdateObject({ ...selectedObject, [type]: e.target.value })}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isGlobalLocked}
        />
    </div>
);

const StrokeWidthInput = ({ selectedObject, onUpdateObject, isGlobalLocked }) => (
    <div className="flex items-center gap-1 bg-gray-50 rounded px-1 w-16 mr-2" title="边框粗细/画笔大小">
        <BoxSelect size={10} className="text-gray-400 shrink-0"/>
        <input 
            type="number" min="1" max="500"
            value={selectedObject.strokeWidth || 0}
            onChange={(e) => onUpdateObject({ ...selectedObject, strokeWidth: Number(e.target.value) })}
            className="w-full bg-transparent text-xs text-center focus:outline-none"
            disabled={isGlobalLocked}
        />
    </div>
);

const OpacitySlider = ({ selectedObject, onUpdateObject, isGlobalLocked }) => (
    <div className="flex items-center gap-1 w-14 group relative" title="透明度 (5档调节)">
        <CircleDashed size={12} className="text-gray-400"/>
        <input 
          type="range" min="0" max="1" step="0.25"
          value={selectedObject.opacity ?? 1}
          onChange={(e) => onUpdateObject({ ...selectedObject, opacity: Number(e.target.value) }, true)}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={() => onUpdateObject({ ...selectedObject })}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={() => onUpdateObject({ ...selectedObject })}
          onPointerDown={(e) => e.stopPropagation()} 
          className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-black relative z-50"
          disabled={isGlobalLocked}
        />
    </div>
);

const BlurSlider = ({ selectedObject, onUpdateObject, isGlobalLocked }) => (
    <div className="flex items-center gap-1 w-14 group relative" title="边缘模糊">
        <Sparkles size={12} className="text-gray-400"/>
        <input 
          type="range" min="0" max="20" step="1"
          value={selectedObject.blur ?? 0}
          onChange={(e) => onUpdateObject({ ...selectedObject, blur: Number(e.target.value) }, true)}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={() => onUpdateObject({ ...selectedObject })}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={() => onUpdateObject({ ...selectedObject })}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-black relative z-50"
          disabled={isGlobalLocked}
        />
    </div>
);

const FloatingToolbar = ({ 
    selectedObject, zoom, offset, onAction, onUpdateObject, 
    isCropping, isGlobalSettings,
    resizeMode, onToggleResizeMode, 
    isProcessing // [FIXED] 新增 Prop: 接收外部传入的处理状态
}) => {
  const [showRatioMenu, setShowRatioMenu] = useState(false);

  // 每次选中对象变化时，确保菜单关闭
  useEffect(() => {
    setShowRatioMenu(false);
  }, [selectedObject?.id]);

  // [FIXED] 重置功能：恢复图片原始比例，但保持当前位置和宽度
  const handleReset = () => {
      if (!selectedObject) return;
      const natW = selectedObject.naturalWidth || 100;
      const natH = selectedObject.naturalHeight || 100;
      const currentW = selectedObject.width;
      
      // 1. 计算恢复比例后的高度
      const newH = currentW * (natH / natW);
      
      onUpdateObject({
          ...selectedObject,
          height: newH,
          // 2. 重置内容为 Cover/Fill 状态
          contentWidth: null, // 或设为 currentW
          contentHeight: null, // 或设为 newH
          contentX: 0,
          contentY: 0
      });
  };

  if (!selectedObject) return null;

  // 图片裁切专用工具栏
  if (isCropping) {
    const screenX = selectedObject.x * zoom + offset.x;
    const screenY = selectedObject.y * zoom + offset.y;
    
    const imageRatios = [
        { label: '原图', w: 0, h: 0 }, { label: '1:1', w: 1, h: 1 }, 
        { label: '4:3', w: 4, h: 3 }, { label: '3:4', w: 3, h: 4 }, 
        { label: '16:9', w: 16, h: 9 }, { label: '9:16', w: 9, h: 16 }
    ];
    return (
      <div 
        style={{ position: 'absolute', top: screenY - 50, left: screenX, zIndex: 90 }}
        key={`toolbar-crop-${selectedObject.id}`}
        className="flex items-center gap-2 bg-black text-white px-2 py-1.5 rounded-full shadow-xl text-xs font-medium animate-in fade-in zoom-in-95"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Move size={12} className="ml-1"/>
        <span>调整位置</span>
        <div className="w-px h-3 bg-white/20 mx-1"></div>
        <div className="relative">
            <button onClick={() => setShowRatioMenu(!showRatioMenu)} className="flex items-center gap-1 hover:bg-white/20 px-2 py-1 rounded transition-colors">
                <LayoutGrid size={12}/> <span>比例</span> <ChevronDown size={10}/>
            </button>
            {showRatioMenu && (
                <div className="absolute top-full left-0 mt-2 bg-white text-gray-800 border border-gray-200 rounded-lg shadow-xl py-1 z-50 flex flex-col min-w-[80px] overflow-hidden">
                    {imageRatios.map(r => (
                        <button key={r.label} onClick={() => {
                            if (r.label === '原图') {
                                const w = selectedObject.contentWidth || selectedObject.width;
                                const ratio = (selectedObject.naturalHeight || 100) / (selectedObject.naturalWidth || 100);
                                onUpdateObject({ ...selectedObject, contentHeight: w * ratio });
                            } else {
                                const w = selectedObject.contentWidth || selectedObject.width;
                                const newH = w * (r.h / r.w);
                                onUpdateObject({ ...selectedObject, contentHeight: newH });
                            }
                            setShowRatioMenu(false);
                        }} className="px-3 py-2 text-xs text-left hover:bg-blue-50 hover:text-blue-600 whitespace-nowrap border-b border-gray-50 last:border-0">
                            {r.label}
                        </button>
                    ))}
                </div>
              )}
        </div>
        <div className="w-px h-3 bg-white/20 mx-1"></div>
        <button onClick={() => onAction('finish_crop')} className="hover:text-green-400 hover:bg-white/10 px-2 py-1 rounded flex items-center gap-1 transition-colors">
           <Check size={12}/> 完成
        </button>
      </div>
    );
  }

  // 位置计算逻辑
  let toolbarStyle = {};
  if (isGlobalSettings) {
      toolbarStyle = { position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 90 };
  } else {
      const screenX = selectedObject.x * zoom + offset.x;
      const screenY = selectedObject.y * zoom + offset.y;
      toolbarStyle = { position: 'absolute', top: screenY - 50, left: screenX, zIndex: 90 };
  }

  const isGlobalLocked = selectedObject.isLocked;
  const toggleGlobalLock = () => onUpdateObject({ ...selectedObject, isLocked: !selectedObject.isLocked });

  // ... (保留 ColorPicker, StrokeWidthInput, OpacitySlider, BlurSlider 组件)
  const ColorPicker = ({ type = 'fill' }) => (
    <div className="relative flex items-center group w-4 h-4 mr-1" title={type === 'fill' ? "填充颜色" : "边框颜色"}>
        {type === 'fill' ? (
           <div className="w-4 h-4 rounded-full border border-gray-300 shadow-sm cursor-pointer" style={{ backgroundColor: selectedObject.fill || 'transparent', backgroundImage: selectedObject.fill === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)' : 'none', backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px' }}></div>
        ) : (
           <div 
             className="w-4 h-4 rounded-sm border-2 cursor-pointer shadow-sm box-border" 
             style={{ 
                borderColor: (!selectedObject.stroke || selectedObject.stroke === 'transparent') ? '#d1d5db' : selectedObject.stroke,
                borderStyle: (!selectedObject.stroke || selectedObject.stroke === 'transparent') ? 'dashed' : 'solid'
             }}
           ></div>
        )}
        <input 
            type="color" 
            value={!selectedObject[type] || selectedObject[type] === 'transparent' ? '#000000' : selectedObject[type]} 
            onChange={(e) => onUpdateObject({ ...selectedObject, [type]: e.target.value })}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isGlobalLocked}
        />
    </div>
  );

  const StrokeWidthInput = () => (
    <div className="flex items-center gap-1 bg-gray-50 rounded px-1 w-16 mr-2" title="边框粗细/画笔大小">
        <BoxSelect size={10} className="text-gray-400 shrink-0"/>
        <input 
            type="number" min="1" max="500"
            value={selectedObject.strokeWidth || 0}
            onChange={(e) => onUpdateObject({ ...selectedObject, strokeWidth: Number(e.target.value) })}
            className="w-full bg-transparent text-xs text-center focus:outline-none"
            disabled={isGlobalLocked}
        />
    </div>
  );

  const OpacitySlider = () => (
      <div className="flex items-center gap-1 w-14 group relative" title="透明度">
          <CircleDashed size={12} className="text-gray-400"/>
          <input 
            type="range" min="0" max="1" step="0.1"
            value={selectedObject.opacity ?? 1}
            onChange={(e) => onUpdateObject({ ...selectedObject, opacity: Number(e.target.value) }, true)}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={() => onUpdateObject({ ...selectedObject })}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={() => onUpdateObject({ ...selectedObject })}
            onPointerDown={(e) => e.stopPropagation()} 
            className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-black relative z-50"
            disabled={isGlobalLocked}
          />
      </div>
  );

  const BlurSlider = () => (
    <div className="flex items-center gap-1 w-14 group relative" title="边缘模糊">
        <Sparkles size={12} className="text-gray-400"/>
        <input 
          type="range" min="0" max="20" step="1"
          value={selectedObject.blur ?? 0}
          onChange={(e) => onUpdateObject({ ...selectedObject, blur: Number(e.target.value) }, true)}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={() => onUpdateObject({ ...selectedObject })}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={() => onUpdateObject({ ...selectedObject })}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-black relative z-50"
          disabled={isGlobalLocked}
        />
    </div>
  );

  let content = null;

  if (selectedObject.type === 'frame') {
    const ratios = [{ label: '1:1', w: 1, h: 1 }, { label: '16:9', w: 16, h: 9 }, { label: '9:16', w: 9, h: 16 }, { label: '4:3', w: 4, h: 3 }];
    content = (
      <>
        <div className="relative">
          <button onClick={() => !isGlobalLocked && setShowRatioMenu(!showRatioMenu)} className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 rounded-md text-xs font-medium text-gray-700"><span>比例</span> <ChevronDown size={12}/></button>
          {showRatioMenu && !isGlobalLocked && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 flex flex-col min-w-[80px]">
              {ratios.map(r => (
                <button key={r.label} onClick={() => { const newHeight = selectedObject.width * (r.h / r.w); onUpdateObject({ ...selectedObject, height: newHeight }); setShowRatioMenu(false); }} className="px-3 py-1.5 text-xs text-left hover:bg-blue-50 text-gray-700">{r.label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="w-px h-4 bg-gray-200 mx-1"></div>
        <div className="flex items-center gap-2 px-1">
          <div className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 w-24">
             <span className="text-[10px] text-gray-400 font-mono">W</span>
             <input type="number" value={selectedObject.width} onChange={(e) => onUpdateObject({ ...selectedObject, width: Number(e.target.value) })} className="w-full bg-transparent text-xs outline-none" disabled={isGlobalLocked || selectedObject.lockedWidth} />
             <button onClick={() => !isGlobalLocked && onUpdateObject({ ...selectedObject, lockedWidth: !selectedObject.lockedWidth })} className={`p-0.5 ${selectedObject.lockedWidth ? 'text-red-500' : 'text-gray-300'}`} disabled={isGlobalLocked}>{selectedObject.lockedWidth ? <Lock size={10}/> : <Unlock size={10}/>}</button>
          </div>
          <div className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 w-24">
             <span className="text-[10px] text-gray-400 font-mono">H</span>
             <input type="number" value={selectedObject.height} onChange={(e) => onUpdateObject({ ...selectedObject, height: Number(e.target.value) })} className="w-full bg-transparent text-xs outline-none" disabled={isGlobalLocked || selectedObject.lockedHeight} />
             <button onClick={() => !isGlobalLocked && onUpdateObject({ ...selectedObject, lockedHeight: !selectedObject.lockedHeight })} className={`p-0.5 ${selectedObject.lockedHeight ? 'text-red-500' : 'text-gray-300'}`} disabled={isGlobalLocked}>{selectedObject.lockedHeight ? <Lock size={10}/> : <Unlock size={10}/>}</button>
          </div>
        </div>
        <div className="w-px h-4 bg-gray-200 mx-1"></div>
        <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">背景</span>
            <ColorPicker type="fill" selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
        </div>
      </>
    );
  } else if (selectedObject.type === 'shape') {
     content = (
      <>
        <div className="flex gap-1 pr-2 border-r border-gray-200 mr-2">
           <button onClick={() => !isGlobalLocked && onUpdateObject({...selectedObject, shapeType: 'rectangle'})} className={`p-1 rounded hover:bg-gray-100 ${selectedObject.shapeType==='rectangle'?'bg-blue-50 text-blue-600':''}`} title="矩形"><Square size={14}/></button>
           <button onClick={() => !isGlobalLocked && onUpdateObject({...selectedObject, shapeType: 'circle'})} className={`p-1 rounded hover:bg-gray-100 ${selectedObject.shapeType==='circle'?'bg-blue-50 text-blue-600':''}`} title="圆形"><CircleIcon size={14}/></button>
           <button onClick={() => !isGlobalLocked && onUpdateObject({...selectedObject, shapeType: 'triangle'})} className={`p-1 rounded hover:bg-gray-100 ${selectedObject.shapeType==='triangle'?'bg-blue-50 text-blue-600':''}`} title="三角形"><Triangle size={14}/></button>
        </div>
        <div className="flex items-center gap-2">
            <ColorPicker type="fill" selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
            <div className="w-px h-3 bg-gray-200 mx-1"></div>
            <ColorPicker type="stroke" selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
            <StrokeWidthInput selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
        </div>
        <OpacitySlider selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
      </>
    );
  } else if (selectedObject.type === 'spline') {
     content = (
      <>
        <ColorPicker type="fill" selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
        <ColorPicker type="stroke" selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
        <StrokeWidthInput selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
        <OpacitySlider selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
      </>
    );
  } else if (selectedObject.type === 'draw') {
     content = (
      <>
        <div className="flex items-center gap-2 px-1">
            {isGlobalSettings && <span className="text-xs font-bold text-gray-500 mr-1">笔刷预设</span>}
            <div className="flex items-center gap-1" title="画笔颜色">
                <ColorPicker type="stroke" selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
            </div>
            <StrokeWidthInput selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
            <div className="w-px h-4 bg-gray-200 mx-1"></div>
            <OpacitySlider selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
            <BlurSlider selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
        </div>
      </>
    );
  } else if (selectedObject.type === 'text') {
    const toggleBold = () => onUpdateObject({ ...selectedObject, fontWeight: selectedObject.fontWeight === 'bold' ? 'normal' : 'bold' });
    const toggleFont = () => onUpdateObject({ ...selectedObject, fontFamily: selectedObject.fontFamily === 'serif' ? 'sans-serif' : 'serif' });
    const changeAlign = (align) => onUpdateObject({ ...selectedObject, align });

    content = (
      <>
        <div className="flex items-center gap-1 pr-2 border-r border-gray-200 mr-2">
            <button onClick={toggleFont} className={`p-1.5 rounded hover:bg-gray-100`} title="切换字体 (Serif/Sans)">
               <span className={selectedObject.fontFamily === 'serif' ? 'font-serif' : 'font-sans'}>T</span>
            </button>
            <div className="flex items-center gap-0.5 bg-gray-50 rounded px-1 w-10 border border-gray-200" title="字号">
                <input 
                    type="number" 
                    value={selectedObject.fontSize || 24}
                    onChange={(e) => onUpdateObject({ ...selectedObject, fontSize: Number(e.target.value) })}
                    className="w-full bg-transparent text-xs text-center focus:outline-none"
                    disabled={isGlobalLocked}
                />
            </div>
            <button onClick={toggleBold} className={`p-1.5 rounded hover:bg-gray-100 ${selectedObject.fontWeight === 'bold' ? 'bg-gray-200 text-black' : 'text-gray-600'}`} title="加粗"><Bold size={14}/></button>
        </div>
        <div className="flex items-center gap-0.5 border border-gray-200 rounded p-0.5 mr-2">
            <button onClick={() => changeAlign('left')} className={`p-1 rounded hover:bg-white ${selectedObject.align === 'left' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}><AlignLeft size={12}/></button>
            <button onClick={() => changeAlign('center')} className={`p-1 rounded hover:bg-white ${selectedObject.align === 'center' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}><AlignCenter size={12}/></button>
            <button onClick={() => changeAlign('right')} className={`p-1 rounded hover:bg-white ${selectedObject.align === 'right' ? 'bg-white shadow-sm text-black' : 'text-gray-400'}`}><AlignRight size={12}/></button>
        </div>
        <div className="flex items-center gap-2 pr-2 border-r border-gray-200 mr-2">
            <div className="flex items-center gap-1" title="字体颜色">
               <ColorPicker type="fill" selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
            </div>
            <div className="flex items-center gap-1" title="文字描边">
                <span className="text-[10px] text-gray-400">边</span>
                <ColorPicker type="stroke" selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
                <StrokeWidthInput selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
            </div>
        </div>
        <OpacitySlider selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
      </>
    );
  } else if (selectedObject.type === 'image') {
    const imageRatios = [
        { label: '原图比例', w: 0, h: 0 }, { label: '1:1', w: 1, h: 1 }, 
        { label: '4:3', w: 4, h: 3 }, { label: '3:4', w: 3, h: 4 }, 
        { label: '16:9', w: 16, h: 9 }, { label: '9:16', w: 9, h: 16 }
    ];
    content = (
      <>
        {/* [FIXED] 缩放模式切换按钮 */}
        <button 
            onClick={() => !isGlobalLocked && onToggleResizeMode && onToggleResizeMode()} 
            className={`${BTN_TOOL_CLASS} ${resizeMode === 'scale' ? 'bg-blue-50 text-blue-600' : ''}`}
            title={resizeMode === 'scale' ? "当前：缩放模式 (拖角锁定比例，拖边自由拉伸)" : "当前：裁切模式 (拖动改变视野)"}
        >
            {resizeMode === 'scale' ? <Maximize size={14}/> : <Crop size={14}/>}
        </button>

        {/* [FIXED] 重置按钮 */}
        <button 
            onClick={() => !isGlobalLocked && handleReset()} 
            className={BTN_TOOL_CLASS}
            title="恢复原样：重置为图片原始比例并填满"
        >
            <RotateCcw size={14}/>
        </button>
        
        <div className="w-px h-3 bg-gray-200 mx-1"></div>

        <div className="relative">
            <button onClick={() => !isGlobalLocked && setShowRatioMenu(!showRatioMenu)} className={BTN_TOOL_CLASS}>
                <LayoutGrid size={14} /><span>画框比例</span><ChevronDown size={12}/>
            </button>
            {showRatioMenu && !isGlobalLocked && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 flex flex-col min-w-[80px]">
                    {imageRatios.map(r => (
                        <button key={r.label} onClick={() => {
                            if (r.label === '原图比例') {
                                const natW = selectedObject.naturalWidth || 100;
                                const natH = selectedObject.naturalHeight || 100;
                                const newHeight = selectedObject.width * (natH / natW);
                                onUpdateObject({ ...selectedObject, height: newHeight });
                            } else {
                                const newHeight = selectedObject.width * (r.h / r.w);
                                onUpdateObject({ ...selectedObject, height: newHeight });
                            }
                            setShowRatioMenu(false);
                        }} className="px-3 py-1.5 text-xs text-left hover:bg-blue-50 text-gray-700 whitespace-nowrap">
                            {r.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
        
        {/* [FIXED] 抠图按钮：支持 Loading 状态 */}
        <button 
            className={`${BTN_TOOL_CLASS} ${isProcessing ? 'cursor-wait opacity-70' : ''}`} 
            onClick={() => !isGlobalLocked && !isProcessing && onAction('remove_bg')}
            disabled={isProcessing} // 处理中禁止点击
        >
            {isProcessing ? (
                <Loader2 size={14} className="animate-spin text-blue-500"/>
            ) : (
                <Scissors size={14} />
            )}
            <span>{isProcessing ? "处理中" : "抠图"}</span>
        </button>

        <div className="w-px h-4 bg-gray-200 mx-1"></div>
        <OpacitySlider selectedObject={selectedObject} onUpdateObject={onUpdateObject} isGlobalLocked={isGlobalLocked} />
      </>
    );
  }

  return (
    <div 
      style={toolbarStyle}
      key={`toolbar-${selectedObject.id}`}
      onMouseDown={(e) => e.stopPropagation()}
      className={`flex items-center gap-1 bg-white p-1.5 rounded-xl shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200 select-none whitespace-nowrap ${isGlobalLocked ? 'bg-gray-50 opacity-90' : ''}`}
    >
      <div className={`flex items-center gap-1 ${isGlobalLocked ? 'pointer-events-none opacity-50' : ''}`}>{content}</div>
      
      {!isGlobalSettings && (
        <>
          <div className="w-px h-4 bg-gray-200 mx-1"></div>
          <button onClick={toggleGlobalLock} className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${selectedObject.isLocked ? 'bg-red-50 text-red-600' : 'hover:bg-gray-100 text-gray-700'}`} title={selectedObject.isLocked ? "点击解锁" : "锁定对象"}>{selectedObject.isLocked ? <Lock size={14} /> : <Unlock size={14} />}</button>
          <button onClick={(e) => {e.stopPropagation();
!isGlobalLocked && onAction('delete')}} className={`p-1.5 rounded-md transition-colors ${isGlobalLocked ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-red-50 text-red-500'}`} disabled={isGlobalLocked} title="删除 (Del)"><Trash2 size={14}/></button>
        </>
      )}
    </div>
  );
};

export default FloatingToolbar;