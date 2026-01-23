// canvasUtils.js

// [新增] 获取画布坐标的通用函数
export const getCanvasCoordinates = (clientX, clientY, containerRef, offset, zoom) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return { 
        x: (clientX - rect.left - offset.x) / zoom, 
        y: (clientY - rect.top - offset.y) / zoom 
    };
};

// ... 原有的其他函数 ...
export const getBezierPath = (startX, startY, endX, endY) => {
    const dist = Math.abs(endX - startX);
    const cp1x = startX + dist * 0.5;
    const cp2x = endX - dist * 0.5;
    return `M ${startX} ${startY} C ${cp1x} ${startY} ${cp2x} ${endY} ${endX} ${endY}`;
};

export const renderPath = (points, w, h, ow, oh, closed) => { 
    if(!points) return ''; 
    const sx = w/ow, sy = h/oh; 
    let d = points.map((p,i) => `${i===0?'M':'L'} ${p.x*sx} ${p.y*sy}`).join(' '); 
    if(closed) d += ' Z'; 
    return d; 
};

export const labelStyle = (zoom) => ({ 
    padding: `${1/zoom}px ${4/zoom}px`, 
    fontSize: `${9/zoom}px`, 
    borderWidth: `${1/zoom}px`, 
    top: `${-18/zoom}px`, 
    borderRadius: `${2/zoom}px` 
});

export const selectionBorderStyle = (zoom, isSelected, isHighlighted) => {
    const width = 2/zoom;
    if (isSelected) return { borderWidth: width, margin: -width };
    if (isHighlighted) return { borderWidth: width, margin: -width, borderStyle: 'dashed' };
    return {};
};