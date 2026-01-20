/**
 * 图像生成工具 (最终修复版: 钢笔/形状遮罩逻辑修复 + 边缘捕捉优化)
 * 修复：
 * 1. 钢笔(Spline)未闭合线条在生成遮罩时被错误填充的问题
 * 2. 形状(Shape)在无填充只有描边时，遮罩也被错误填充实心的问题
 * 3. [NEW] 合成图像时，从中心点检测改为 AABB 矩形相交检测，解决大图或边缘物体无法捕捉的问题
 */

const PADDING = 8; // 对应 CSS 中的 p-2 (8px)

const loadImage = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // [Modified] 增强跨域处理：对于非 Data URI 和非 Blob URI 的网络图片，启用 CORS
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
        img.crossOrigin = "Anonymous";
    }
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
};

const drawObjectFit = (ctx, img, x, y, width, height) => {
  const imgRatio = img.width / img.height;
  const targetRatio = width / height;
  let sourceX = 0, sourceY = 0, sourceW = img.width, sourceH = img.height;

  if (imgRatio > targetRatio) {
    sourceW = img.height * targetRatio;
    sourceX = (img.width - sourceW) / 2;
  } else {
    sourceH = img.width / targetRatio;
    sourceY = (img.height - sourceH) / 2;
  }

  ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, x, y, width, height);
};

// 离屏缓冲：用于生成纯白遮罩
const createWhiteMaskBuffer = (imgDom) => {
    const buffer = document.createElement('canvas');
    buffer.width = imgDom.naturalWidth || imgDom.width;
    buffer.height = imgDom.naturalHeight || imgDom.height;
    const bCtx = buffer.getContext('2d');
    bCtx.drawImage(imgDom, 0, 0);
    bCtx.globalCompositeOperation = 'source-in';
    bCtx.fillStyle = '#FFFFFF';
    bCtx.fillRect(0, 0, buffer.width, buffer.height);
    return buffer;
};

const wrapText = (ctx, text, maxWidth) => {
  const chars = text.split(''); 
  let lines = [];
  let currentLine = '';

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (char === '\n') {
       lines.push(currentLine);
       currentLine = '';
       continue;
    }
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  return lines;
};

