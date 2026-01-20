import { useState, useEffect, useCallback } from 'react';

const APP_KEY = 'lovart_canvas_state';

// 防抖函数，用于减少 localStorage 的写入频率
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 一个自定义 Hook，用于将应用状态持久化到 localStorage。
 * 它会管理所有需要跨会话保存的状态，并在应用启动时加载它们。
 */
export function usePersistedState() {
  // 标记状态是否已从 localStorage 加载
  const [isLoaded, setIsLoaded] = useState(false);
  
  // --- 1. 定义所有需要持久化的状态 ---
  // 这些是应用的核心数据
  const [images, setImages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTool, setActiveTool] = useState('select');
  const [zoom, setZoom] = useState(0.6);
  const [offset, setOffset] = useState({ x: 40, y: 40 });
  const [drawSettings, setDrawSettings] = useState({ stroke: '#000000', strokeWidth: 5, opacity: 1, blur: 0 });
  const [viewMode, setViewMode] = useState('canvas');
  const [projectName, setProjectName] = useState('未命名项目');
  const [workflows, setWorkflows] = useState([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState(null);
  const [allBindings, setAllBindings] = useState({});
  const [projectUuid, setProjectUuid] = useState(null);

  // --- 2. 从 localStorage 加载状态 (仅在组件首次挂载时执行) ---
  useEffect(() => {
    try {
      const savedState = localStorage.getItem(APP_KEY);
      if (savedState) {
        const restored = JSON.parse(savedState);
        // 逐一恢复状态，确保即使某个字段缺失也不会导致整个应用崩溃
        if (restored.images) setImages(restored.images);
        if (restored.selectedId) setSelectedId(restored.selectedId);
        if (restored.activeTool) setActiveTool(restored.activeTool);
        if (restored.zoom) setZoom(restored.zoom);
        if (restored.offset) setOffset(restored.offset);
        if (restored.drawSettings) setDrawSettings(restored.drawSettings);
        if (restored.viewMode) setViewMode(restored.viewMode);
        if (restored.projectName) setProjectName(restored.projectName);
        if (restored.workflows) setWorkflows(restored.workflows);
        if (restored.activeWorkflowId) setActiveWorkflowId(restored.activeWorkflowId);
        if (restored.allBindings) setAllBindings(restored.allBindings);
        if (restored.projectUuid) setProjectUuid(restored.projectUuid);
      } else {
        // 如果没有保存的状态，说明是首次加载，设置一些默认值
        setProjectUuid(`proj_${Date.now()}`);
        setImages([
          { id: 'frame1', type: 'frame', name: '海报主图', x: 100, y: 100, width: 1920, height: 1080, fill: '#ffffff', stroke: '#9ca3af', originalWidth: 1920, originalHeight: 1080, isLocked: false },
          { id: 'text_intro', type: 'text', x: 760, y: 500, width: 400, height: 60, text: '点击左侧图片图标\n上传真实图片', fill: '#52525b', fontSize: 32, align:'center', originalWidth: 400, originalHeight: 60, isLocked: false}
        ]);
      }
    } catch (error) {
      console.error("从 localStorage 加载状态失败:", error);
      // 如果解析出错，也要设置默认值以保证应用能正常运行
      setProjectUuid(`proj_${Date.now()}`);
      setImages([
        { id: 'frame1', type: 'frame', name: '海报主图', x: 100, y: 100, width: 1920, height: 1080, fill: '#ffffff', stroke: '#9ca3af', originalWidth: 1920, originalHeight: 1080, isLocked: false },
        { id: 'text_intro', type: 'text', x: 760, y: 500, width: 400, height: 60, text: '点击左侧图片图标\n上传真实图片', fill: '#52525b', fontSize: 32, align:'center', originalWidth: 400, originalHeight: 60, isLocked: false}
      ]);
    }
    // 标记加载完成
    setIsLoaded(true);
  }, []); // 空依赖数组确保此 effect 仅运行一次

  // --- 3. 将当前状态保存到 localStorage (使用防抖) ---
  const saveState = useCallback(debounce(() => {
    // 确保初始状态加载完毕后再开始保存，防止初始的空状态覆盖掉已存的状态
    if (!isLoaded) return;
    
    try {
      const stateToSave = {
        images, selectedId, activeTool, zoom, offset, 
        drawSettings, viewMode, projectName, workflows, 
        activeWorkflowId, allBindings, projectUuid
      };
      localStorage.setItem(APP_KEY, JSON.stringify(stateToSave));
      console.log("画布状态已保存到 localStorage。");
    } catch (error) {
      console.error("保存状态到 localStorage 失败:", error);
    }
  }, 500), [ // 防抖延迟 500ms
    // 依赖项列表包含所有需要保存的状态
    isLoaded, images, selectedId, activeTool, zoom, offset, 
    drawSettings, viewMode, projectName, workflows, 
    activeWorkflowId, allBindings, projectUuid
  ]);

  // 只要依赖项列表中的任何一个状态发生变化，就调用 saveState
  useEffect(() => {
    saveState();
  }, [saveState]);

  // --- 4. 提供一个重置函数，用于清空画布并恢复到初始状态 ---
  const resetState = useCallback(() => {
    const newUuid = `proj_${Date.now()}`;
    const defaultImages = [
      { id: 'frame1', type: 'frame', name: '海报主图', x: 100, y: 100, width: 1920, height: 1080, fill: '#ffffff', stroke: '#9ca3af', originalWidth: 1920, originalHeight: 1080, isLocked: false },
      { id: 'text_intro', type: 'text', x: 760, y: 500, width: 400, height: 60, text: '点击左侧图片图标\n上传真实图片', fill: '#52525b', fontSize: 32, align:'center', originalWidth: 400, originalHeight: 60, isLocked: false}
    ];
    
    // 重置所有状态
    setImages(defaultImages);
    setSelectedId(null);
    setActiveTool('select');
    setZoom(0.6);
    setOffset({ x: 40, y: 40 });
    setDrawSettings({ stroke: '#000000', strokeWidth: 5, opacity: 1, blur: 0 });
    setViewMode('canvas');
    setProjectName('未命名项目');
    setWorkflows([]);
    setActiveWorkflowId(null);
    setAllBindings({});
    setProjectUuid(newUuid);

    // 立即将重置后的状态保存到 localStorage
    try {
        const stateToSave = {
            images: defaultImages, selectedId: null, activeTool: 'select', zoom: 0.6, offset: { x: 40, y: 40 },
            drawSettings: { stroke: '#000000', strokeWidth: 5, opacity: 1, blur: 0 }, viewMode: 'canvas', 
            projectName: '未命名项目', workflows: [], activeWorkflowId: null, allBindings: {}, projectUuid: newUuid
        };
        localStorage.setItem(APP_KEY, JSON.stringify(stateToSave));
        console.log("画布状态已重置。");
    } catch (error) {
        console.error("保存重置状态到 localStorage 失败:", error);
    }
  }, []);

  // 返回所有状态和它们的设置函数，以及加载状态和重置函数
  return {
    isLoaded,
    images, setImages,
    selectedId, setSelectedId,
    activeTool, setActiveTool,
    zoom, setZoom,
    offset, setOffset,
    drawSettings, setDrawSettings,
    viewMode, setViewMode,
    projectName, setProjectName,
    workflows, setWorkflows,
    activeWorkflowId, setActiveWorkflowId,
    allBindings, setAllBindings,
    projectUuid, setProjectUuid,
    resetState
  };
}