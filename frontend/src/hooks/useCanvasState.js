import { useState, useCallback, useEffect } from 'react';
import { useHistory } from './useHistory';
import { createSplineObject } from '../tools/SplineTool';
import { createDrawObject } from '../tools/DrawTool';
import { generateImageFromFrame } from '../utils/imageGenerator';
import { saveOriginalImage, saveTextFile, exportCompositorImage } from '../utils/fileSystem';

export function useCanvasState() {
  // --- 1. 初始状态 ---
  const [images, setImages] = useState([
    { id: 'frame1', type: 'frame', name: '海报主图', x: 100, y: 100, width: 1920, height: 1080, fill: '#ffffff', stroke: '#9ca3af', originalWidth: 1920, originalHeight: 1080, isLocked: false },
    { id: 'text_intro', type: 'text', x: 760, y: 500, width: 400, height: 60, text: '点击左侧图片图标\n上传真实图片', fill: '#52525b', fontSize: 32, align:'center', originalWidth: 400, originalHeight: 60, isLocked: false}
  ]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTool, setActiveTool] = useState('select');
  const [zoom, setZoom] = useState(0.6);
  const [offset, setOffset] = useState({ x: 40, y: 40 });
  const [drawSettings, setDrawSettings] = useState({ stroke: '#000000', strokeWidth: 5, opacity: 1, blur: 0 });
  const [viewMode, setViewMode] = useState('canvas'); 

  // --- 2. 历史记录 ---
  const { takeSnapshot, undo, redo, canUndo, canRedo } = useHistory(images);

  // 统一更新 helper
  const updateImages = useCallback((newImages, shouldSnapshot = true) => {
      setImages(newImages);
      if (shouldSnapshot) takeSnapshot(newImages);
  }, [takeSnapshot]);

  // --- 3. 核心动作 ---

  const deleteObject = useCallback((targetId) => {
      const newImages = images.filter(item => item.id !== targetId);
      updateImages(newImages);
      if (selectedId === targetId) setSelectedId(null);
  }, [images, selectedId, updateImages]);

  // 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e) => { 
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); const prev = undo(); if(prev) setImages(prev); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); const next = redo(); if(next) setImages(next); return; }
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { 
            const obj = images.find(i => i.id === selectedId);
            // 只有未锁定且没在输入文字时才删除
            if (obj && !obj.isLocked && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                deleteObject(selectedId);
            }
        } 
    };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, images, deleteObject, undo, redo]);

  // 钢笔绘制完成
  const handleSplineComplete = (points, isClosed) => {
      const newObj = createSplineObject(points, isClosed);
      if (newObj) { updateImages([...images, newObj]); setSelectedId(newObj.id); }
  };

  // 涂鸦绘制完成
  const handleDrawComplete = (points) => {
      const newObj = createDrawObject(points, drawSettings);
      if (newObj) { updateImages([...images, newObj]); setSelectedId(newObj.id); }
  };

  // 添加物体 (修复版：逻辑已补全)
  const handleAddObject = (type, fileInputRef) => {
    if (type === 'image') { 
        if(fileInputRef?.current) fileInputRef.current.click(); 
        return; 
    }

    const id = `item_${Date.now()}`;
    const viewportWidth = window.innerWidth - 72 - 360; 
    const viewportHeight = window.innerHeight - 64;     
    const centerX = (viewportWidth / 2 - offset.x) / zoom + (Math.random() * 40 - 20);
    const centerY = (viewportHeight / 2 - offset.y) / zoom + (Math.random() * 40 - 20);
    
    let w = 200, h = 200; 
    let baseProps = { id, type, x: centerX - w/2, y: centerY - h/2, width: w, height: h, originalWidth: w, originalHeight: h, isLocked: false, opacity: 1 };
    
    if (type === 'text') { 
        w = 240; h = 60;
        baseProps = { ...baseProps, x: centerX - w/2, y: centerY - h/2, width: w, height: h, text: '双击编辑文字', fontSize: 48, fontWeight: 'normal', align: 'center', fill: '#000000', fontFamily: 'sans-serif' };
    } else if (type === 'shape') { 
        baseProps = { ...baseProps, fill: '#FF6B6B', stroke: '#000000', strokeWidth: 0, shapeType: 'rectangle' };
    } else if (type === 'frame') { 
        w = 1920; h = 1080;
        const frameCount = images.filter(i => i.type === 'frame').length + 1;
        baseProps = { ...baseProps, name: `Frame ${frameCount}`, x: centerX - w/2, y: centerY - h/2, width: w, height: h, fill: '#ffffff', stroke: '#9ca3af', strokeWidth: 2, lockedWidth: false, lockedHeight: false };
    }
    updateImages([...images, baseProps]); 
    setSelectedId(id);
  };

  // 图层/右键菜单操作
  const handleLayerAction = async (action, targetId, activeWorkflowId, setAllBindings, uploadFn) => {
      const targetObj = images.find(i => i.id === targetId);
      if(!targetObj) return;

      if (action === 'save_local' && targetObj.type === 'frame') { await exportCompositorImage(targetObj, images, generateImageFromFrame); return; }
      if (action === 'save_original' && targetObj.type === 'image') { saveOriginalImage(targetObj); return; }
      if (action === 'save_text' && targetObj.type === 'text') { saveTextFile(targetObj); return; }

      if (['bind_image', 'bind_mask', 'bind_prompt'].includes(action)) {
          const key = action.split('_')[1];
          setAllBindings(prev => ({ ...prev, [activeWorkflowId]: { ...prev[activeWorkflowId], [key]: targetObj } }));
          return;
      }

      if (action === 'generateImage' || action === 'generateMask') {
          const isMask = action === 'generateMask';
          const dataURL = await generateImageFromFrame(targetObj, images, isMask);
          
          let finalSrc = dataURL;
          // [Fix] 主动上传逻辑：如果提供了 uploadFn，立即作为 generation 上传
          if (uploadFn) {
              try {
                  const res = await fetch(dataURL);
                  const blob = await res.blob();
                  const filename = `gen_${Date.now()}.png`;
                  const url = await uploadFn(blob, filename, 'generation');
                  if (url) finalSrc = url;
              } catch (e) { console.error("Generation upload failed", e); }
          }

          const newImg = {
              id: `gen_${Date.now()}`, sourceIds: [targetObj.id],
              type: 'image', x: targetObj.x + targetObj.width + 50, y: targetObj.y,
              width: targetObj.width, height: targetObj.height, 
              src: finalSrc, opacity: 1, originalWidth: targetObj.width, originalHeight: targetObj.height, isLocked: false, isGenerated: true 
          };
          updateImages([...images, newImg]); return;
      }
      
      if (action === 'delete') { deleteObject(targetId); return; }

      const idx = images.findIndex(i => i.id === targetId);
      if(idx < 0) return;
      const newArr = [...images];
      if (action === 'bringToFront') { newArr.push(newArr.splice(idx, 1)[0]); } 
      else if (action === 'sendToBack') { newArr.unshift(newArr.splice(idx, 1)[0]); }
      updateImages(newArr);
  };

  return {
      images, setImages, updateImages,
      selectedId, setSelectedId,
      activeTool, setActiveTool,
      zoom, setZoom, offset, setOffset,
      drawSettings, setDrawSettings,
      viewMode, setViewMode,
      takeSnapshot, undo, redo, canUndo, canRedo,
      deleteObject, handleAddObject, handleSplineComplete, handleDrawComplete, handleLayerAction
  };
}