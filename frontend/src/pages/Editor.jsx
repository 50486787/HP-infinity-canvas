import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import RightPanel from '../components/RightPanel';
import CanvasBoard from '../components/CanvasBoard';
import ViewModeToggle from '../components/ViewModeToggle'; 
import HelpModal from '../components/HelpModal';
import CanvasSettingsModal from '../components/CanvasSettingsModal'; // [New]

import { useCanvasState } from '../hooks/useCanvasState';
import { useWorkflowSystem } from '../hooks/useWorkflowSystem';
import { useProjectSystem } from '../hooks/useProjectSystem';
import { useAutoSave } from '../hooks/useAutoSave';
import { useLayerActions } from '../hooks/useLayerActions'; // [New]

import { API_BASE_URL } from '../config';

// ... (保留 urlToBase64 函数) ...
const urlToBase64 = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("❌ urlToBase64 failed for:", url, e);
        return null;
    }
};

export default function Editor() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  
  const localFileInputRef = useRef(null);
  const uploadingIds = useRef(new Set());

  const canvas = useCanvasState();
  const workflow = useWorkflowSystem();
  const project = useProjectSystem();

  const [isRestored, setIsRestored] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Synced');
  const [showHelpModal, setShowHelpModal] = useState(false);
  
  // [New] 画布吸附设置状态
  const [showCanvasSettings, setShowCanvasSettings] = useState(false);
  const [canvasSettings, setCanvasSettings] = useState({
      snapToGrid: true,
      gridSize: 20,
      smartGuides: true,
      snapThreshold: 5,
      showGuides: true
  });

  // ... (保留 apiConfig 状态和 useEffect) ...
  const [apiConfig, setApiConfig] = useState(() => {
      try {
          const saved = localStorage.getItem('editor_api_config');
          if (saved) {
              const parsed = JSON.parse(saved);
              if (!parsed.profiles) {
                  if (parsed.apiKey && parsed._encoded) {
                      parsed.apiKey = atob(parsed.apiKey);
                  }
                  return {
                      activeId: 'default',
                      profiles: [{
                          id: 'default',
                          name: 'Default Profile',
                          model: parsed.model || "gemini/gemini-2.5-flash-image",
                          apiKey: parsed.apiKey || "",
                          baseUrl: parsed.baseUrl || "",
                          contextLimit: parsed.contextLimit || 10
                      }]
                  };
              }
              parsed.profiles = parsed.profiles.map(p => {
                  if (p.apiKey && p._encoded) {
                      return { ...p, apiKey: atob(p.apiKey), _encoded: undefined };
                  }
                  return p;
              });
              return parsed;
          }
      } catch (e) { console.warn("Failed to load API config", e); }
      return {
          activeId: 'default',
          profiles: [{
              id: 'default',
              name: 'Default Profile',
              model: "gemini/gemini-2.5-flash-image",
              apiKey: "",
              baseUrl: "",
              contextLimit: 10
          }]
      };
  });

  useEffect(() => {
      try {
          const toSave = {
              activeId: apiConfig.activeId,
              profiles: apiConfig.profiles.map(p => {
                  const copy = { ...p };
                  if (copy.apiKey) {
                      copy.apiKey = btoa(copy.apiKey);
                      copy._encoded = true;
                  }
                  return copy;
              })
          };
          localStorage.setItem('editor_api_config', JSON.stringify(toSave));
      } catch (e) { console.error("Failed to save API config", e); }
  }, [apiConfig]);

  const [clientId] = useState(() => crypto.randomUUID());
  const wsRef = useRef(null);

  // ... (保留 Refs 和 WebSocket 逻辑) ...
  const setChatMessagesRef = useRef(workflow.setChatMessages);
  useEffect(() => { setChatMessagesRef.current = workflow.setChatMessages; }, [workflow.setChatMessages]);
  const activeSessionSourcesRef = useRef(workflow.activeSessionSources);
  useEffect(() => { activeSessionSourcesRef.current = workflow.activeSessionSources; }, [workflow.activeSessionSources]);
  const canvasRef = useRef(canvas);
  useEffect(() => { canvasRef.current = canvas; }, [canvas]);
  const projectIdRef = useRef(projectId);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

  useEffect(() => {
      if (!API_BASE_URL) return;
      try {
          const url = new URL(API_BASE_URL);
          url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
          url.pathname = `/ws/${clientId}`;
          
          console.log("🔌 Connecting to WebSocket:", url.toString());
          const ws = new WebSocket(url.toString());
          wsRef.current = ws;

          ws.onopen = () => console.log("✅ WebSocket Connected");
          ws.onmessage = (event) => {
              try {
                  const msg = JSON.parse(event.data);
                  // ... (保留 WebSocket 消息处理逻辑) ...
                  if (msg.type === 'event' && msg.data && msg.data.event === 'assets_imported') {
                      const { project_id, assets } = msg.data;
                      if (project_id === projectIdRef.current) {
                          const currentCanvas = canvasRef.current;
                          const viewCenterX = (window.innerWidth / 2 - currentCanvas.offset.x) / currentCanvas.zoom;
                          const viewCenterY = (window.innerHeight / 2 - currentCanvas.offset.y) / currentCanvas.zoom;
                          const newItems = assets.map((asset, index) => ({
                              id: `bridge_img_${Date.now()}_${index}`,
                              type: 'image',
                              name: asset.original_path ? asset.original_path.split(/[\\/]/).pop() : 'Bridge Image',
                              src: `${API_BASE_URL}${asset.url}`,
                              x: viewCenterX - 500 + (index * 40),
                              y: viewCenterY - 500 + (index * 40),
                              width: 1000, height: 1000, opacity: 1, isLocked: false
                          }));
                          currentCanvas.setImages(prev => [...prev, ...newItems]);
                      }
                      return;
                  }
                  if (msg.type === 'complete' && msg.data && msg.data.canvas_info) {
                      const { canvas_info, new_objects } = msg.data;
                      const currentCanvas = canvasRef.current;
                      const viewCenterX = (window.innerWidth / 2 - currentCanvas.offset.x) / currentCanvas.zoom;
                      const viewCenterY = (window.innerHeight / 2 - currentCanvas.offset.y) / currentCanvas.zoom;
                      const newFrame = {
                          id: `frame_${Date.now()}`,
                          type: 'frame',
                          name: 'Photoshop Import',
                          x: viewCenterX - canvas_info.width / 2,
                          y: viewCenterY - canvas_info.height / 2,
                          width: canvas_info.width, height: canvas_info.height,
                          fill: '#ffffff', stroke: '#4b5563', isLocked: false
                      };
                      const importedLayers = new_objects.map(obj => ({
                          ...obj,
                          id: obj.id || `ps_layer_${Date.now()}_${Math.random()}`,
                          type: 'image',
                          x: newFrame.x + obj.attrs.x,
                          y: newFrame.y + obj.attrs.y,
                          width: obj.attrs.width, height: obj.attrs.height,
                          src: `${API_BASE_URL}${obj.attrs.src}`,
                          opacity: obj.attrs.opacity, name: obj.attrs.name, isLocked: false
                      }));
                      currentCanvas.setImages(prev => [...prev, newFrame, ...importedLayers]);
                      return; 
                  }
                  if (msg.type === 'complete' && msg.data && msg.data.status === 'success' && msg.data.message && msg.data.message.includes('Exported')) {
                      console.log("✅ Photoshop Export Success:", msg.data.message);
                      return;
                  }
                  if (msg.type === 'complete') {
                      const { data } = msg.data; 
                      const content = data?.content;
                      const images = data?.images;
                      if (content) {
                          setChatMessagesRef.current(prev => [...prev, { role: 'assistant', type: 'card', text: content, sourceIds: activeSessionSourcesRef.current }]);
                      }
                      if (images && Array.isArray(images)) {
                          images.forEach(img => {
                              setChatMessagesRef.current(prev => [...prev, { role: 'assistant', type: 'card', image: img, sourceIds: activeSessionSourcesRef.current }]);
                          });
                      }
                  } else if (msg.type === 'error') {
                      setChatMessagesRef.current(prev => [...prev, { role: 'assistant', type: 'card', text: `Error: ${msg.data.message}` }]);
                  }
              } catch (e) { console.error("WS Message Error", e); }
          };
          return () => { };
      } catch (e) { console.error("Invalid API_BASE_URL", e); }
  }, [clientId]);

  // ... (保留项目加载逻辑) ...
  useEffect(() => {
    if (!projectId) return;
    fetch(`${API_BASE_URL}/api/projects/${projectId}`)
      .then(res => res.json())
      .then(async data => {
        if (data.status === 'success' && data.project) {
           const p = data.project;
           if (p.layers) {
               const restoredLayers = p.layers.map(layer => {
                   if (layer.type === 'image' && layer.src && !layer.src.startsWith('http') && !layer.src.startsWith('data:')) {
                       return { ...layer, src: `${API_BASE_URL}/files/${projectId}/${layer.src}` };
                   }
                   return layer;
               });
               canvas.setImages(restoredLayers);
           }
           if (p.name) project.setFileName(p.name);
           if (p.workflowRef) {
               if (p.workflowRef === 'AI 助手') {
               } else {
                   try {
                       const wfRes = await fetch(`${API_BASE_URL}/api/workflows/${p.workflowRef}`);
                       if (wfRes.ok) {
                           const wfData = await wfRes.json();
                           const newWf = { ...wfData, id: p.workflowRef, name: p.workflowRef };
                           workflow.setWorkflows(prev => {
                               if (prev.some(w => w.id === newWf.id)) return prev;
                               return [...prev, newWf];
                           });
                           workflow.setActiveWorkflowId(newWf.id);
                       }
                   } catch (e) { console.error("Failed to load referenced workflow:", e); }
               }
           }
           setIsRestored(true);
        }
      })
      .catch(e => console.error("加载项目失败:", e));
  }, [projectId]);

  // ... (保留 getCleanProjectData, saveToServer, handleDownloadJSON, handleExportZip) ...
  const getCleanProjectData = () => {
      const projectUrlPrefix = `${API_BASE_URL}/files/${projectId}/`;
      const cleanLayers = canvas.images.map(layer => {
          if (layer.type === 'image' && layer.src && layer.src.startsWith(projectUrlPrefix)) {
              return { ...layer, src: layer.src.replace(projectUrlPrefix, '') };
          }
          return layer;
      });
      const activeWf = workflow.workflows.find(w => w.id === workflow.activeWorkflowId);
      return {
          layers: cleanLayers,
          name: project.fileName,
          canvas: { width: 1080, height: 1080 },
          workflowRef: activeWf ? activeWf.name : null
      };
  };

  const saveToServer = async () => {
      if (!projectId || !isRestored) return;
      setSaveStatus('Saving');
      const projectData = getCleanProjectData();
      try {
          await fetch(`${API_BASE_URL}/api/projects/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: projectId, data: projectData })
          });
          setSaveStatus('Synced');
      } catch (e) {
          console.error('Auto-save failed', e);
          setSaveStatus('Error');
      }
  };

  useEffect(() => {
      if (!isRestored) return;
      setSaveStatus('Unsaved');
      const timer = setTimeout(() => { saveToServer(); }, 3000);
      return () => clearTimeout(timer);
  }, [canvas.images, project.fileName, workflow.activeWorkflowId, projectId, isRestored]);

  const handleDownloadJSON = () => {
      const projectData = getCleanProjectData();
      const jsonString = JSON.stringify(projectData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.fileName || 'project'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleExportZip = async () => {
      if (!projectId) return;
      await saveToServer();
      window.location.href = `${API_BASE_URL}/api/projects/${projectId}/export`;
  };

  const restoreProjectData = async (data) => {
      if (!data) return;
      const rawLayers = Array.isArray(data) ? data : (data.layers || data.images || []);
      const restoredLayers = rawLayers.map(layer => {
         if (layer.type === 'image' && layer.src && !layer.src.startsWith('http') && !layer.src.startsWith('data:')) {
             return { ...layer, src: `${API_BASE_URL}/files/${projectId}/${layer.src}` };
         }
         return layer;
      });
      canvas.updateImages(restoredLayers);
      if (data.workflowRef) {
          let targetWf = workflow.workflows.find(w => w.id === data.workflowRef);
          if (!targetWf) {
              try {
                  const res = await fetch(`${API_BASE_URL}/api/workflows/${data.workflowRef}`);
                  if (res.ok) {
                      const wfData = await res.json();
                      const newWf = { ...wfData, id: data.workflowRef, name: data.workflowRef };
                      workflow.setWorkflows(prev => {
                          if (prev.some(w => w.id === newWf.id)) return prev;
                          return [...prev, newWf];
                      });
                      targetWf = newWf;
                  }
              } catch (e) { console.error(e); }
          }
          if (targetWf) workflow.setActiveWorkflowId(data.workflowRef);
      }
  };

  const activeWorkflow = workflow.workflows.find(w => w.id === workflow.activeWorkflowId);
  useAutoSave({ images: canvas.images, workflows: workflow.workflows, fileName: project.fileName }, project.projectUuid);

  const handleAddWorkflow = useCallback((workflowData) => {
    let fileName = workflowData.name;
    if (!fileName.toLowerCase().endsWith('.json')) fileName += '.json';
    const fileBasedId = fileName; 
    const newWorkflow = { ...workflowData, id: fileBasedId, name: fileName };
    workflow.setWorkflows((prevWorkflows) => {
      const index = prevWorkflows.findIndex((w) => w.id === fileBasedId);
      if (index !== -1) {
        const newWorkflows = [...prevWorkflows];
        newWorkflows[index] = newWorkflow;
        return newWorkflows;
      } else {
        return [...prevWorkflows, newWorkflow];
      }
    });
    workflow.setActiveWorkflowId(fileBasedId);
    try {
        const content = typeof workflowData.json === 'string' ? JSON.parse(workflowData.json) : workflowData.json;
        fetch(`${API_BASE_URL}/api/workflows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: fileName, content: content })
        }).then(res => { if (res.ok) console.log(`工作流 [] 已同步`); });
    } catch (e) { console.error("无法保存工作流到后端", e); }
  }, [workflow]);

  const uploadAsset = async (blob, filename, type = 'input') => {
      if (!projectId) return null;
      const formData = new FormData();
      formData.append('file', blob, filename);
      formData.append('project_id', String(projectId));
      formData.append('type', type);
      try {
          const res = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', body: formData });
          const data = await res.json();
          if (data.status === 'success') {
              const url = data.file.url;
              if (url.startsWith('http')) return url;
              const baseUrl = API_BASE_URL.replace(/\/+$/, '');
              const encodedPath = url;
              const path = encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`;
              return `${baseUrl}${path}`;
          }
          return null;
      } catch (e) {
          console.error("Upload asset error:", e);
          return null;
      }
  };

  // [New] 使用 useLayerActions Hook 替代原有的 handleLayerActionWrapper
  const { handleLayerAction: hookLayerAction } = useLayerActions({
      canvas, workflow, projectId, wsRef, clientId, uploadAsset
  });

  // [Fix] 重新在 Editor 中实现 rembg，确保 API_BASE_URL 正确，并处理 Hook 可能缺失的环境变量问题
  const handleLayerAction = useCallback(async (action, id) => {
      if (action === 'rembg') {
          const img = canvas.images.find(i => i.id === id);
          if (!img || !img.src) return;

          try {
              const res = await fetch(`${API_BASE_URL}/api/rembg`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      image: img.src,
                      project_id: projectId,
                      model: 'u2net'
                  })
              });
              const data = await res.json();
              
              if (data.status === 'success') {
                  let finalSrc = data.image;
                  if (data.image.startsWith('data:') || data.image.startsWith('blob:')) {
                      const r = await fetch(data.image);
                      const b = await r.blob();
                      const u = await uploadAsset(b, `rembg_${Date.now()}.png`, 'generation');
                      if (u) finalSrc = u;
                  } else if (!data.image.startsWith('http')) {
                      const baseUrl = API_BASE_URL.replace(/\/+$/, '');
                      // [Fix] 后端现在返回原始文件名，前端直接拼接即可，浏览器会自动处理请求编码
                      const encodedPath = data.image; 
                      const path = encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`;
                      finalSrc = `${baseUrl}${path}`;
                  }

                  const newImg = {
                      ...img,
                      id: `rembg_${Date.now()}`,
                      src: finalSrc,
                      x: img.x + img.width + 50,
                      name: (img.name || 'Image') + '_NoBG',
                      isGenerated: true,
                      isLocked: false
                  };
                  console.log("抠图成功，图片 URL:", finalSrc);
                  canvas.setImages(prev => [...prev, newImg]);
                  canvas.setSelectedId(newImg.id);
              } else {
                  alert('抠图失败: ' + (data.message || '未知错误'));
              }
          } catch (e) {
              console.error("RemBg error:", e);
              alert("抠图请求失败");
          }
          return;
      }
      hookLayerAction(action, id);
  }, [canvas.images, projectId, uploadAsset, hookLayerAction]);

  // ... (保留 handleExecuteWorkflow, handleFileUpload, handleDropObject, handleSidebarAdd) ...
  const handleExecuteWorkflow = async (type, chatInputText = "") => {
      // ... (代码太长省略，保持原样) ...
      // 这里需要完整保留原有的 handleExecuteWorkflow 逻辑
      // 为了节省篇幅，假设这里代码不变
      const { image: inputImage, mask: inputMask, prompt: inputPrompt } = workflow.currentBindings;
      let sourceIds = Object.values(workflow.currentBindings || {}).map(obj => obj?.id).filter(Boolean);
      if (sourceIds.length === 0 && workflow.activeSessionSources.length > 0) sourceIds = workflow.activeSessionSources;
      
      if (type === 'comfy') {
          const activeWorkflow = workflow.workflows.find(w => w.id === workflow.activeWorkflowId);
          if (!activeWorkflow) return;

          try {
              const inputs = {};
              for (const m of (activeWorkflow.mappings || [])) {
                  const bindingKey = m.slot_name === 'base_image' ? 'image' : m.slot_name;
                  const binding = workflow.currentBindings[bindingKey];
                  if (binding) {
                      let value = binding.text || binding.src;
                      if (binding.type === 'image' && binding.src) {
                          value = await urlToBase64(binding.src);
                      }
                      if (!inputs[m.node_id]) inputs[m.node_id] = {};
                      inputs[m.node_id][m.field_name] = value;
                  }
              }

              const response = await fetch(`${API_BASE_URL}/api/run`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      workflow: JSON.parse(activeWorkflow.json),
                      inputs,
                      output_nodes: activeWorkflow.outputNodes,
                      project_id: projectId
                  })
              });

              const resData = await response.json();
              if (resData.status === 'success' && resData.data && resData.data.length > 0) {
                  const refObj = inputImage || canvas.images[0] || { x: 100, y: 100, width: 512, height: 512 };
                  const newItems = [];
                  for (const [index, item] of resData.data.entries()) {
                      const isObj = typeof item === 'object' && item !== null;
                      const type = isObj ? item.type : 'image';
                      const value = isObj ? item.value : item;
                      const x = refObj.x + refObj.width + 50 + (index * (refObj.width + 20));
                      const y = refObj.y;

                      if (type === 'image') {
                          let resultUrl = value;
                          if (typeof resultUrl === 'string' && (resultUrl.startsWith('data:image') || resultUrl.startsWith('blob:'))) {
                              try {
                                  const b64Res = await fetch(resultUrl);
                                  const blob = await b64Res.blob();
                                  const uploaded = await uploadAsset(blob, `gen_${Date.now()}_${index}.png`, 'generation');
                                  if (uploaded) resultUrl = uploaded;
                              } catch (e) { console.error("Failed to upload generated image", e); }
                          } else if (typeof resultUrl === 'string' && !resultUrl.startsWith('http')) {
                              resultUrl = `${API_BASE_URL}${resultUrl}`;
                          }

                          const newImg = {
                              id: `result_img_${Date.now()}_${index}`, sourceIds, type: 'image',
                              x, y, width: refObj.width, height: refObj.height, 
                              src: resultUrl, opacity: 1, isLocked: false, isGenerated: true
                          };
                          newItems.push(newImg);
                      } else if (type === 'text') {
                          const newText = {
                              id: `result_text_${Date.now()}_${index}`, sourceIds, type: 'text',
                              x, y, width: 800, height: 400,
                              text: String(value), fontSize: 24, fill: '#000000', isLocked: false, align: 'left', isGenerated: true
                          };
                          newItems.push(newText);
                      }
                  }
                  canvas.updateImages([...canvas.images, ...newItems]);
              } else { alert(`执行失败: ${resData.message || '未知错误'}`); }
          } catch (e) { console.error("Workflow execution failed:", e); alert("连接后端失败"); }
      } else if (type === 'api') {
          if (sourceIds.length > 0) workflow.setActiveSessionSources(sourceIds);
          
          const text = chatInputText || (inputPrompt ? inputPrompt.text : "");
          if (!text) return;

          const userMsg = { role: 'user', type: 'card', text, image: inputImage ? inputImage.src : null, sourceIds };
          workflow.setChatMessages(prev => [...prev, userMsg]);

          const activeProfile = apiConfig.profiles.find(p => p.id === apiConfig.activeId) || apiConfig.profiles[0];
          const formatContent = (t, img) => {
              if (!img) return t;
              return [
                  { type: "text", text: t || " " },
                  { type: "image_url", image_url: { url: img } }
              ];
          };

          const historyLimit = activeProfile.contextLimit || 10;
          const historyMsgs = workflow.chatMessages.slice(-historyLimit);

          const messages = await Promise.all(historyMsgs.map(async m => {
              let img = null;
              if (m.image && m.role === 'user') {
                  img = m.image.startsWith('data:') ? m.image : await urlToBase64(m.image);
              }
              return { role: m.role, content: formatContent(m.text, img) };
          }));

          let currentImg = null;
          if (inputImage && inputImage.src) {
              currentImg = await urlToBase64(inputImage.src);
          } else {
              const lastImageMsg = [...workflow.chatMessages].reverse().find(m => m.image);
              if (lastImageMsg && lastImageMsg.image) {
                  currentImg = await urlToBase64(lastImageMsg.image);
              }
          }
          messages.push({ role: 'user', content: formatContent(text, currentImg) });
          
          let currentMask = null;
          if (inputMask && inputMask.src) {
              try { currentMask = await urlToBase64(inputMask.src); }
              catch (e) { console.error("Failed to load current mask", e); }
          }

          const isImageModel = activeProfile.model.toLowerCase().includes('image') || activeProfile.model.toLowerCase().includes('dall-e');
          const protocol = isImageModel ? "litellm_image" : "litellm";

          const payloadData = {
              protocol: protocol,
              model: activeProfile.model, 
              api_key: activeProfile.apiKey,
              project_id: projectId,
          };

          if (activeProfile.baseUrl && activeProfile.baseUrl.trim()) {
              payloadData.base_url = activeProfile.baseUrl.trim();
          }

          if (isImageModel) {
              payloadData.prompt = text;
              if (currentImg) payloadData.image = currentImg;
              if (currentMask) payloadData.mask = currentMask;
          } else {
              payloadData.messages = messages;
          }

          const payload = {
              task_id: crypto.randomUUID(),
              task_type: "external_api",
              client_id: clientId,
              payload: payloadData
          };

          fetch(`${API_BASE_URL}/task/submit`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          }).catch(e => {
              console.error("API Submit Failed", e);
              workflow.setChatMessages(prev => [...prev, { role: 'assistant', type: 'card', text: "发送失败: 无法连接服务器" }]);
          });
      }
  };

  const handleFileUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = await uploadAsset(file, file.name, 'input');
      if (url) {
          const newImg = {
              id: `img_${Date.now()}`,
              type: 'image',
              name: file.name,
              src: url,
              x: (window.innerWidth / 2 - canvas.offset.x) / canvas.zoom - 600, 
              y: (window.innerHeight / 2 - canvas.offset.y) / canvas.zoom - 600,
              width: 1200, height: 1200, rotation: 0, opacity: 1, isLocked: false
          };
          canvas.updateImages([...canvas.images, newImg]);
          canvas.setSelectedId(newImg.id);
      } else { alert('上传失败'); }
      if (localFileInputRef.current) localFileInputRef.current.value = '';
  };

  const handleDropObject = async (dropData) => {
      if (!dropData) return;
      if (dropData.id) { canvas.updateImages([...canvas.images, dropData]); return; }
      const id = `drop_${Date.now()}`;
      let newObj = null;
      if (dropData.type === 'image') {
          let src = dropData.content;
          if (dropData.file) {
              const url = await uploadAsset(dropData.file, dropData.file.name, 'input');
              if (url) src = url;
              else src = URL.createObjectURL(dropData.file);
          } else if (typeof src === 'string' && (src.startsWith('data:image') || src.startsWith('blob:'))) {
              try {
                  const res = await fetch(src);
                  const blob = await res.blob();
                  const uploadedUrl = await uploadAsset(blob, `drop_${Date.now()}.png`, 'input');
                  if (uploadedUrl) src = uploadedUrl;
              } catch (e) { console.error("Drop upload failed", e); }
          }
          newObj = {
              id, type: 'image', x: dropData.x - 600, y: dropData.y - 600, width: 1200, height: 1200,
              src: src, sourceIds: dropData.sourceIds || [], opacity: 1, isLocked: false, isGenerated: false
          };
      } else if (dropData.type === 'text') {
          newObj = {
              id, type: 'text', x: dropData.x, y: dropData.y, width: 800, height: 400,
              text: dropData.content, fontSize: 32, fill: '#000000', sourceIds: dropData.sourceIds || [], isLocked: false, align: 'left'
          };
      }
      if (newObj) { canvas.updateImages([...canvas.images, newObj]); canvas.setSelectedId(id); }
  };

  const handleSidebarAdd = (type, contentOrUrl) => {
      if (type === 'image') {
          if (typeof contentOrUrl === 'string' && contentOrUrl.startsWith('http')) {
              const newImg = {
                  id: crypto.randomUUID(),
                  type: 'image',
                  name: 'Uploaded Image',
                  src: contentOrUrl,
                  x: 100 - canvas.offset.x,
                  y: 100 - canvas.offset.y,
                  width: 1200, height: 1200, rotation: 0, opacity: 1, isLocked: false
              };
              canvas.updateImages([...canvas.images, newImg]);
              canvas.setSelectedId(newImg.id);
              return; 
          }
          if (localFileInputRef.current) localFileInputRef.current.click();
          return;
      }
      if (type === 'text') {
          const newText = {
              id: `text_${Date.now()}`,
              type: 'text',
              name: 'Text',
              x: (window.innerWidth / 2 - canvas.offset.x) / canvas.zoom - 400, 
              y: (window.innerHeight / 2 - canvas.offset.y) / canvas.zoom - 200,
              width: 800, height: 100,
              text: "双击编辑文本", fontSize: 32, fill: '#000000', isLocked: false, align: 'left'
          };
          canvas.updateImages([...canvas.images, newText]);
          canvas.setSelectedId(newText.id);
          return;
      }
      canvas.handleAddObject(type, localFileInputRef);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 text-gray-900 font-sans">
      {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
      
      {/* [New] 画布设置弹窗 */}
      <CanvasSettingsModal 
        isOpen={showCanvasSettings} 
        onClose={() => setShowCanvasSettings(false)}
        settings={canvasSettings}
        onSettingsChange={setCanvasSettings}
      />

      <input type="file" ref={localFileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
      <input type="file" ref={project.fileInputRef} className="hidden" accept=".json,image/*" />

      <Sidebar 
          activeTool={canvas.activeTool} 
          onToolSelect={canvas.setActiveTool} 
          onAddObject={handleSidebarAdd}
          onOpenSettings={() => setShowCanvasSettings(true)} // [New] 传递打开设置的回调
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header 
            fileName={project.fileName} setFileName={project.setFileName}
            canUndo={canvas.canUndo} canRedo={canvas.canRedo}
            onUndo={() => { const prev = canvas.undo(); if(prev) canvas.setImages(prev); }}
            onRedo={() => { const next = canvas.redo(); if(next) canvas.setImages(next); }}
            onSaveStructure={handleDownloadJSON}
            onPackProject={handleExportZip}
            onBack={() => navigate('/')}
            saveStatus={saveStatus}
            onShowHelp={() => setShowHelpModal(true)}
            onOpen={async (f) => {
                if (f && f.name && f.name.toLowerCase().endsWith('.json')) {
                    try {
                        const text = await f.text();
                        const data = JSON.parse(text);
                        restoreProjectData(data);
                    } catch (e) {
                        console.error("Error reading project file:", e);
                        alert("Failed to read project file");
                    }
                } else {
                    project.handleOpenProject(f, restoreProjectData);
                }
            }}
        />
        
        <div className="flex-1 flex overflow-hidden relative">
          <ViewModeToggle viewMode={canvas.viewMode} onViewModeChange={canvas.setViewMode} />
          
          <CanvasBoard 
             images={canvas.images} setImages={canvas.setImages} 
             selectedId={canvas.selectedId} onSelect={canvas.setSelectedId} 
             activeTool={canvas.activeTool} 
             zoom={canvas.zoom} setZoom={canvas.setZoom} 
             offset={canvas.offset} setOffset={canvas.setOffset}
             drawSettings={canvas.drawSettings} setDrawSettings={canvas.setDrawSettings}
             viewMode={canvas.viewMode}
             onSplineComplete={canvas.handleSplineComplete} 
             onDrawComplete={canvas.handleDrawComplete}
             onLayerAction={handleLayerAction} // [Modified] 使用 Hook 返回的 handler
             bindings={workflow.currentBindings}
             activeWorkflow={activeWorkflow}
             onDropObject={handleDropObject} 
             onHistoryRecord={(manualState) => canvas.takeSnapshot(manualState || canvas.images)}
             canvasSettings={canvasSettings} // [New] 传递吸附设置
          />
          
          <RightPanel 
            workflows={workflow.workflows} activeWorkflowId={workflow.activeWorkflowId} bindings={workflow.currentBindings}
            onSwitchWorkflow={workflow.setActiveWorkflowId} onAddWorkflow={handleAddWorkflow}
            onDeleteWorkflow={workflow.handleDeleteWorkflow}
            onClearBinding={workflow.handleClearBinding}
            onExecute={handleExecuteWorkflow} chatMessages={workflow.chatMessages} onNewChat={workflow.handleNewChat}
            apiConfig={apiConfig} onApiConfigChange={setApiConfig}
          />
        </div>
      </div>
    </div>
  );
}
