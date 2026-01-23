/**
 * frontend/src/utils/photoshopUtils.js
 * 处理与 Photoshop 交互的核心逻辑
 * (修复版：清除重复逻辑，统一处理图片裁剪、文字渲染和矢量路径)
 */

// 计算多个节点的包围盒
const getBoundingBox = (nodes) => {
  if (!nodes || nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    const x = node.x;
    const y = node.y;
    const width = node.width;
    const height = node.height;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

/**
 * 生成发送给 Photoshop 的数据包
 */
export const createExportPayload = (selectedNodes, projectId, allNodes = []) => {
  if (!selectedNodes || selectedNodes.length === 0) return null;

  let canvasWidth, canvasHeight, referenceX, referenceY;
  let targetImages = [];

  // 1. 检查是否选中了 Frame (优先处理 Frame 导出)
  const selectedFrame = selectedNodes.find(n => n.type === 'frame');

  if (selectedFrame) {
      // === 模式 A: 导出 Frame (画布模式) ===
      canvasWidth = selectedFrame.width;
      canvasHeight = selectedFrame.height;
      referenceX = selectedFrame.x;
      referenceY = selectedFrame.y;

      // 查找 Frame 内部或与 Frame 相交的所有图片
      if (allNodes && allNodes.length > 0) {
          targetImages = allNodes.filter(node => {
              // 允许导出任何有 src 的节点 (包括转换后的 text/shape)
              if (!node.src && node.type !== 'image') return false; 
              if (node.id === selectedFrame.id) return false; // 排除自身
              
              // 简单的相交检测
              const nodeRight = node.x + node.width;
              const nodeBottom = node.y + node.height;
              const frameRight = selectedFrame.x + selectedFrame.width;
              const frameBottom = selectedFrame.y + selectedFrame.height;

              return !(node.x > frameRight || nodeRight < selectedFrame.x || 
                       node.y > frameBottom || nodeBottom < selectedFrame.y);
          });
      }
  } else {
      // === 模式 B: 导出选中元素 (包围盒模式) ===
      targetImages = selectedNodes.filter(n => n.src || n.type === 'image');
      
      if (targetImages.length === 0) {
          console.warn("没有可导出的图层");
          return null;
      }

      const bbox = getBoundingBox(targetImages);
      if (!bbox) return null;

      canvasWidth = bbox.width;
      canvasHeight = bbox.height;
      referenceX = bbox.x;
      referenceY = bbox.y;
  }

  if (targetImages.length === 0) return null;

  // 3. 构造图层数据
  const layers = targetImages.map(node => ({
      image_path: node.src,
      x: node.x - referenceX,
      y: node.y - referenceY,
      width: node.width,
      height: node.height
  }));

  return {
      action: "export_to_ps",
      project_id: projectId,
      canvas_width: Math.ceil(canvasWidth),
      canvas_height: Math.ceil(canvasHeight),
      layers: layers
  };
};

// [Helper] 将非图片节点转换为 SVG DataURL (用于 Shape 等)
export const nodeToSVG = (node) => {
    const { width, height, fill, stroke, strokeWidth } = node;
    const w = width || 100;
    const h = height || 100;
    
    let content = '';
    
    if (node.type === 'shape') {
        if (node.shapeType === 'rectangle') {
            content = `<rect x="0" y="0" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth || 0}" />`;
        } else if (node.shapeType === 'circle') {
            content = `<circle cx="${w/2}" cy="${h/2}" r="${Math.min(w,h)/2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth || 0}" />`;
        } else if (node.shapeType === 'triangle') {
            content = `<polygon points="${w/2},0 ${w},${h} 0,${h}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth || 0}" />`;
        }
    }

    if (!content) return null;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow: visible;">${content}</svg>`;
    return `data:image/svg+xml;charset=utf-8;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
};

// [Core] 将节点转换为 PNG Blob (栅格化)
export const nodeToPNG = (node) => {
    return new Promise((resolve) => {
        
        // 1. 针对 Text 节点：使用 Canvas API 直接绘制
        if (node.type === 'text') {
            try {
                const canvas = document.createElement('canvas');
                const padding = 0; 
                canvas.width = Math.ceil(node.width || 100) + padding * 2;
                canvas.height = Math.ceil(node.height || 100) + padding * 2;
                const ctx = canvas.getContext('2d');
                
                const fontSize = node.fontSize || 24;
                const fontFamily = node.fontFamily || 'sans-serif';
                const fontWeight = node.fontWeight || 'normal';
                
                let safeFont = fontFamily;
                if (safeFont.includes(' ') && !safeFont.includes('"') && !safeFont.includes("'")) {
                    safeFont = `"${safeFont}"`;
                }
                
                ctx.font = `${fontWeight} ${fontSize}px ${safeFont}`;
                ctx.fillStyle = node.fill || '#000000';
                ctx.textBaseline = 'top'; 
                
                const align = node.align || 'left';
                ctx.textAlign = align;
                
                const lines = (node.text || '').split('\n');
                const lineHeight = fontSize * 1.5; 
                const totalHeight = lines.length * lineHeight;
                const halfLeading = (lineHeight - fontSize) / 2;

                let startY = (canvas.height - totalHeight) / 2 + halfLeading;
                const vAlign = node.verticalAlign || 'middle';
                if (vAlign === 'top') {
                    startY = padding + halfLeading;
                } else if (vAlign === 'bottom') {
                    startY = canvas.height - totalHeight - padding + halfLeading;
                }
                
                let x = padding;
                if (align === 'center') x = canvas.width / 2;
                if (align === 'right') x = canvas.width - padding;
                
                lines.forEach((line, i) => {
                    ctx.fillText(line, x, startY + i * lineHeight);
                    if (node.stroke && node.strokeWidth) {
                        ctx.strokeStyle = node.stroke;
                        ctx.lineWidth = node.strokeWidth;
                        ctx.strokeText(line, x, startY + i * lineHeight);
                    }
                });
                
                canvas.toBlob((blob) => resolve(blob), 'image/png');
                return;
            } catch (e) {
                console.error("Text to PNG failed", e);
                resolve(null);
                return;
            }
        }

        // 2. 针对 Image 节点：强制重新绘制以"烘焙"剪切/缩放/拉伸效果
        if (node.type === 'image') {
            const img = new Image();
            img.crossOrigin = "Anonymous"; // 关键：允许跨域加载
            
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    // 目标尺寸 = 节点在画布上的显示尺寸 (Frame 尺寸)
                    canvas.width = Math.ceil(node.width);
                    canvas.height = Math.ceil(node.height);
                    const ctx = canvas.getContext('2d');

                    // 使用 content* 属性 (编辑器内的实际显示参数)
                    // 默认值处理：如果 contentWidth 不存在，则默认为 node.width (Cover/Fill 行为)
                    const dx = node.contentX || 0;
                    const dy = node.contentY || 0;
                    const dw = node.contentWidth || node.width;
                    const dh = node.contentHeight || node.height;

                    // 将图片绘制到 Canvas 上 (自动处理剪切和缩放，超出部分会被切掉)
                    ctx.drawImage(img, dx, dy, dw, dh);
                    
                    canvas.toBlob((blob) => resolve(blob), 'image/png');
                } catch (e) {
                    console.error("Image bake error (CORS?):", e);
                    resolve(null); // 失败则回退到原图
                }
            };
            img.onerror = (e) => { console.error("Image load failed:", node.src, e); resolve(null); };
            
            // 添加时间戳防止浏览器缓存导致的 CORS 错误 (Canvas污染)
            let src = node.src;
            if (src.startsWith('http')) {
                const separator = src.includes('?') ? '&' : '?';
                src = `${src}${separator}t=${Date.now()}`;
            }
            img.src = src;
            return;
        }

        // 3. 针对 Draw/Spline 节点：使用 Canvas API 直接绘制
        if (node.type === 'draw' || node.type === 'spline') {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(node.width || 100);
                canvas.height = Math.ceil(node.height || 100);
                const ctx = canvas.getContext('2d');

                ctx.strokeStyle = node.stroke || '#000000';
                ctx.lineWidth = node.strokeWidth || (node.type === 'draw' ? 5 : 2);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                if (node.opacity !== undefined) ctx.globalAlpha = node.opacity;
                if (node.type === 'draw' && node.blur) ctx.filter = `blur(${node.blur}px)`;
                if (node.fill && node.fill !== 'transparent') ctx.fillStyle = node.fill;

                if (node.points && node.points.length > 0) {
                    ctx.beginPath();
                    
                    let points = typeof node.points[0] === 'number' ? node.points : node.points.flatMap(p => [p.x, p.y]);

                    // 智能坐标归一化：计算包围盒，将点移动到 (0,0)
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    for(let i=0; i<points.length; i+=2) {
                        const px = points[i];
                        const py = points[i+1];
                        if(px < minX) minX = px;
                        if(py < minY) minY = py;
                        if(px > maxX) maxX = px;
                        if(py > maxY) maxY = py;
                    }
                    
                    // 直接归零：将所有点移动到 (0,0) 开始，确保内容在 Canvas 内
                    const offsetX = minX;
                    const offsetY = minY;
                    
                    // [Fix] 计算缩放比例：根据当前画布大小(node.width)与原始包围盒大小的比例
                    const sx = (maxX - minX) > 0 ? canvas.width / (maxX - minX) : 1;
                    const sy = (maxY - minY) > 0 ? canvas.height / (maxY - minY) : 1;

                    if (points.length >= 2) {
                        ctx.moveTo((points[0] - offsetX) * sx, (points[1] - offsetY) * sy);
                        for (let i = 2; i < points.length; i += 2) {
                            ctx.lineTo((points[i] - offsetX) * sx, (points[i+1] - offsetY) * sy);
                        }
                    }

                    if (node.type === 'spline' && node.isClosed) {
                        ctx.closePath();
                        if (node.fill) ctx.fill();
                    }
                    ctx.stroke();
                }
                
                canvas.toBlob((blob) => resolve(blob), 'image/png');
                return;
            } catch (e) {
                console.error("Draw/Spline to PNG failed", e);
                resolve(null);
                return;
            }
        }

        // 4. 其他类型 (Shape 等)：使用 SVG -> Image -> Canvas
        const svgDataUrl = nodeToSVG(node);
        if (!svgDataUrl) {
            resolve(null);
            return;
        }
        
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(node.width || 100);
            canvas.height = Math.ceil(node.height || 100);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => resolve(blob), 'image/png');
        };
        img.onerror = () => resolve(null);
        img.src = svgDataUrl;
    });
};
