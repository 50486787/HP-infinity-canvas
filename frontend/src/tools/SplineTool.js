/**
 * src/tools/SplineTool.js
 * 钢笔工具核心算法
 */

export const createSplineObject = (points, isClosed = true) => {
    // 至少需要2个点才能成线
    if (!points || points.length < 2) return null;

    // 1. 计算包围盒 (Bounding Box)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    });

    // 增加一点内边距，方便选中
    const padding = 5;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = Math.max(10, maxX - minX);
    const height = Math.max(10, maxY - minY);

    // 2. 坐标归一化 (转为相对于包围盒的坐标)
    const normalizedPoints = points.map(p => ({
        x: p.x - minX,
        y: p.y - minY
    }));

    // 3. 返回对象
    return {
        id: `spline_${Date.now()}`,
        type: 'spline',
        x: minX,
        y: minY,
        width: width,
        height: height,
        originalWidth: width,
        originalHeight: height,
        points: normalizedPoints,
        // [FIXED] 关键修复：未闭合时必须无填充
        fill: isClosed ? '#FF6B6B' : 'transparent',
        stroke: '#000000',
        strokeWidth: 2,
        isClosed: isClosed, 
        opacity: 1,
        isLocked: false
    };
};