import { useCallback } from 'react';
import { createExportPayload, nodeToPNG } from '../utils/photoshopUtils';

export const useLayerActions = ({ 
    canvas, workflow, projectId, wsRef, clientId, uploadAsset 
}) => {
    
    const handleLayerAction = useCallback(async (action, id) => {
        // [New] 前端合成选中项 (Image + Mask -> Transparent PNG)
        if (action === 'composite_selected') {
            const selectedIds = Array.isArray(canvas.selectedId) ? canvas.selectedId : [canvas.selectedId];
            if (selectedIds.length !== 2) return;

            const item1 = canvas.images.find(i => i.id === selectedIds[0]);
            const item2 = canvas.images.find(i => i.id === selectedIds[1]);
            if (!item1 || !item2) return;

            let imageObj = item1;
            let maskObj = item2;
            
            if (item1.name?.toLowerCase().includes('mask') || item1.type === 'frame') {
                maskObj = item1; imageObj = item2;
            } else if (item2.name?.toLowerCase().includes('mask') || item2.type === 'frame') {
                maskObj = item2; imageObj = item1;
            } else {
                maskObj = item2; imageObj = item1;
            }

            const processComposition = async () => {
                try {
                    const loadImg = (src) => new Promise((resolve, reject) => {
                        const img = new Image();
                        img.crossOrigin = "Anonymous";
                        img.onload = () => resolve(img);
                        img.onerror = reject;
                        img.src = src;
                    });

                    const [imgEl, maskEl] = await Promise.all([
                        loadImg(imageObj.src),
                        loadImg(maskObj.src || maskObj.fill)
                    ]);

                    const cvs = document.createElement('canvas');
                    cvs.width = imgEl.naturalWidth;
                    cvs.height = imgEl.naturalHeight;
                    const ctx = cvs.getContext('2d');

                    ctx.drawImage(imgEl, 0, 0);
                    
                    const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
                    
                    const maskCvs = document.createElement('canvas');
                    maskCvs.width = cvs.width;
                    maskCvs.height = cvs.height;
                    const mCtx = maskCvs.getContext('2d');
                    mCtx.drawImage(maskEl, 0, 0, cvs.width, cvs.height);
                    const maskData = mCtx.getImageData(0, 0, cvs.width, cvs.height);

                    for (let i = 0; i < imgData.data.length; i += 4) {
                        imgData.data[i + 3] = maskData.data[i]; 
                    }
                    ctx.putImageData(imgData, 0, 0);

                    cvs.toBlob(async (blob) => {
                        const url = await uploadAsset(blob, `comp_${Date.now()}.png`, 'generation');
                        if (url) {
                            const newImg = {
                                id: `comp_${Date.now()}`,
                                type: 'image',
                                name: 'Composite',
                                src: url,
                                x: imageObj.x + imageObj.width + 50,
                                y: imageObj.y,
                                width: imageObj.width,
                                height: imageObj.height,
                                isLocked: false
                            };
                            canvas.setImages(prev => [...prev, newImg]);
                        }
                    });
                } catch (e) {
                    console.error("Composition failed", e);
                    alert("合成失败，请确保图片允许跨域访问");
                }
            };
            
            processComposition();
            return;
        }

        if (action === 'create_mask_layer') {
            const img = canvas.images.find(i => i.id === id);
            if (img) {
                const newFrame = {
                    id: `mask_frame_${Date.now()}`,
                    type: 'frame',
                    name: 'Mask_Layer',
                    x: img.x,
                    y: img.y,
                    width: img.width,
                    height: img.height,
                    fill: 'rgba(0, 0, 0, 0.5)',
                    stroke: '#00FF00',
                    isLocked: false
                };
                canvas.setImages(prev => [...prev, newFrame]);
                canvas.setSelectedId(newFrame.id);
                canvas.setActiveTool('draw');
                canvas.setDrawSettings(prev => ({ ...prev, stroke: '#FFFFFF', strokeWidth: 20, opacity: 1 }));
            }
            return;
        }

        if (action === 'create_canvas_from_image') {
            const img = canvas.images.find(i => i.id === id);
            if (img) {
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                const gap = 50;

                const newFrame = {
                    id: `frame_${Date.now()}`,
                    type: 'frame',
                    name: 'Canvas',
                    x: img.x + img.width + gap,
                    y: img.y,
                    width: w,
                    height: h,
                    rotation: 0,
                    fill: '#ffffff',
                    stroke: '#4b5563',
                    isLocked: false
                };

                const newImg = {
                    ...img,
                    id: `img_copy_${Date.now()}`,
                    x: newFrame.x,
                    y: newFrame.y,
                    width: w,
                    height: h,
                    contentWidth: w,
                    contentHeight: h,
                    contentX: 0,
                    contentY: 0,
                    isLocked: false
                };

                canvas.setImages(prev => [...prev, newFrame, newImg]);
            }
            return;
        }

        if (action === 'rembg') {
            const img = canvas.images.find(i => i.id === id);
            if (!img || !img.src) return;

            // 这里假设 API_BASE_URL 是全局变量或者需要传入，为了简化，我们假设它在 window 或 config 中
            // 实际项目中最好通过参数传入 API_BASE_URL
            const API_URL = window.API_BASE_URL || "http://localhost:8000"; 

            fetch(`/api/rembg`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: img.src,
                    project_id: projectId,
                    model: 'u2net'
                })
            })
            .then(res => res.json())
            .then(async data => {
                if (data.status === 'success') {
                    let finalSrc = data.image;
                    if (data.image.startsWith('data:') || data.image.startsWith('blob:')) {
                        try {
                            const res = await fetch(data.image);
                            const blob = await res.blob();
                            const url = await uploadAsset(blob, `rembg_${Date.now()}.png`, 'generation');
                            if (url) finalSrc = url;
                        } catch (e) { console.error("Rembg upload failed", e); }
                    }

                    const newImg = {
                        ...img,
                        id: `rembg_${Date.now()}`,
                        src: finalSrc,
                        x: img.x + img.width + 50,
                        name: (img.name || 'Image') + '_NoBG',
                        isGenerated: true
                    };
                    canvas.setImages(prev => [...prev, newImg]);
                    canvas.setSelectedId(newImg.id);
                } else {
                    alert('抠图失败: ' + (data.message || '未知错误'));
                }
            })
            .catch(e => console.error("RemBg error:", e));
            return;
        }

        if (action === 'export_to_ps' || action === 'export_to_ps_new' || action === 'export_to_ps_current') {
            const targetIds = Array.isArray(canvas.selectedId) ? canvas.selectedId : [id];
            const selectedNodes = canvas.images.filter(img => targetIds.includes(img.id));
            
            const nodesToProcess = new Set();
            const shouldBake = (node) => {
                if (node.type === 'frame') return false;
                return true; 
            };
            
            selectedNodes.forEach(node => {
                if (shouldBake(node)) nodesToProcess.add(node);
            });

            const selectedFrame = selectedNodes.find(n => n.type === 'frame');
            if (selectedFrame) {
                canvas.images.forEach(node => {
                    if (node.id === selectedFrame.id) return;
                    if (!shouldBake(node)) return;
                    
                    const nodeRight = node.x + node.width;
                    const nodeBottom = node.y + node.height;
                    const frameRight = selectedFrame.x + selectedFrame.width;
                    const frameBottom = selectedFrame.y + selectedFrame.height;
                    
                    const isInside = !(node.x > frameRight || nodeRight < selectedFrame.x || 
                                       node.y > frameBottom || nodeBottom < selectedFrame.y);
                    
                    if (isInside) nodesToProcess.add(node);
                });
            }

            const processedMap = new Map();
            
            if (nodesToProcess.size > 0) {
                await Promise.all(Array.from(nodesToProcess).map(async (node) => {
                    const pngBlob = await nodeToPNG(node);
                    if (pngBlob) {
                        try {
                            const filename = `export_${node.type}_${Date.now()}.png`;
                            const url = await uploadAsset(pngBlob, filename, 'ps_exchange');
                            if (url) {
                                processedMap.set(node.id, {
                                    ...node,
                                    type: 'image',
                                    src: url,
                                    width: node.width || 100,
                                    height: node.height || 100
                                });
                            }
                        } catch (e) { console.error("Failed to upload converted image:", e); }
                    }
                }));
            }

            const effectiveAllNodes = canvas.images.map(node => processedMap.get(node.id) || node);
            const effectiveSelectedNodes = selectedNodes.map(node => processedMap.get(node.id) || node);

            const payload = createExportPayload(effectiveSelectedNodes, projectId, effectiveAllNodes);
            
            if (payload) {
                if (action === 'export_to_ps_new') {
                    payload.force_new_document = true;
                }

                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        task_id: crypto.randomUUID(),
                        task_type: 'photoshop_export',
                        client_id: clientId,
                        payload: payload
                    }));
                } else {
                    alert("WebSocket 未连接，无法发送");
                }
            } else {
                alert("请选择要导出的图片");
            }
            return;
        }

        if (action === 'save_local') {
            const img = canvas.images.find(i => i.id === id);
            if (img && img.src) {
                fetch(img.src)
                    .then(res => res.blob())
                    .then(blob => {
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `image__${Date.now()}.png`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                    })
                    .catch(e => console.error("Download failed", e));
            }
            return;
        }
        if (action.startsWith('bind_')) {
            const slotName = action.replace('bind_', '');
            const obj = canvas.images.find(i => i.id === id);
            if (obj && workflow.activeWorkflowId) {
                workflow.setAllBindings(prev => ({
                    ...prev,
                    [workflow.activeWorkflowId]: {
                        ...(prev[workflow.activeWorkflowId] || {}),
                        [slotName]: obj
                    }
                }));
            }
            return;
        }
        canvas.handleLayerAction(action, id, workflow.activeWorkflowId, workflow.setAllBindings, uploadAsset);
    }, [canvas, workflow, projectId, wsRef, clientId, uploadAsset]);

    return { handleLayerAction };
};
