// canvasInteraction.js
import { getCanvasCoordinates } from './canvasUtils';
import { calculateCropTransform, calculateObjectResize } from './transformLogic';

export const handleCanvasMouseMove = (e, state) => {
    const {
        // Refs
        containerRef, dragInfoRef, rafRef,
        // 状态变量
        zoom, offset, 
        isPanning, lastMousePos, 
        activeTool, isDrawing, isRotating, isResizing, isDragging, 
        selectedId, selectedObject, 
        rotationStartAngle, initialRotation, 
        croppingId, resizeHandle, resizeMode,
        // Setter 函数
        setOffset, setLastMousePos, setMousePreviewPos, setCurrentPoints, setImages
    } = state;

    e.preventDefault();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    rafRef.current = requestAnimationFrame(() => {
        // 使用工具函数计算坐标
        const coords = getCanvasCoordinates(e.clientX, e.clientY, containerRef, offset, zoom);

        // 1. 画布拖拽 (Panning)
        if (isPanning) { 
            setOffset(prev => ({ 
                x: prev.x + e.clientX - lastMousePos.x, 
                y: prev.y + e.clientY - lastMousePos.y 
            })); 
            setLastMousePos({ x: e.clientX, y: e.clientY }); 
            return; 
        }

        // 2. 连线预览 (Spline Preview)
        if (activeTool === 'spline') {
            setMousePreviewPos(coords);
        }

        // 3. 自由绘制 (Draw) - LOGIC MOVED TO CanvasBoard.jsx
        
        // 4. 旋转 (Rotating)
        if (isRotating && selectedObject) {
            const rect = containerRef.current.getBoundingClientRect();
            const centerX = (selectedObject.x + selectedObject.width/2)*zoom + offset.x + rect.left;
            const centerY = (selectedObject.y + selectedObject.height/2)*zoom + offset.y + rect.top;
            const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
            
            let rotationDiff = (currentAngle - rotationStartAngle) * (180 / Math.PI);
            
            setImages(prev => prev.map(img => 
                img.id === selectedId ? { ...img, rotation: (initialRotation + rotationDiff) } : img
            ));
            dragInfoRef.current.hasMoved = true;
            return;
        }

        const dx = (e.clientX - dragInfoRef.current.startMouse.x) / zoom;
        const dy = (e.clientY - dragInfoRef.current.startMouse.y) / zoom;
        
        if ((isResizing || isDragging) && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) { 
            dragInfoRef.current.hasMoved = true; 
        }
        
        // 5. 缩放 (Resizing) - 包含裁剪和普通缩放
        if (isResizing && selectedObject && !selectedObject.isLocked) {
            const { initialSize, initialItemPos, initialContentSize, initialContentPos } = dragInfoRef.current;
            
            // A. 裁剪模式
            if (croppingId === selectedId) {
                const newDims = calculateCropTransform({
                    resizeHandle, dx, dy,
                    initialContentSize, initialContentPos,
                    baseObj: selectedObject
                });
                setImages(prev => prev.map(img => img.id === selectedId ? { ...img, ...newDims } : img));
            } 
            // B. 普通缩放
            else {
                const { newWidth, newHeight, newX, newY, contentOffsetX, contentOffsetY } = calculateObjectResize({
                    resizeHandle, dx, dy,
                    initialSize, initialItemPos,
                    lockedWidth: selectedObject.lockedWidth,
                    lockedHeight: selectedObject.lockedHeight
                });

                setImages(prev => prev.map(img => { 
                    if (img.id !== selectedId) return img; 
                    if (img.type === 'image') { 
                        if (resizeMode === 'scale') { 
                            const ratioX = newWidth / initialSize.width; 
                            const ratioY = newHeight / initialSize.height; 
                            return { 
                                ...img, width: newWidth, height: newHeight, x: newX, y: newY, 
                                contentWidth: initialContentSize.width * ratioX, 
                                contentHeight: initialContentSize.height * ratioY, 
                                contentX: initialContentPos.x * ratioX, 
                                contentY: initialContentPos.y * ratioY 
                            }; 
                        } else { 
                            return { 
                                ...img, width: newWidth, height: newHeight, x: newX, y: newY, 
                                contentX: initialContentPos.x + contentOffsetX, 
                                contentY: initialContentPos.y + contentOffsetY 
                            }; 
                        } 
                    } 
                    return { ...img, width: newWidth, height: newHeight, x: newX, y: newY }; 
                }));
            }
            return;
        }

        // 6. 拖拽移动 (Dragging)
        if (isDragging && selectedId && !selectedObject.isLocked) {
            const { initialItemPos, initialContentPos } = dragInfoRef.current;
            if (croppingId === selectedId) { 
                setImages(prev => prev.map(img => img.id === selectedId ? { 
                    ...img, 
                    contentX: initialContentPos.x + dx, 
                    contentY: initialContentPos.y + dy 
                } : img)); 
            } else { 
                setImages(prev => prev.map(img => img.id === selectedId ? { 
                    ...img, 
                    x: initialItemPos.x + dx, 
                    y: initialItemPos.y + dy 
                } : img)); 
            }
        }
    });
};