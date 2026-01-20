/**
 * src/tools/DrawTool.js
 * 涂鸦工具核心算法
 */

export const createDrawObject = (points, settings) => {
    if (!points || points.length < 2) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    });

    const padding = 5;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    const width = Math.max(10, maxX - minX);
    const height = Math.max(10, maxY - minY);

    const normalizedPoints = points.map(p => ({
        x: p.x - minX,
        y: p.y - minY
    }));

    return {
        id: `draw_${Date.now()}`,
        type: 'draw',
        points: normalizedPoints,
        x: minX,
        y: minY,
        width: width,
        height: height,
        originalWidth: width,
        originalHeight: height,
        stroke: settings.stroke || '#000000',
        strokeWidth: settings.strokeWidth || 5,
        opacity: settings.opacity ?? 1,
        blur: settings.blur ?? 0,
        rotation: 0,
        isLocked: false
    };
};