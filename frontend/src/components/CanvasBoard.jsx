// frontend/src/components/CanvasBoard.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import FloatingToolbar from './FloatingToolbar';
import { LinksLayer, ResizeHandles, ContextMenu } from './CanvasSubComponents';
import { renderPath, labelStyle, selectionBorderStyle, getCanvasCoordinates } from './canvasUtils';
import { handleCanvasMouseMove } from './canvasInteraction';

const CanvasBoard = ({ 
    images, setImages, selectedId, onSelect, activeTool, 
    onSplineComplete, onDrawComplete, 
    zoom, setZoom, offset, setOffset, 
    drawSettings, setDrawSettings, 
    viewMode, onLayerAction, bindings = {}, onDropObject,
    onHistoryRecord, activeWorkflow,
    canvasSettings = { snapToGrid: false, gridSize: 20, smartGuides: false, snapThreshold: 5, showGuides: false } // [New] 接收设置
}) => {
  const containerRef = useRef(null);
  
  // --- State 定义 ---
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [resizeMode, setResizeMode] = useState('scale');
  const dragInfoRef = useRef({ initialItemPos: { x: 0, y: 0 }, initialContentPos: { x: 0, y: 0 }, initialSize: { width: 0, height: 0 }, initialContentSize: { width: 0, height: 0 }, startMouse: { x: 0, y: 0 }, hasMoved: false });
  const [isRotating, setIsRotating] = useState(false);
  const [rotationStartAngle, setRotationStartAngle] = useState(0);
  const [initialRotation, setInitialRotation] = useState(0);
  const [croppingId, setCroppingId] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingFrameNameId, setEditingFrameNameId] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState([]); 
  const [mousePreviewPos, setMousePreviewPos] = useState(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null); 
  const [contextMenu, setContextMenu] = useState(null);
  const [selectionBox, setSelectionBox] = useState(null); // [New] 框选状态
  const [activeGuides, setActiveGuides] = useState([]); // [New] 智能对齐辅助线
  
  const [isProcessing, setIsProcessing] = useState(false);
  
  const rafRef = useRef(null);
  const prevToolRef = useRef(activeTool);
  const pointsRef = useRef(currentPoints);
  pointsRef.current = currentPoints;

  // [Fix] Ref to store latest zoom/offset to avoid re-binding wheel listener
  const transformRef = useRef({ zoom, offset });
  useEffect(() => { transformRef.current = { zoom, offset }; }, [zoom, offset]);

  // --- Logic & Effects ---
  const finishSpline = (isClosed) => { if (pointsRef.current.length > 1 && onSplineComplete) { onSplineComplete(pointsRef.current, isClosed); } setCurrentPoints([]); setMousePreviewPos(null); };
  useEffect(() => { if (prevToolRef.current === 'spline' && activeTool !== 'spline' && pointsRef.current.length > 0) { finishSpline(false); } prevToolRef.current = activeTool; }, [activeTool]);
  
  // [Modified] 合并键盘事件监听 (Spline Enter & Delete)
  useEffect(() => { 
      const handleKeyDown = (e) => { 
          if (activeTool === 'spline' && e.key === 'Enter') { e.preventDefault(); finishSpline(false); } 
          
          // [New] Delete/Backspace 删除选中元素 (支持多选)
          if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
              // 忽略输入框中的删除
              if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
              
              const idsToDelete = Array.isArray(selectedId) ? selectedId : [selectedId];
              setImages(prev => prev.filter(img => !idsToDelete.includes(img.id)));
              onSelect(null);
              onHistoryRecord && onHistoryRecord();
          }
      }; 
      window.addEventListener('keydown', handleKeyDown); 
      return () => window.removeEventListener('keydown', handleKeyDown); 
  }, [activeTool, currentPoints, selectedId, setImages, onSelect, onHistoryRecord]);

  useEffect(() => { if (selectedId !== croppingId) setCroppingId(null); }, [selectedId]);

  // [New] 多选支持辅助函数
  const isSelected = (id) => Array.isArray(selectedId) ? selectedId.includes(id) : selectedId === id;
  const primarySelectedId = Array.isArray(selectedId) ? selectedId[selectedId.length - 1] : selectedId;

  // [New] 多选状态判断
  const isMultiSelect = Array.isArray(selectedId) && selectedId.length > 1;

  // [New] 计算多选组的包围盒 (Group Bounding Box)
  const groupBounds = useMemo(() => {
      if (!isMultiSelect) return null;
      const selectedNodes = images.filter(img => selectedId.includes(img.id));
      if (selectedNodes.length < 2) return null;
      
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      selectedNodes.forEach(node => {
          minX = Math.min(minX, node.x);
          minY = Math.min(minY, node.y);
          maxX = Math.max(maxX, node.x + node.width);
          maxY = Math.max(maxY, node.y + node.height);
      });
      
      // 返回一个虚拟的组对象
      return { id: 'selection_group', type: 'group', x: minX, y: minY, width: maxX - minX, height: maxY - minY, rotation: 0, isLocked: false };
  }, [selectedId, images, isMultiSelect]);

  // [New] Copy & Paste (Ctrl+C / Ctrl+V)
  useEffect(() => {
      const handleCopyPaste = (e) => {
          // Ignore if typing in input/textarea
          if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

          // Copy: Ctrl+C
          if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
              if (primarySelectedId) {
                  const ids = Array.isArray(selectedId) ? selectedId : [selectedId];
                  const targets = images.filter(img => ids.includes(img.id));
                  if (targets.length > 0) {
                      // Use window property for simple clipboard persistence within session
                      window.__CANVAS_CLIPBOARD__ = JSON.parse(JSON.stringify(targets));
                      console.log('📋 Copied objects:', targets.length);
                  }
              }
          }

          // Paste: Ctrl+V
          if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
              const clipboard = window.__CANVAS_CLIPBOARD__;
              if (clipboard && Array.isArray(clipboard) && clipboard.length > 0) {
                  e.preventDefault();
                  const newItems = clipboard.map(item => ({
                      ...item,
                      id: `paste_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                      x: item.x + 20, // Offset slightly
                      y: item.y + 20,
                      isLocked: false,
                      sourceIds: [] // Reset connections for pasted items
                  }));
                  setImages(prev => [...prev, ...newItems]);
                  onSelect(newItems.map(i => i.id)); // Select pasted items
                  onHistoryRecord && onHistoryRecord();
              }
          }
      };

      window.addEventListener('keydown', handleCopyPaste);
      return () => window.removeEventListener('keydown', handleCopyPaste);
  }, [images, selectedId, primarySelectedId, setImages, onSelect, onHistoryRecord]);

  // [New] 监听全局粘贴事件 (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e) => {
        if (!onDropObject) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                // 计算粘贴位置（屏幕中心）
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                const x = (window.innerWidth / 2 - rect.left - offset.x) / zoom;
                const y = (window.innerHeight / 2 - rect.top - offset.y) / zoom;
                
                onDropObject({ type: 'image', file, x, y });
                e.preventDefault();
                break;
            }
        }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onDropObject, offset, zoom]);
  
  const { nodes: highlightedNodes, links: highlightedLinks } = useMemo(() => { if (viewMode !== 'tree' || !primarySelectedId) return { nodes: new Set(), links: new Set() }; const highlights = { nodes: new Set(), links: new Set() }; highlights.nodes.add(primarySelectedId); const selectedNode = images.find(i => i.id === primarySelectedId); if (selectedNode && selectedNode.sourceIds) selectedNode.sourceIds.forEach(pId => { highlights.nodes.add(pId); highlights.links.add(`${pId}-${primarySelectedId}`); }); images.forEach(node => { if (node.sourceIds && node.sourceIds.includes(primarySelectedId)) { highlights.nodes.add(node.id); highlights.links.add(`${primarySelectedId}-${node.id}`); } }); return highlights; }, [viewMode, primarySelectedId, images]);
  const selectedObject = images.find(img => img.id === primarySelectedId);
  const handleUpdateObject = (updatedObj, skipHistory = false) => { setImages(prev => prev.map(img => img.id === updatedObj.id ? updatedObj : img)); if (!skipHistory && onHistoryRecord) onHistoryRecord(); };
  const handleFrameNameChange = (id, newName) => setImages(prev => prev.map(img => img.id === id ? { ...img, name: newName } : img));
  const handleFrameNameBlur = () => { setEditingFrameNameId(null); onHistoryRecord && onHistoryRecord(); };
  
  // [核心修改] handleImageLoad: 自适应图片比例
  const handleImageLoad = (id, e) => { 
      const { naturalWidth, naturalHeight } = e.target; 
      
      setImages(prev => prev.map(img => { 
          if (img.id !== id) return img; 
          
          // 如果 contentWidth 已经存在，说明是旧图片或用户手动裁切过，保持原样逻辑 (Cover模式)
          if (img.contentWidth) { 
             return { ...img, naturalWidth, naturalHeight }; 
          }

          // 否则（新图片），执行自适应逻辑
          // 计算宽高比
          const aspectRatio = naturalWidth / naturalHeight;
          // 保持宽度不变(默认300)，自动计算新的高度
          const newHeight = img.width / aspectRatio;

          return { 
              ...img, 
              naturalWidth, 
              naturalHeight, 
              height: newHeight, // 修改框的高度
              // 让内容铺满
              contentWidth: img.width, 
              contentHeight: newHeight, 
              contentX: 0, 
              contentY: 0 
          }; 
      })); 
  };

  const handleToolbarAction = async (action) => {
    if (action === 'delete') {
       // [Modified] 支持多选删除
       const idsToDelete = Array.isArray(selectedId) ? selectedId : [selectedId];
       setImages(prev => prev.filter(img => !idsToDelete.includes(img.id)));
       onSelect(null);
       onHistoryRecord && onHistoryRecord();
       return;
    }
    if (action === 'finish_crop') {
       setCroppingId(null);
       return;
    }
    // 去底逻辑
    if (action === 'remove_bg') {
        setIsProcessing(true);
        try {
            // [Fix] 确保传递单个 ID (如果是多选，取主选中项)
            const targetId = Array.isArray(selectedId) ? primarySelectedId : selectedId;
            await onLayerAction('rembg', targetId);
        } catch (e) {
            console.error("Remove background failed:", e);
        } finally {
            setIsProcessing(false);
        }
        return;
    }
  };

  // [New] 核心吸附计算函数
  const applySnapping = (x, y, width, height, otherNodes) => {
      let newX = x;
      let newY = y;
      const guides = [];

      // 1. 网格吸附 (Grid Snapping)
      if (canvasSettings.snapToGrid) {
          newX = Math.round(x / canvasSettings.gridSize) * canvasSettings.gridSize;
          newY = Math.round(y / canvasSettings.gridSize) * canvasSettings.gridSize;
      }

      // 2. 智能对齐 (Smart Guides)
      if (canvasSettings.smartGuides && otherNodes.length > 0) {
          const threshold = canvasSettings.snapThreshold / zoom; // 阈值随缩放调整
          const centerX = x + width / 2;
          const centerY = y + height / 2;
          const right = x + width;
          const bottom = y + height;

          let snappedX = false;
          let snappedY = false;

          otherNodes.forEach(target => {
              const tRight = target.x + target.width;
              const tBottom = target.y + target.height;
              const tCenterX = target.x + target.width / 2;
              const tCenterY = target.y + target.height / 2;

              // X轴对齐检查
              if (!snappedX) {
                  const checkX = (val, targetVal) => {
                      if (Math.abs(val - targetVal) < threshold) {
                          newX = targetVal - (val - x); // 调整 x 以匹配对齐
                          snappedX = true;
                          if (canvasSettings.showGuides) guides.push({ type: 'vertical', x: targetVal });
                      }
                  };
                  checkX(x, target.x);       // 左对左
                  checkX(x, tRight);         // 左对右
                  checkX(right, target.x);   // 右对左
                  checkX(right, tRight);     // 右对右
                  checkX(centerX, tCenterX); // 中对中
              }

              // Y轴对齐检查
              if (!snappedY) {
                  const checkY = (val, targetVal) => {
                      if (Math.abs(val - targetVal) < threshold) {
                          newY = targetVal - (val - y);
                          snappedY = true;
                          if (canvasSettings.showGuides) guides.push({ type: 'horizontal', y: targetVal });
                      }
                  };
                  checkY(y, target.y);       // 顶对顶
                  checkY(y, tBottom);        // 顶对底
                  checkY(bottom, target.y);  // 底对顶
                  checkY(bottom, tBottom);   // 底对底
                  checkY(centerY, tCenterY); // 中对中
              }
          });
      }

      return { x: newX, y: newY, guides };
  };

  const onMouseMove = (e) => {
    // [New] 处理框选移动
    if (selectionBox) {
      const coords = getCanvasCoordinates(e.clientX, e.clientY, containerRef, offset, zoom);
      const x = Math.min(selectionBox.startX, coords.x);
      const y = Math.min(selectionBox.startY, coords.y);
      const width = Math.abs(coords.x - selectionBox.startX);
      const height = Math.abs(coords.y - selectionBox.startY);
      setSelectionBox(prev => ({ ...prev, x, y, width, height }));
      return;
    }
    if (activeTool === 'draw' && isDrawing) {
      e.preventDefault();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
          const coords = getCanvasCoordinates(e.clientX, e.clientY, containerRef, offset, zoom);
          setCurrentPoints(prev => [...prev, coords]);
      });
      return; 
    }
    
    // [New] 处理多选组缩放 (Group Resize)
    if (isResizing && dragInfoRef.current.isGroupResize) {
        e.preventDefault();
        const { startMouse, initialBounds, initialPositions } = dragInfoRef.current;
        const dx = (e.clientX - startMouse.x) / zoom;
        const dy = (e.clientY - startMouse.y) / zoom;
        
        // 1. 确定锚点 (Anchor Point) - 对角点
        // 如果拖动的是左侧手柄(w)，锚点在右侧；否则在左侧
        const anchorX = resizeHandle.includes('w') ? initialBounds.x + initialBounds.width : initialBounds.x;
        // 如果拖动的是上方手柄(n)，锚点在下方；否则在上方
        const anchorY = resizeHandle.includes('n') ? initialBounds.y + initialBounds.height : initialBounds.y;

        // 2. 计算原始的新宽高
        let newW = initialBounds.width;
        let newH = initialBounds.height;

        if (resizeHandle.includes('e')) newW = Math.max(1, initialBounds.width + dx);
        if (resizeHandle.includes('w')) newW = Math.max(1, initialBounds.width - dx);
        if (resizeHandle.includes('s')) newH = Math.max(1, initialBounds.height + dy);
        if (resizeHandle.includes('n')) newH = Math.max(1, initialBounds.height - dy);

        // 3. 强制等比例 (Fixed Aspect Ratio)
        const aspect = initialBounds.width / initialBounds.height;
        
        // 判断是以宽为主还是以高为主
        let driveByWidth = true;
        if (['n', 's'].includes(resizeHandle)) {
            driveByWidth = false; // 拖动上下边，高度主导
        } else if (['e', 'w'].includes(resizeHandle)) {
            driveByWidth = true; // 拖动左右边，宽度主导
        } else {
            // 角点：取变化幅度大的那个作为驱动，体验更自然
            const ratioW = newW / initialBounds.width;
            const ratioH = newH / initialBounds.height;
            driveByWidth = Math.abs(ratioW - 1) > Math.abs(ratioH - 1);
        }

        if (driveByWidth) {
            newH = newW / aspect;
        } else {
            newW = newH * aspect;
        }

        // 4. 根据锚点和新宽高计算新坐标
        let newX = anchorX;
        let newY = anchorY;
        
        if (resizeHandle.includes('w')) newX = anchorX - newW;
        if (resizeHandle.includes('n')) newY = anchorY - newH;

        const scaleX = newW / initialBounds.width;
        const scaleY = newH / initialBounds.height;

        setImages(prev => prev.map(img => {
            if (initialPositions[img.id]) {
                const init = initialPositions[img.id];
                const relX = init.x - initialBounds.x;
                const relY = init.y - initialBounds.y;
                return {
                    ...img,
                    x: newX + relX * scaleX,
                    y: newY + relY * scaleY,
                    width: init.width * scaleX,
                    height: init.height * scaleY,
                    fontSize: init.fontSize ? init.fontSize * ((scaleX + scaleY) / 2) : undefined, // 简单缩放字体
                    contentWidth: init.contentWidth ? init.contentWidth * scaleX : undefined,
                    contentHeight: init.contentHeight ? init.contentHeight * scaleY : undefined,
                };
            }
            return img;
        }));
        return;
    }

    // [Modified] 统一拖拽逻辑 (单选/多选都走这里，以便应用吸附)
    if (isDragging && dragInfoRef.current.initialItemPos) {
        e.preventDefault();
        const { startMouse, initialPositions, initialItemPos } = dragInfoRef.current;
        const dx = (e.clientX - startMouse.x) / zoom;
        const dy = (e.clientY - startMouse.y) / zoom;
        
        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) dragInfoRef.current.hasMoved = true;

        // 计算主拖拽对象的原始目标位置
        const rawX = initialItemPos.x + dx;
        const rawY = initialItemPos.y + dy;
        
        // 获取主拖拽对象的尺寸 (用于智能对齐)
        const mainObj = images.find(i => i.id === primarySelectedId);
        const width = mainObj ? mainObj.width : 100;
        const height = mainObj ? mainObj.height : 100;

        // 准备用于对齐参考的其他节点 (排除所有正在拖拽的节点)
        const draggingIds = initialPositions ? Object.keys(initialPositions) : [primarySelectedId];
        const otherNodes = images.filter(img => !draggingIds.includes(img.id));

        // 应用吸附计算
        const { x: snappedX, y: snappedY, guides } = applySnapping(rawX, rawY, width, height, otherNodes);
        setActiveGuides(guides);

        // 计算吸附后的实际偏移量
        const finalDx = snappedX - initialItemPos.x;
        const finalDy = snappedY - initialItemPos.y;

        setImages(prev => prev.map(img => {
            if (draggingIds.includes(img.id)) {
                // 使用 initialPositions (多选) 或 initialItemPos (单选)
                const startX = initialPositions ? initialPositions[img.id].x : initialItemPos.x;
                const startY = initialPositions ? initialPositions[img.id].y : initialItemPos.y;
                // 如果是多选中的非主对象，跟随主对象的偏移量
                if (img.id !== primarySelectedId && initialPositions) {
                    return { ...img, x: startX + finalDx, y: startY + finalDy };
                }
                return { ...img, x: startX + finalDx, y: startY + finalDy };
            }
            return img;
        }));
        return;
    }

    handleCanvasMouseMove(e, {
      containerRef, dragInfoRef, rafRef,
      zoom, offset, 
      isPanning, lastMousePos, 
      activeTool, isDrawing, isRotating, isResizing, isDragging, 
      selectedId: primarySelectedId, selectedObject, // 传入主选ID以兼容拖拽逻辑
      rotationStartAngle, initialRotation, 
      croppingId, resizeHandle, resizeMode,
      setOffset, setLastMousePos, setMousePreviewPos, setCurrentPoints, setImages
    });
  };

  const handleMouseDown = (e, imageId = null, imgPos = null, handleType = null) => {
      if (activeTool === 'draw') { setIsDrawing(true); setCurrentPoints([getCanvasCoordinates(e.clientX, e.clientY, containerRef, offset, zoom)]); onSelect(null); return; }
      if (activeTool === 'spline') {
        const coords = getCanvasCoordinates(e.clientX, e.clientY, containerRef, offset, zoom);
        if (currentPoints.length > 2) { const dist = Math.sqrt(Math.pow(coords.x - currentPoints[0].x, 2) + Math.pow(coords.y - currentPoints[0].y, 2)); if (dist < 15/zoom) { finishSpline(true); return; } }
        setCurrentPoints([...currentPoints, coords]); onSelect(null); return;
      }
      
      // [Modified] 右键菜单逻辑 (保留)
      if (e.button === 2) { 
          if (imageId) { 
              e.preventDefault(); 
              e.stopPropagation(); 
              // [Fix] 如果点击的是已选中的元素之一，保持多选状态；否则单选该元素
              if (!isSelected(imageId)) {
                  onSelect(imageId); 
              }

              // [New] 计算当前鼠标位置下所有重叠的图层 (AABB 碰撞检测)
              const coords = getCanvasCoordinates(e.clientX, e.clientY, containerRef, offset, zoom);
              const overlapping = images.filter(img => 
                  coords.x >= img.x && coords.x <= img.x + img.width &&
                  coords.y >= img.y && coords.y <= img.y + img.height
              ).reverse(); // 倒序，让最上层的排在前面

              const type = images.find(i => i.id === imageId)?.type; 
              setContextMenu({ x: e.clientX, y: e.clientY, targetId: imageId, type, overlapping }); 
          } 
          return; 
      } 
      setContextMenu(null);

      // [Modified] 旋转逻辑 (仅左键)
      if (handleType === 'rotate' && selectedId && e.button === 0) { e.stopPropagation(); if (images.find(i => i.id === selectedId)?.isLocked) return; setIsRotating(true); const obj = images.find(i => i.id === selectedId); const rect = containerRef.current.getBoundingClientRect(); const centerX = (obj.x + obj.width / 2) * zoom + offset.x + rect.left; const centerY = (obj.y + obj.height / 2) * zoom + offset.y + rect.top; const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX); setRotationStartAngle(angle); setInitialRotation(obj.rotation || 0); return; } 
      
      // [Modified] 缩放逻辑 (仅左键)
      if (handleType && (selectedId || imageId === 'selection_group') && e.button === 0) { 
          e.stopPropagation(); 
          
          // [New] 多选组缩放初始化
          if (imageId === 'selection_group') {
             const initialPositions = {};
             selectedId.forEach(id => {
                 const img = images.find(i => i.id === id);
                 if (img) initialPositions[id] = { x: img.x, y: img.y, width: img.width, height: img.height, fontSize: img.fontSize, contentWidth: img.contentWidth, contentHeight: img.contentHeight };
             });
             dragInfoRef.current = {
                 startMouse: { x: e.clientX, y: e.clientY },
                 initialBounds: { ...groupBounds },
                 initialPositions,
                 isGroupResize: true,
                 hasMoved: false
             };
             setIsResizing(true);
             setResizeHandle(handleType);
             return;
          }

          if (images.find(i => i.id === selectedId)?.isLocked) return; setIsResizing(true); setResizeHandle(handleType); const obj = images.find(i => i.id === selectedId); dragInfoRef.current = { startMouse: { x: e.clientX, y: e.clientY }, initialSize: { width: obj.width, height: obj.height }, initialItemPos: { x: obj.x, y: obj.y }, initialContentSize: { width: obj.contentWidth || obj.width, height: obj.contentHeight || obj.height }, initialContentPos: { x: obj.contentX || 0, y: obj.contentY || 0 }, hasMoved: false }; return; 
      } 

      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return; 
      
      // [Modified] 鼠标交互逻辑重构
      // 1. 中键 (button 1) -> 移动画布
      if (e.button === 1) {
          e.preventDefault();
          setIsPanning(true);
          setLastMousePos({ x: e.clientX, y: e.clientY });
          return;
      }

      // 2. 左键 (button 0)
      if (e.button === 0) {
          // 点击元素
          if (imageId !== null) {
              e.stopPropagation();
              
              // Alt + 点击 -> 取消选择 (兼容多选)
              if (e.altKey) {
                  if (isSelected(imageId)) {
                      if (Array.isArray(selectedId)) {
                          const newIds = selectedId.filter(id => id !== imageId);
                          onSelect(newIds.length > 0 ? newIds : null);
                      } else {
                          onSelect(null);
                      }
                  }
                  return;
              }

              // [New] Ctrl + 点击 -> 加选/减选
              if (e.ctrlKey || e.metaKey) {
                  const currentIds = Array.isArray(selectedId) ? selectedId : (selectedId ? [selectedId] : []);
                  let newIds;
                  if (currentIds.includes(imageId)) {
                      newIds = currentIds.filter(id => id !== imageId);
                  } else {
                      newIds = [...currentIds, imageId];
                  }
                  onSelect(newIds.length > 0 ? newIds : null);
                  return;
              }

              if (croppingId && croppingId !== imageId) setCroppingId(null);
              
              // 如果点击的不是已选中的元素（且没按Ctrl），则单选它
              if (!isSelected(imageId)) {
                  onSelect(imageId);
              }
              
              const obj = images.find(i => i.id === imageId);
              if (editingTextId && editingTextId !== imageId) setEditingTextId(null);
              if (!obj.isLocked) {
                  setIsDragging(true);
                  
                  // [Modified] 统一初始化拖拽数据 (单选也填充 initialPositions 以便统一处理)
                  // 如果正在裁切(cropping)，则不进行多选拖拽，交给 handleCanvasMouseMove 处理内容移动
                  if (croppingId === imageId) {
                      dragInfoRef.current = { startMouse: { x: e.clientX, y: e.clientY }, initialItemPos: { x: imgPos.x, y: imgPos.y }, initialContentPos: { x: obj.contentX || 0, y: obj.contentY || 0 }, hasMoved: false };
                  } else {
                      const currentIds = Array.isArray(selectedId) ? selectedId : (selectedId ? [selectedId] : []);
                      // 确保当前点击的元素包含在拖拽列表中
                      // 如果点击了未选中的元素，则只拖拽该元素（单选逻辑已在上面处理，这里主要是数据准备）
                      const dragIds = isSelected(imageId) ? currentIds : [imageId];
                      
                      const initialPositions = {};
                      dragIds.forEach(id => {
                          const it = images.find(i => i.id === id);
                          if (it && !it.isLocked) initialPositions[id] = { x: it.x, y: it.y };
                      });
                      
                      dragInfoRef.current = { startMouse: { x: e.clientX, y: e.clientY }, initialItemPos: { x: imgPos.x, y: imgPos.y }, initialPositions, initialContentPos: { x: obj.contentX || 0, y: obj.contentY || 0 }, hasMoved: false };
                  }
              }
              return;
          }

          // 点击空白处 -> 框选 (仅在选择工具下)
          if (activeTool === 'select' && imageId === null) {
              e.preventDefault();
              const coords = getCanvasCoordinates(e.clientX, e.clientY, containerRef, offset, zoom);
              setSelectionBox({ startX: coords.x, startY: coords.y, x: coords.x, y: coords.y, width: 0, height: 0 });
              onSelect(null);
          }
      }
  };
  
  const handleDoubleClick = (e, imageId, type) => { e.stopPropagation(); if (activeTool === 'spline' && !imageId) { if (currentPoints.length > 1) { finishSpline(false); } return; } if (type === 'text' && viewMode === 'canvas') setEditingTextId(imageId); else if (type === 'image' && viewMode === 'canvas') { setCroppingId(imageId); } onSelect(imageId); };
  const handleMouseUp = (e) => { 
      if (rafRef.current) cancelAnimationFrame(rafRef.current); 
      setIsPanning(false); 
      setActiveGuides([]); // 清除辅助线
      if ((isDragging || isResizing || isRotating) && dragInfoRef.current.hasMoved) { onHistoryRecord && onHistoryRecord(); dragInfoRef.current.hasMoved = false; } 
      if (isDrawing && activeTool === 'draw') { setIsDrawing(false); if(currentPoints.length > 1 && onDrawComplete) { onDrawComplete(currentPoints); } setCurrentPoints([]); } 
      setIsDragging(false); setIsResizing(false); setIsRotating(false); 
      
      // [New] 结束框选
      if (selectionBox) {
          // 查找框选区域内的元素 (选择最上层的一个，因为目前只支持单选)
          const box = selectionBox;
          
          // [New] 判断框选方向
          // 如果 box.x (左上角x) 小于 box.startX (起始x)，说明是向左拖动 (Reverse/Crossing)
          // 否则是向右拖动 (Forward/Window)
          const isCrossing = box.width > 0 && box.x < box.startX;

          const foundIds = [];
          // 倒序遍历，优先选中上层元素
          for (let i = images.length - 1; i >= 0; i--) {
              const img = images[i];
              const imgRight = img.x + img.width;
              const imgBottom = img.y + img.height;
              const boxRight = box.x + box.width;
              const boxBottom = box.y + box.height;

              // 相交检测 (AABB)
              const isIntersecting = (
                  img.x < boxRight &&
                  imgRight > box.x &&
                  img.y < boxBottom &&
                  imgBottom > box.y
              );

              // 包含检测
              const isContained = (
                  img.x >= box.x &&
                  imgRight <= boxRight &&
                  img.y >= box.y &&
                  imgBottom <= boxBottom
              );

              if (isCrossing) {
                  // 反向框选 (右->左): 接触即选中 (Crossing)
                  if (isIntersecting) foundIds.push(img.id);
              } else {
                  // 正向框选 (左->右): 完全包含才选中 (Window)
                  if (isContained) foundIds.push(img.id);
              }
          }
          
          if (foundIds.length > 0) {
              // 如果按住 Ctrl，则追加选择
              if (e && (e.ctrlKey || e.metaKey)) {
                  const currentIds = Array.isArray(selectedId) ? selectedId : (selectedId ? [selectedId] : []);
                  const newIds = [...new Set([...currentIds, ...foundIds])];
                  onSelect(newIds);
              } else {
                  onSelect(foundIds); // 选中所有框选元素
              }
          } else if (!e || (!e.ctrlKey && !e.metaKey)) {
              // 如果没框选到且没按Ctrl，清空选择
              onSelect(null);
          }
          setSelectionBox(null);
      }
  };
  
  // [Fix] Manual wheel listener to support non-passive preventDefault
  useEffect(() => {
      const node = containerRef.current;
      if (!node) return;

      const handleWheelNative = (e) => {
          if (e.ctrlKey || e.metaKey || true) {
              e.preventDefault();
              const { zoom: oldZoom, offset: currentOffset } = transformRef.current;
              const scaleBy = 1.05;
              const newZoom = e.deltaY < 0 ? oldZoom * scaleBy : oldZoom / scaleBy;
              
              const rect = node.getBoundingClientRect();
              const mouseX = e.clientX - rect.left;
              const mouseY = e.clientY - rect.top;
              
              const canvasMouseX = (mouseX - currentOffset.x) / oldZoom;
              const canvasMouseY = (mouseY - currentOffset.y) / oldZoom;
              
              setZoom(newZoom);
              setOffset({ 
                  x: mouseX - canvasMouseX * newZoom, 
                  y: mouseY - canvasMouseY * newZoom 
              });
          }
      };

      node.addEventListener('wheel', handleWheelNative, { passive: false });
      return () => node.removeEventListener('wheel', handleWheelNative);
  }, [setZoom, setOffset]);

  // HandleDrop 使用 uploadImage
  const handleDrop = async (e) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;

    // 逻辑 A: 外部文件拖入
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
            onDropObject({ type: 'image', file, x, y });
        }
        return;
    }

    // 逻辑 B: 内部素材拖放
    const content = e.dataTransfer.getData('content');
    if (content) {
        const sourceIds = JSON.parse(e.dataTransfer.getData('sourceIds') || '[]');
        
        onDropObject({
            type: e.dataTransfer.getData('dragType') === 'chatImage' ? 'image' : 'text',
            content,
            x,
            y,
            sourceIds
        });
    }
  };
  
  const handleDragOver = (e) => e.preventDefault();
  const handleContextMenu = (e) => { e.preventDefault(); };

  const styleLabel = labelStyle(zoom); 
  const styleSelectionBorder = (isSelected, isHighlighted) => selectionBorderStyle(zoom, isSelected, isHighlighted);

  return (
    <div 
      ref={containerRef} className={`flex-1 bg-gray-100 overflow-hidden relative h-full ${activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`} 
      onMouseMove={onMouseMove} 
      onMouseUp={handleMouseUp} 
      onMouseDown={(e) => {
        // [Fix] 点击空白处时，除了取消选择，还要退出文字编辑和画框重命名状态
        if (e.button === 0 && activeTool === 'select' && e.target === containerRef.current) { setEditingTextId(null); setEditingFrameNameId(null); }
        handleMouseDown(e);
      }} 
      onContextMenu={handleContextMenu} onDrop={handleDrop} onDragOver={handleDragOver}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ddd 1px, transparent 1px)', backgroundSize: '20px 20px', backgroundPosition: `${offset.x}px ${offset.y}px`, opacity: 0.5 }} />
      <div style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
        {viewMode === 'tree' && <LinksLayer images={images} highlightedLinks={highlightedLinks} />}
        
        {images.map((img, index) => {
          const isNodeHighlighted = highlightedNodes.has(img.id);
          const isImgSelected = isSelected(img.id);
          const zIndex = img.type === 'frame' ? 0 : (isImgSelected ? 20 : 10);
          return(
          <div key={img.id} 
             onMouseDown={(e) => { if (viewMode === 'canvas' && activeTool === 'select') handleMouseDown(e, img.id, {x: img.x, y: img.y}); else if (viewMode === 'tree') handleMouseDown(e, img.id, {x: img.x, y: img.y}); else if (activeTool !== 'select') handleMouseDown(e); }} 
             onDoubleClick={(e) => handleDoubleClick(e, img.id, img.type)} 
             style={{ position: 'absolute', left: img.x, top: img.y, width: img.width, height: img.height, cursor: viewMode === 'tree' ? 'pointer' : (img.isLocked ? 'not-allowed' : (croppingId === img.id ? 'move' : 'default')), zIndex: zIndex, userSelect: 'none', transform: `rotate(${img.rotation || 0}deg)`, transformOrigin: 'center center', willChange: isDragging && isImgSelected ? 'top, left' : 'auto' }}
             className="transition-shadow duration-100"
          >
            {/* ... 渲染逻辑 ... */}
            {viewMode === 'tree' && <div className="absolute bg-zinc-800 text-white font-mono shadow-sm z-50 pointer-events-none" style={{...styleLabel, top: 'auto', bottom: '100%', right: 'auto'}}>#{index + 1}</div>}
            
            {/* [Modified] 动态渲染所有插槽的角标 (支持自定义插槽) */}
            <div className="absolute left-0 bottom-full flex flex-wrap content-start pointer-events-none z-50 max-w-full" style={{ gap: `${2/zoom}px`, marginBottom: `${2/zoom}px` }}>
                {Object.entries(bindings || {}).map(([slot, bindObj]) => {
                    if (bindObj?.id === img.id) {
                        return (
                            <div key={slot} className="bg-white border border-gray-300 text-gray-600 font-bold shadow-sm flex items-center justify-center select-none whitespace-nowrap" style={styleLabel}>
                                {slot.toUpperCase()}
                            </div>
                        );
                    }
                    return null;
                })}
            </div>
            
            {isImgSelected && <div className={`absolute inset-0 pointer-events-none z-10 rounded-sm ${viewMode === 'tree' ? 'border-blue-600' : (croppingId ? 'border-transparent' : 'border-blue-500')}`} style={styleSelectionBorder(true, false)}></div>}
            {viewMode === 'tree' && isNodeHighlighted && !isImgSelected && <div className="absolute inset-0 border-blue-400 pointer-events-none z-10 rounded-sm" style={styleSelectionBorder(false, true)}></div>}
            
            {img.type === 'image' && ( <>
               {croppingId === img.id && <div style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none', width: '100%', height: '100%', zIndex: 0 }}><img src={img.src} crossOrigin="anonymous" style={{ position: 'absolute', top: img.contentY || 0, left: img.contentX || 0, width: img.contentWidth || '100%', height: img.contentHeight || '100%', opacity: 0.3, maxWidth: 'none', maxHeight: 'none' }} alt="" /></div>}
               <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', pointerEvents: 'none', zIndex: 1, opacity: img.opacity ?? 1, background: img.fill || 'transparent' }}>
                  <img src={img.src} crossOrigin="anonymous" onLoad={(e) => handleImageLoad(img.id, e)} alt={img.id} style={{ position: 'absolute', top: 0, left: 0, width: img.contentWidth || '100%', height: img.contentHeight || '100%', transform: `translate(${img.contentX || 0}px, ${img.contentY || 0}px)`, maxWidth: 'none', maxHeight: 'none', objectFit: 'fill' }} />
               </div>
            </> )}
            {img.type === 'draw' && ( <svg style={{ width: '100%', height: '100%', overflow: 'visible', opacity: img.opacity ?? 1 }}> <path d={renderPath(img.points, img.width, img.height, img.originalWidth, img.originalHeight, false)} stroke={img.stroke} strokeWidth={img.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ filter: img.blur ? `blur(${img.blur}px)` : 'none' }} /> </svg> )}
            {img.type === 'spline' && ( <svg style={{ width: '100%', height: '100%', overflow: 'visible', opacity: img.opacity ?? 1 }}> <path d={renderPath(img.points, img.width, img.height, img.originalWidth, img.originalHeight, img.isClosed)} stroke={img.stroke} strokeWidth={img.strokeWidth} fill={img.fill} strokeLinecap="round" strokeLinejoin="round"/> </svg> )}
            {img.type === 'shape' && (
               <div style={{width:'100%', height:'100%', display:'flex', justifyContent:'center', alignItems:'center', background: viewMode === 'tree' ? img.fill : 'transparent'}}>
                  {img.shapeType === 'rectangle' && (<div style={{ position:'absolute', inset:0, backgroundColor:img.fill, opacity:img.opacity??1, border: viewMode==='tree' ? `${1/zoom}px solid rgba(0,0,0,0.1)` : 'none', boxShadow: viewMode !== 'tree' ? `inset 0 0 0 ${img.strokeWidth}px ${img.stroke}` : 'none' }}/>)}
                  {img.shapeType === 'circle' && (<div style={{ position:'absolute', inset:0, borderRadius:'50%', backgroundColor:img.fill, opacity:img.opacity??1, border: viewMode==='tree' ? `${1/zoom}px solid rgba(0,0,0,0.1)` : 'none', boxShadow: viewMode !== 'tree' ? `inset 0 0 0 ${img.strokeWidth}px ${img.stroke}` : 'none' }}/>)}
                  {img.shapeType === 'triangle' && (<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{overflow:'visible'}}><polygon points="50,0 100,100 0,100" fill={img.fill} stroke={viewMode !== 'tree' ? img.stroke : 'none'} strokeWidth={viewMode !== 'tree' ? img.strokeWidth : 0} opacity={img.opacity??1} strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg>)}
                  {viewMode === 'tree' && <div className="font-bold text-white text-xs z-10 mix-blend-difference">{img.shapeType}</div>}
               </div>
            )}
            {img.type === 'text' && ( editingTextId === img.id ? <textarea value={img.text} autoFocus onChange={(e) => handleUpdateObject({ ...img, text: e.target.value })} onMouseDown={(e) => e.stopPropagation()} className="w-full h-full bg-white/80 resize-none border-blue-500 outline-none p-2" style={{ fontSize: `${img.fontSize}px`, fontFamily: img.fontFamily, fontWeight: img.fontWeight, textAlign: img.align, color: img.fill, WebkitTextStroke: `${img.strokeWidth}px ${img.stroke}`, paintOrder: 'stroke fill', opacity: img.opacity ?? 1, lineHeight: 1.5, borderWidth: `${2/zoom}px`, userSelect: 'text', cursor: 'text' }} /> : <div className="w-full h-full flex items-center p-2" style={{ justifyContent: viewMode==='tree' ? 'center' : (img.align === 'left' ? 'flex-start' : img.align === 'right' ? 'flex-end' : 'center'), whiteSpace: 'pre-wrap', textAlign: viewMode==='tree' ? 'center' : img.align, fontSize: `${img.fontSize}px`, fontFamily: img.fontFamily, fontWeight: img.fontWeight, color: img.fill, WebkitTextStroke: `${img.strokeWidth}px ${img.stroke}`, paintOrder: 'stroke fill', opacity: img.opacity ?? 1, lineHeight: 1.5 }}>{img.text}</div> )}
            {img.type === 'frame' && ( 
               <div className="w-full h-full relative"> 
                  <div style={{ position: 'absolute', inset: 0, backgroundColor: img.fill, opacity: img.opacity ?? 1 }}></div> 
                  {/* [Modified] 虚线框移到画布外侧，更明显 */}
                  <div className="absolute pointer-events-none" style={{ left: `-${2/zoom}px`, top: `-${2/zoom}px`, right: `-${2/zoom}px`, bottom: `-${2/zoom}px`, border: `${2/zoom}px dashed ${img.stroke || '#4b5563'}` }}></div> 
                  <div className="absolute left-0 bg-gray-400 text-white font-mono flex items-center" style={{...styleLabel, top: 'auto', bottom: '100%', pointerEvents: 'auto', cursor: 'text'}}>
                     {editingFrameNameId === img.id ? (
                        // [Fix] 修复无法清空名字的问题：value 逻辑改为允许空字符串，仅在 undefined 时回退
                        <input autoFocus value={img.name !== undefined ? img.name : 'FRAME'} onChange={(e) => handleFrameNameChange(img.id, e.target.value)} onBlur={handleFrameNameBlur} onKeyDown={(e) => e.key === 'Enter' && handleFrameNameBlur()} onMouseDown={(e) => { if(e.button !== 2) e.stopPropagation(); }} className="bg-transparent text-white outline-none" style={{ width: `${(img.name || 'FRAME').length + 2}ch`, minWidth: '40px', fontSize: 'inherit', fontFamily: 'inherit' }}/>
                     ) : (
                        <span onDoubleClick={(e) => { e.stopPropagation(); setEditingFrameNameId(img.id); }}>{img.name || 'FRAME'}</span>
                     )}
                  </div> 
               </div> 
            )}
            <ResizeHandles obj={img} selectedId={(!isMultiSelect && isImgSelected) ? img.id : null} zoom={zoom} croppingId={croppingId} viewMode={viewMode} onMouseDown={handleMouseDown}/>
          </div>
        )})}
        {(isDrawing && activeTool === 'draw' && currentPoints.length > 0) && ( <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', width: '100%', height: '100%', zIndex: 100 }}> <path d={`M ${currentPoints.map(p => `${p.x} ${p.y}`).join(' L ')}`} stroke={drawSettings.stroke} strokeWidth={drawSettings.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ filter: drawSettings.blur ? `blur(${drawSettings.blur}px)` : 'none', opacity: drawSettings.opacity }} /> </svg> )}
        {(activeTool === 'spline' && currentPoints.length > 0) && <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', width: '100%', height: '100%', zIndex: 100 }}>{currentPoints.length > 0 && <path d={`M ${currentPoints.map(p => `${p.x} ${p.y}`).join(' L ')}`} stroke="#0096FF" strokeWidth={2/zoom} fill="none" />}{mousePreviewPos && <line x1={currentPoints[currentPoints.length-1].x} y1={currentPoints[currentPoints.length-1].y} x2={mousePreviewPos.x} y2={mousePreviewPos.y} stroke="#0096FF" strokeWidth={1/zoom} strokeDasharray={`${4/zoom} ${4/zoom}`} />}{currentPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4/zoom} fill="white" stroke="#0096FF" strokeWidth={2/zoom} />)}</svg>}
        
        {/* [New] 渲染框选框 */}
        {selectionBox && (
            <div style={{
                position: 'absolute',
                left: selectionBox.x,
                top: selectionBox.y,
                width: selectionBox.width,
                height: selectionBox.height,
                border: `1px ${selectionBox.x < selectionBox.startX ? 'dashed' : 'solid'} #00a8ff`, // [New] 虚线/实线区分
                backgroundColor: selectionBox.x < selectionBox.startX ? 'rgba(0, 168, 255, 0.1)' : 'rgba(0, 168, 255, 0.2)', // [New] 颜色区分
                pointerEvents: 'none',
                zIndex: 9999
            }} />
        )}

        {/* [New] 渲染智能对齐辅助线 */}
        {activeGuides.map((guide, i) => (
            <div key={i} style={{
                position: 'absolute',
                left: guide.type === 'vertical' ? guide.x : -1000000,
                top: guide.type === 'horizontal' ? guide.y : -1000000,
                width: guide.type === 'vertical' ? `${1/zoom}px` : '2000000px', // 足够宽以覆盖画布
                height: guide.type === 'horizontal' ? `${1/zoom}px` : '2000000px', // 足够高以覆盖画布
                backgroundColor: '#ff00ff', // 醒目的洋红色
                zIndex: 99999,
                pointerEvents: 'none'
            }}/>
        ))}

        {/* [New] 渲染多选组的包围盒与手柄 */}
        {isMultiSelect && groupBounds && (
            <div style={{
                position: 'absolute', left: groupBounds.x, top: groupBounds.y, width: groupBounds.width, height: groupBounds.height,
                pointerEvents: 'none', zIndex: 100
            }}>
                <div style={{
                    position: 'absolute', inset: 0,
                    border: '1px solid #0096FF', pointerEvents: 'none'
                }}/>
                <ResizeHandles 
                    obj={groupBounds} 
                    selectedId={'selection_group'} 
                    zoom={zoom} 
                    viewMode={viewMode}
                    onMouseDown={(e, id, pos, handle) => handleMouseDown(e, 'selection_group', null, handle)}
                />
            </div>
        )}
      </div>
      
      {(selectedObject && !contextMenu && viewMode === 'canvas' || activeTool === 'draw') && ( 
         <FloatingToolbar 
            selectedObject={selectedObject || { type: 'draw', ...drawSettings, id: 'global_draw_settings' }} 
            zoom={zoom} 
            offset={offset} 
            onUpdateObject={selectedObject ? handleUpdateObject : (newSettings) => setDrawSettings(prev => ({ ...prev, ...newSettings }))} 
            onAction={handleToolbarAction} 
            isProcessing={isProcessing}
            isCropping={!!croppingId} 
            isGlobalSettings={!selectedObject && activeTool === 'draw'} 
            resizeMode={resizeMode} 
            onToggleResizeMode={() => setResizeMode(prev => prev === 'crop' ? 'scale' : 'crop')} 
         /> 
      )}
      
      <ContextMenu 
          contextMenu={contextMenu} 
          onLayerAction={onLayerAction} 
          setContextMenu={setContextMenu} 
          activeWorkflow={activeWorkflow} 
          onSelect={onSelect}
          selectedIds={Array.isArray(selectedId) ? selectedId : (selectedId ? [selectedId] : [])}
      />
    </div>
  );
};
export default CanvasBoard;