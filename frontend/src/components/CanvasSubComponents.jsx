// CanvasSubComponents.jsx
import React from 'react';
import { 
  RefreshCw, ImageIcon, Layers, Zap, Maximize, 
  Type as TypeIcon, ArrowUp, ArrowDown, Trash2,
  Download, FileText, Image as LucideImage, Check, LayoutGrid, Palette
} from 'lucide-react';
import { getBezierPath } from './canvasUtils';

// 1. 连线层
export const LinksLayer = React.memo(({ images, highlightedLinks }) => {
    return (
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible z-0">
            {images.flatMap(img => 
                (img.sourceIds || []).map(sourceId => {
                    const parent = images.find(p => p.id === sourceId);
                    if (!parent) return null;
                    const linkKey = `${parent.id}-${img.id}`;
                    const startX = parent.x + parent.width;
                    const startY = parent.y + parent.height / 2;
                    const endX = img.x;
                    const endY = img.y + img.height / 2;
                    return (
                        <path key={linkKey} d={getBezierPath(startX, startY, endX, endY)}
                            stroke={highlightedLinks.has(linkKey) ? "#2563eb" : "#cbd5e1"} 
                            strokeWidth={highlightedLinks.has(linkKey) ? "6" : "3"}
                            fill="none" className="transition-colors duration-200"
                        />
                    );
                })
            )}
        </svg>
    );
}, (prev, next) => prev.images === next.images && prev.highlightedLinks === next.highlightedLinks);

// 2. 调整手柄 (ResizeHandles)
export const ResizeHandles = ({ obj, selectedId, zoom, croppingId, viewMode, onMouseDown }) => {
    // 只有选中且未锁定，且不在裁切模式下才显示旋转/缩放手柄
    if (selectedId !== obj.id || obj.isLocked || viewMode !== 'canvas') return null;

    const handleSize = 8 / zoom; 
    const handleOffset = handleSize / 2;
    const labelFontSize = Math.max(10, 10 / zoom);
    const labelPaddingX = 4 / zoom;
    const labelPaddingY = 1 / zoom;
    const labelTopOffset = 15 / zoom;
    
    let x=0, y=0, w=obj.width, h=obj.height;
    if (croppingId===obj.id) { x=obj.contentX||0; y=obj.contentY||0; w=obj.contentWidth||obj.width; h=obj.contentHeight||obj.height; }
    
    const handles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
    
    return ( <>
        {obj.type !== 'frame' && obj.type !== 'group' && !croppingId && (
            <div className="absolute bg-white border border-gray-300 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-sm hover:scale-110 transition-transform z-40" 
                 style={{ left: w/2 - (12/zoom), top: h + (15/zoom), width: 24/zoom, height: 24/zoom, borderWidth: 1/zoom }} 
                 onMouseDown={(e) => onMouseDown(e, obj.id, null, 'rotate')}>
               <RefreshCw size={14/zoom} className="text-gray-600"/>
               <div className="absolute bg-blue-400 bottom-full left-1/2 -translate-x-1/2 pointer-events-none" style={{width: 1/zoom, height: 16/zoom}}></div>
            </div>
        )}
        {croppingId === obj.id && <div className="absolute border-dashed border-white/80 pointer-events-none shadow-sm" style={{ left:x, top:y, width:w, height:h, zIndex: 20, borderWidth: 2/zoom }}></div>}
        {selectedId === obj.id && !croppingId && obj.type === 'image' && 
            <div className="absolute left-1/2 -translate-x-1/2 bg-black/60 text-white rounded-full backdrop-blur-sm pointer-events-none z-50 whitespace-nowrap shadow-sm border border-white/10" 
                 style={{ top: labelTopOffset, fontSize: labelFontSize, padding: `${labelPaddingY}px ${labelPaddingX}px`, borderWidth: 1/zoom }}>双击调整图片</div>
        }
        {handles.map(handle => {
           let style = { width: handleSize, height: handleSize, background: 'white', border: `${1/zoom}px solid #0096FF`, position: 'absolute', zIndex: 30, pointerEvents: 'auto' };
           let top = 'auto', left = 'auto';
           if (handle.includes('n')) top = y - handleOffset; if (handle.includes('s')) top = y + h - handleOffset; if (!handle.includes('n') && !handle.includes('s')) top = y + h/2 - handleOffset;
           if (handle.includes('w')) left = x - handleOffset; if (handle.includes('e')) left = x + w - handleOffset; if (!handle.includes('w') && !handle.includes('e')) left = x + w/2 - handleOffset;
           style = { ...style, top, left, cursor: `${handle}-resize` };
           return <div key={handle} style={style} onMouseDown={(e) => onMouseDown(e, obj.id, null, handle)} />
        })}
    </> );
};

