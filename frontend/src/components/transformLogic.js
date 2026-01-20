// transformLogic.js

/**
 * 计算裁剪模式下的变换 (Cropping)
 * 逻辑：
 * 1. 拖动角 (Corner) -> 锁定宽高比缩放
 * 2. 拖动边 (Edge) -> 自由调整宽高
 */
export const calculateCropTransform = ({
    resizeHandle,
    dx,
    dy,
    initialContentSize,
    initialContentPos,
    baseObj
}) => {
    const baseW = initialContentSize.width || baseObj.width;
    const baseH = initialContentSize.height || baseObj.height;
    const baseX = initialContentPos.x || 0;
    const baseY = initialContentPos.y || 0;
    const ratio = baseW / baseH;

    let newW = baseW, newH = baseH, newX = baseX, newY = baseY;
    const isCorner = ['nw', 'ne', 'sw', 'se'].includes(resizeHandle);

    if (isCorner) {
        // --- 逻辑 A：拉动角 -> 锁定比例 ---
        if (resizeHandle.includes('w')) {
            newW = Math.max(10, baseW - dx);
            newX = baseX + (baseW - newW); 
        } else {
            newW = Math.max(10, baseW + dx);
        }
        newH = newW / ratio; // 强制高度

        if (resizeHandle.includes('n')) {
            newY = baseY + (baseH - newH);
        }
    } else {
        // --- 逻辑 B：拉动边 -> 任意比例 ---
        if(resizeHandle.includes('e')) newW = Math.max(10, baseW + dx);
        if(resizeHandle.includes('w')) { 
            newW = Math.max(10, baseW - dx); 
            newX = baseX + dx; 
        }
        if(resizeHandle.includes('s')) newH = Math.max(10, baseH + dy);
        if(resizeHandle.includes('n')) { 
            newH = Math.max(10, baseH - dy); 
            newY = baseY + dy; 
        }
    }

    return { contentWidth: newW, contentHeight: newH, contentX: newX, contentY: newY };
};

/**
 * 计算普通物体缩放 (Object Resizing)
 * 逻辑：
 * 1. 拖动角 -> 锁定比例
 * 2. 拖动边 -> 自由调整（除非被锁定）
 */
export const calculateObjectResize = ({
    resizeHandle,
    dx,
    dy,
    initialSize,
    initialItemPos,
    lockedWidth,
    lockedHeight
}) => {
    let newWidth = initialSize.width;
    let newHeight = initialSize.height;
    let newX = initialItemPos.x;
    let newY = initialItemPos.y;
    let contentOffsetX = 0;
    let contentOffsetY = 0;

    const isCorner = ['nw', 'ne', 'sw', 'se'].includes(resizeHandle);
    const initialRatio = initialSize.width / initialSize.height;

    // 1. 处理宽度和水平位移
    if (!lockedWidth) {
        if (resizeHandle.includes('e')) newWidth = Math.max(10, initialSize.width + dx);
        if (resizeHandle.includes('w')) {
            newWidth = Math.max(10, initialSize.width - dx);
            newX = initialItemPos.x + dx;
            contentOffsetX = -dx;
        }
    }

    // 2. 处理高度和垂直位移
    if (isCorner) {
        // 角拖动：强制锁定比例
        newHeight = newWidth / initialRatio;
        if (resizeHandle.includes('n')) {
            const heightDiff = newHeight - initialSize.height;
            newY = initialItemPos.y - heightDiff;
            contentOffsetY = heightDiff;
        }
    } else {
        // 边拖动
        if (!lockedHeight) {
            if (resizeHandle.includes('s')) newHeight = Math.max(10, initialSize.height + dy);
            if (resizeHandle.includes('n')) {
                newHeight = Math.max(10, initialSize.height - dy);
                newY = initialItemPos.y + dy;
                contentOffsetY = -dy;
            }
        }
    }

    return { newWidth, newHeight, newX, newY, contentOffsetX, contentOffsetY };
};