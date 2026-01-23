/**
 * src/utils/imageHelpers.js
 */

// 生成短 ID (用于文件名后缀)
export const shortId = () => Math.random().toString(36).substr(2, 4);

// 清洗文件名 (虽然后面用ID命名，但保留原始文件名作为 metadata 依然有用)
export const sanitizeName = (name) => {
    if (!name) return 'untitled';
    // 只保留字母、数字、中文、下划线、减号
    return name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\-]/g, '_');
};

// 读取文件并返回详细信息
export const readImageFile = (file) => {
    return new Promise((resolve, reject) => {
      if (!file) reject('No file');
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const src = e.target.result;
        const img = new Image();
        img.onload = () => {
          // 获取扩展名
          let ext = 'png';
          if (file.type) ext = file.type.split('/')[1];
          else if (file.name.includes('.')) ext = file.name.split('.').pop();

          resolve({
            src, // DataURL
            width: img.naturalWidth,
            height: img.naturalHeight,
            rawName: file.name.split('.')[0], // 原始文件名（无后缀）
            ext: ext
          });
        };
        img.onerror = reject;
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
};
  
// 自适应尺寸计算 (防止大图撑爆画布)
export const calculateFitSize = (natW, natH, maxSize = 1000) => {
    let w = natW;
    let h = natH;
    
    if (w > h && w > maxSize) {
      h = (h * maxSize) / w;
      w = maxSize;
    } else if (h > maxSize) {
      w = (w * maxSize) / h;
      h = maxSize;
    }
    
    return { width: w, height: h };
};