// 路径绘制辅助函数
const drawPath = (ctx, points, width, height, originalWidth, originalHeight, isClosed) => {
    if (!points || points.length === 0) return;
    
    const sx = width / originalWidth;
    const sy = height / originalHeight;

    ctx.beginPath();
    points.forEach((p, i) => {
        const px = p.x * sx;
        const py = p.y * sy;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    
    if (isClosed) ctx.closePath();
};

export const generateImageFromFrame = async (frameObj, allObjects, isMask = false) => {
  // 1. 筛选并排序 (从中心点检测改为 AABB 相交检测)
  const targetObjects = allObjects.filter(obj => {
    if (obj.id === frameObj.id) return false;
    
    // [FIXED] AABB Collision Detection
    // 只要物体矩形与 Frame 矩形有重叠，就算作包含
    const isIntersecting = (
        obj.x < frameObj.x + frameObj.width &&       // 物体左 < 框右
        obj.x + obj.width > frameObj.x &&            // 物体右 > 框左
        obj.y < frameObj.y + frameObj.height &&      // 物体上 < 框下
        obj.y + obj.height > frameObj.y              // 物体下 > 框上
    );
    
    return isIntersecting;
  }).sort((a, b) => (a.zIndex || 1) - (b.zIndex || 1));

  const canvas = document.createElement('canvas');
  canvas.width = frameObj.width;
  canvas.height = frameObj.height;
  const ctx = canvas.getContext('2d');

  // 2. 绘制背景
  if (isMask) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    if (frameObj.fill && frameObj.fill !== 'transparent') {
      ctx.globalAlpha = frameObj.opacity ?? 1;
      ctx.fillStyle = frameObj.fill;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  // 3. 遍历绘制
  for (const obj of targetObjects) {
    ctx.save();
    const relativeX = obj.x - frameObj.x;
    const relativeY = obj.y - frameObj.y;
    const alpha = obj.opacity ?? 1;
    ctx.globalAlpha = alpha;

    ctx.translate(relativeX, relativeY);

    if (obj.rotation) {
      const cx = obj.width / 2;
      const cy = obj.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((obj.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    // A. 图片
    if (obj.type === 'image') {
      try {
        const imgDom = await loadImage(obj.src);
        let drawSource = imgDom;
        if (isMask) drawSource = createWhiteMaskBuffer(imgDom);

        ctx.beginPath();
        ctx.rect(0, 0, obj.width, obj.height);
        ctx.clip();

        if (obj.contentWidth) {
           ctx.drawImage(drawSource, obj.contentX || 0, obj.contentY || 0, obj.contentWidth, obj.contentHeight);
        } else {
           drawObjectFit(ctx, drawSource, 0, 0, obj.width, obj.height);
        }
      } catch (err) { console.error("Export Image Error:", err); }
    } 
    
    // B. 形状 (Shape)
    else if (obj.type === 'shape') {
      ctx.beginPath();
      
      const hasFill = obj.fill && obj.fill !== 'none' && obj.fill !== 'transparent';
      const drawFill = isMask ? (hasFill ? '#FFFFFF' : 'transparent') : obj.fill;
      
      const hasStroke = obj.stroke && obj.stroke !== 'none' && obj.stroke !== 'transparent';
      const drawStroke = isMask ? (hasStroke ? '#FFFFFF' : 'transparent') : obj.stroke;

      if (obj.shapeType === 'circle') {
        ctx.ellipse(obj.width/2, obj.height/2, obj.width/2, obj.height/2, 0, 0, 2 * Math.PI);
      } else if (obj.shapeType === 'triangle') {
        ctx.moveTo(obj.width / 2, 0);
        ctx.lineTo(obj.width, obj.height);
        ctx.lineTo(0, obj.height);
        ctx.closePath();
      } else {
        ctx.rect(0, 0, obj.width, obj.height);
      }

      if (drawFill && drawFill !== 'transparent') { 
          ctx.fillStyle = drawFill; 
          ctx.fill(); 
      }
      if (drawStroke && drawStroke !== 'transparent' && obj.strokeWidth > 0) { 
          ctx.lineWidth = obj.strokeWidth; 
          ctx.strokeStyle = drawStroke; 
          ctx.stroke(); 
      }
    } 

    // C. 涂鸦 (Draw)
    else if (obj.type === 'draw') {
        if (obj.blur > 0) ctx.filter = `blur(${obj.blur}px)`;
        drawPath(ctx, obj.points, obj.width, obj.height, obj.originalWidth, obj.originalHeight, false);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = obj.strokeWidth || 5;
        ctx.strokeStyle = isMask ? '#FFFFFF' : (obj.stroke || '#000');
        ctx.stroke();
        ctx.filter = 'none';
    }

    // D. 钢笔 (Spline)
    else if (obj.type === 'spline') {
        drawPath(ctx, obj.points, obj.width, obj.height, obj.originalWidth, obj.originalHeight, obj.isClosed);
        
        const hasFill = obj.fill && obj.fill !== 'none' && obj.fill !== 'transparent';
        const drawFill = isMask ? (hasFill ? '#FFFFFF' : 'transparent') : obj.fill;

        const hasStroke = obj.stroke && obj.stroke !== 'none' && obj.stroke !== 'transparent';
        const drawStroke = isMask ? (hasStroke ? '#FFFFFF' : 'transparent') : obj.stroke;

        // [FIXED] 只有当路径真正闭合时，才进行填充
        if (obj.isClosed && drawFill && drawFill !== 'transparent') {
            ctx.fillStyle = drawFill;
            ctx.fill();
        }
        
        if (drawStroke && drawStroke !== 'transparent') {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = obj.strokeWidth || 2;
            ctx.strokeStyle = drawStroke;
            ctx.stroke();
        }
    }
    
    // E. 文字 (Text)
    else if (obj.type === 'text') {
      const fontSize = obj.fontSize || 24;
      const fontWeight = obj.fontWeight || 'normal';
      const fontFamily = obj.fontFamily || 'sans-serif';
      
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      ctx.textBaseline = 'top'; 
      ctx.fillStyle = isMask ? '#FFFFFF' : (obj.fill || '#000000');
      
      if (obj.strokeWidth > 0 && obj.stroke !== 'transparent') {
         ctx.lineWidth = obj.strokeWidth;
         ctx.strokeStyle = isMask ? '#FFFFFF' : obj.stroke;
      }

      const textMaxWidth = obj.width - (PADDING * 2);
      const rawLines = (obj.text || '').split('\n');
      let finalLines = [];
      rawLines.forEach(line => finalLines = finalLines.concat(wrapText(ctx, line, textMaxWidth)));

      const lineHeight = fontSize * 1.5;
      const totalHeight = finalLines.length * lineHeight;
      const halfLeading = (lineHeight - fontSize) / 2;
      const startY = (obj.height - totalHeight) / 2 + halfLeading;

      finalLines.forEach((line, index) => {
        const lineY = startY + (index * lineHeight);
        let lineX = 0;
        const lineWidth = ctx.measureText(line).width;

        if (obj.align === 'center') {
          lineX = (obj.width - lineWidth) / 2;
        } else if (obj.align === 'right') {
          lineX = obj.width - PADDING - lineWidth;
        } else {
          lineX = PADDING; 
        }

        if (obj.strokeWidth > 0) ctx.strokeText(line, lineX, lineY);
        ctx.fillText(line, lineX, lineY);
      });
    }

    ctx.restore();
  }

  return canvas.toDataURL('image/png');
};