// 3. 右键菜单 (ContextMenu)
export const ContextMenu = ({ contextMenu, onLayerAction, setContextMenu, activeWorkflow, onSelect, selectedIds = [] }) => {
    if (!contextMenu) return null;
    const { x, y, targetId, type, overlapping } = contextMenu;
    const menuItems = [];

    // [New] 多选操作菜单 (仅当选中 2 个元素时显示合成选项)
    if (Array.isArray(selectedIds) && selectedIds.length === 2) {
        menuItems.push({ section: '多选操作' });
        menuItems.push({ label: '合成选中项 (Composite)', icon: Layers, action: 'composite_selected' });
    }

    if (type === 'frame') {
      menuItems.push({ section: '导出与合成' });
      menuItems.push({ label: '生成预览图 (内部)', icon: ImageIcon, action: 'generateImage' });
      menuItems.push({ label: '生成 Mask 遮罩', icon: Layers, action: 'generateMask' });
      menuItems.push({ label: '保存到本地 (Save)', icon: Download, action: 'save_local' }); 
      // [New] Frame 也可以导入 PS
      menuItems.push({ label: '导入 PS (新建文件)', icon: Palette, action: 'export_to_ps_new' });
      menuItems.push({ label: '导入 PS (当前文件)', icon: Palette, action: 'export_to_ps_current' });
      menuItems.push({ section: '工作流绑定' });
      // Frame 也可以作为 Image 绑定，逻辑同下
      generateBindingItems(menuItems, activeWorkflow, 'image'); 
    } 
    else if (['image', 'shape', 'text', 'draw', 'spline'].includes(type)) {
      if (type === 'image') {
          menuItems.push({ section: '提取' });
          menuItems.push({ label: '保存原图 (Original)', icon: LucideImage, action: 'save_original' });
          menuItems.push({ label: '创建画布 (Create Canvas)', icon: LayoutGrid, action: 'create_canvas_from_image' });
      }
      if (['image', 'text', 'shape', 'draw', 'spline'].includes(type)) {
          menuItems.push({ section: 'Adobe Photoshop' });
          menuItems.push({ label: '导入 PS (新建文件)', icon: Palette, action: 'export_to_ps_new' });
          menuItems.push({ label: '导入 PS (当前文件)', icon: Palette, action: 'export_to_ps_current' });
      }
      if (type === 'text') {
          menuItems.push({ section: '提取' });
          menuItems.push({ label: '保存文本 (.txt)', icon: FileText, action: 'save_text' });
      }
      menuItems.push({ section: '工作流绑定' });
      generateBindingItems(menuItems, activeWorkflow, type);
    }
    
    menuItems.push({ section: '通用' });
    menuItems.push({ label: '置顶', icon: ArrowUp, action: 'bringToFront' });
    menuItems.push({ label: '置底', icon: ArrowDown, action: 'sendToBack' });
    menuItems.push({ label: '删除', icon: Trash2, action: 'delete', isDestructive: true });

    return (
        <div style={{ position: 'fixed', top: y, left: x, zIndex: 9999 }} className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-56 flex flex-col text-sm" onMouseDown={(e) => e.stopPropagation()} >
            {menuItems.map((item, index) => {
                if (item.section) {
                  return <div key={`section-${index}`} className={`px-3 py-2 text-xs font-bold text-gray-400 bg-gray-50 uppercase tracking-wider ${index > 0 ? 'mt-1' : ''}`}>{item.section}</div>;
                }
                const Icon = item.icon;
                return (
                  <button key={item.label} onClick={() => { onLayerAction(item.action, targetId); setContextMenu(null); }} className={`flex items-center gap-3 px-4 py-2 text-left transition-colors ${item.isDestructive ? 'hover:bg-red-50 text-red-600' : 'hover:bg-gray-100 text-gray-700'}`}>
                      <Icon size={16} className={item.isDestructive ? '' : 'text-gray-500'}/> <span>{item.label}</span>
                  </button>
                );
            })}

            {/* [New] 图层选择列表 (放在最下方) */}
            {overlapping && overlapping.length > 1 && (
                <div className="border-t border-gray-100 mt-1 pt-1">
                    <div className="px-3 py-1.5 text-xs font-bold text-gray-400 bg-gray-50 uppercase tracking-wider">切换图层</div>
                    <div className="max-h-32 overflow-y-auto">
                        {overlapping.map(img => (
                            <button 
                                key={img.id}
                                onClick={() => { onSelect(img.id); setContextMenu(null); }}
                                className={`w-full flex items-center gap-2 px-4 py-1.5 text-left text-xs hover:bg-blue-50 transition-colors ${img.id === targetId ? 'text-blue-600 font-medium bg-blue-50/50' : 'text-gray-600'}`}
                            >
                                {img.id === targetId ? <Check size={12} className="shrink-0"/> : <div className="w-3 shrink-0"/>}
                                <span className="truncate">{img.name || (img.type === 'image' ? 'Image' : img.type)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// [Helper] 动态生成绑定菜单项
function generateBindingItems(menuItems, activeWorkflow, itemType) {
    if (activeWorkflow?.mappings && activeWorkflow.mappings.length > 0) {
        activeWorkflow.mappings.forEach(m => {
            const name = m.slot_name;
            let label = `设为：${name}`;
            let Icon = Zap;

            if (name === 'image') { label = '设为：底图 (Image)'; Icon = Zap; }
            else if (name === 'mask') { label = '设为：遮罩 (Mask)'; Icon = Maximize; }
            else if (name === 'prompt') { label = '设为：提示词 (Prompt)'; Icon = TypeIcon; }

            // [Fix] 宽松的类型过滤，确保文本可以绑定到自定义插槽 (如 positive, negative, seed 等)
            if (itemType === 'text') {
                // 文本对象：只排除明确的图片插槽
                if (name === 'image' || name === 'mask') return;
            } else {
                // 图片对象：排除明确的文本插槽
                if (name === 'prompt') return;
                // 简单启发式：如果名字包含 seed 或 text，也不显示
                if (name.toLowerCase().includes('seed') || name.toLowerCase().includes('text')) return;
            }

            menuItems.push({ label, icon: Icon, action: `bind_${name}` });
        });
    } else {
        // Fallback: 默认显示
        if (itemType !== 'text') {
            menuItems.push({ label: '设为：底图 (Image)', icon: Zap, action: 'bind_image' });
            menuItems.push({ label: '设为：遮罩 (Mask)', icon: Maximize, action: 'bind_mask' });
        }
        if (itemType === 'text') {
            menuItems.push({ label: '设为：提示词 (Prompt)', icon: TypeIcon, action: 'bind_prompt' });
        }
    }
}