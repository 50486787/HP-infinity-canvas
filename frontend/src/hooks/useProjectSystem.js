import { useState, useRef } from 'react';
import { readImageFile, calculateFitSize } from '../utils/imageHelpers';
import { loadProjectFile } from '../utils/fileSystem';

export function useProjectSystem() {
  const [projectUuid] = useState(() => crypto.randomUUID());
  const [fileName, setFileName] = useState('Untitled Project');
  const fileInputRef = useRef(null);

  // 处理图片上传
  const handleFileUpload = async (e, zoom, offset, onImageReady) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const { src, width, height, rawName } = await readImageFile(file);
        
        const viewportWidth = window.innerWidth - 72 - 360; 
        const viewportHeight = window.innerHeight - 64;   
        const centerX = (viewportWidth / 2 - offset.x) / zoom;
        const centerY = (viewportHeight / 2 - offset.y) / zoom;
        const { width: fitW, height: fitH } = calculateFitSize(width, height);

        const newImg = { 
            id: `img_${Date.now()}`, type: 'image', 
            x: centerX - fitW/2, y: centerY - fitH/2, 
            width: fitW, height: fitH, src: src, originalName: rawName,
            contentWidth: null, contentHeight: null, contentX: 0, contentY: 0,
            opacity: 1, originalWidth: fitW, originalHeight: fitH, isLocked: false
        };
        // 回调传回生成的对象
        onImageReady(newImg); 
    } catch (err) { console.error(err); }
    e.target.value = ''; 
  };

  // 处理项目打开
  const handleOpenProject = async (file, onDataLoaded) => {
      try {
          const loadedData = await loadProjectFile(file);
          setFileName(file.name.replace(/\.(json|zip|canvas)$/, ''));
          onDataLoaded(loadedData.images);
      } catch (e) { console.error(e); alert("无法打开文件"); }
  };

  return {
      projectUuid,
      fileName, setFileName,
      fileInputRef,
      handleFileUpload,
      handleOpenProject
  };
}