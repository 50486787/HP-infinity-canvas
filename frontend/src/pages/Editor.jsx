// src/pages/Editor.jsx
import React, { useCallback, useEffect, useState, useRef } from 'react'; // [Modified] 引入 useRef
import { useParams, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import RightPanel from '../components/RightPanel';
import CanvasBoard from '../components/CanvasBoard';
import ViewModeToggle from '../components/ViewModeToggle'; 
import HelpModal from '../components/HelpModal'; // 引入帮助弹窗

// ... imports ...
import { useCanvasState } from '../hooks/useCanvasState';
import { useWorkflowSystem } from '../hooks/useWorkflowSystem';
import { useProjectSystem } from '../hooks/useProjectSystem';
import { useAutoSave } from '../hooks/useAutoSave';

import { saveProjectPackage, saveProjectStructure } from '../utils/fileSystem';
import { API_BASE_URL } from '../config';

// [Modified] 增强版 urlToBase64，增加错误日志
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
  
  // [New] 本地文件上传 Ref，完全接管上传逻辑
  const localFileInputRef = useRef(null);
  const uploadingIds = useRef(new Set()); // [New] 记录正在上传的图片ID，防止重复上传

  // ... useEffect debug ...
  useEffect(() => { console.log("Current Project ID:", projectId); }, [projectId]);

  const canvas = useCanvasState();
  const workflow = useWorkflowSystem();
  const project = useProjectSystem();

  const [isRestored, setIsRestored] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Synced');
  const [showHelpModal, setShowHelpModal] = useState(false);

  // [New] API Config State with Persistence & Obfuscation (带持久化和混淆的配置状态)
  const [apiConfig, setApiConfig] = useState(() => {
      try {
          const saved = localStorage.getItem('editor_api_config');
          if (saved) {
              const parsed = JSON.parse(saved);
              
              // [Migration] 兼容旧格式：如果没有 profiles 字段，则迁移为多配置格式
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

              // 新格式：解码每个 profile 的 Key
              parsed.profiles = parsed.profiles.map(p => {
                  if (p.apiKey && p._encoded) {
                      return { ...p, apiKey: atob(p.apiKey), _encoded: undefined };
                  }
                  return p;
              });
              return parsed;
          }
      } catch (e) { console.warn("Failed to load API config", e); }
      
      // 默认初始状态
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

  // Auto-save API Config to LocalStorage (自动保存配置到本地存储)
  useEffect(() => {
      try {
          const toSave = {
              activeId: apiConfig.activeId,
              profiles: apiConfig.profiles.map(p => {
                  const copy = { ...p };
                  // 保存前对 Key 进行 Base64 编码混淆
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

  // [New] WebSocket Client ID & Connection
  const [clientId] = useState(() => crypto.randomUUID());
  const wsRef = useRef(null);

  // [Fix] Use ref to keep setChatMessages stable for WebSocket callback
  const setChatMessagesRef = useRef(workflow.setChatMessages);
  useEffect(() => {
      setChatMessagesRef.current = workflow.setChatMessages;
  }, [workflow.setChatMessages]);

  // [New] Ref to track active session sources for WebSocket callbacks
  const activeSessionSourcesRef = useRef(workflow.activeSessionSources);
  useEffect(() => {
      activeSessionSourcesRef.current = workflow.activeSessionSources;
  }, [workflow.activeSessionSources]);

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
                  console.log("📩 WS Message:", msg);
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
          return () => { 
              // [Fix] 防止 React Strict Mode 下 WebSocket 快速重连导致的后端连接丢失问题
              // 我们不再显式关闭连接，而是依赖浏览器在页面卸载时自动关闭
              // if (ws.readyState === 1) ws.close(); 
          };
      } catch (e) { console.error("Invalid API_BASE_URL", e); }
  }, [clientId]);

  // ... useEffect load project ...
  useEffect(() => {
    if (!projectId) return;

    console.log("正在加载项目:", projectId);
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
               // [Fix] 如果是 "AI 助手" 这种虚拟工作流，跳过后端获取，防止 404
               if (p.workflowRef === 'AI 助手') {
                   console.log("ℹ️ Skipping fetch for virtual workflow: AI 助手");
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
                           console.log(`✅ Loaded referenced workflow: ${p.workflowRef}`);
                       }
                   } catch (e) { console.error("Failed to load referenced workflow:", e); }
               }
           }
           setIsRestored(true);
        }
      })
      .catch(e => console.error("加载项目失败:", e));
  }, [projectId]);

  // ... getCleanProjectData ...
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

  // ... saveToServer ...
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
          console.log('☁️ Auto-saved to server');
      } catch (e) {
          console.error('Auto-save failed', e);
          setSaveStatus('Error');
      }
  };

  // ... useEffect auto save ...
  useEffect(() => {
      if (!isRestored) return;
      setSaveStatus('Unsaved');
      const timer = setTimeout(() => { saveToServer(); }, 3000);
      return () => clearTimeout(timer);
  }, [canvas.images, project.fileName, workflow.activeWorkflowId, projectId, isRestored]);

  // ... handleDownloadJSON ...
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

  // ... handleExportZip ...
  const handleExportZip = async () => {
      if (!projectId) return;
      await saveToServer();
      window.location.href = `${API_BASE_URL}/api/projects/${projectId}/export`;
  };

  // [New] 提取项目恢复逻辑，供加载和导入使用
  const restoreProjectData = async (data) => {
      if (!data) {
          console.error("Failed to load project: data is empty or invalid");
          return;
      }

      // [Fix] Support 'layers' from new save format & 'images' from old format
      const rawLayers = Array.isArray(data) ? data : (data.layers || data.images || []);
      
      // [Fix] Convert relative paths back to absolute URLs for display
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

  // ... handleAddWorkflow ...
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

  // [New] 通用资源上传函数：将 Blob/File 上传到当前项目目录
  const uploadAsset = async (blob, filename, type = 'input') => {
      if (!projectId) return null;
      const formData = new FormData();
      formData.append('file', blob, filename);
      formData.append('project_id', String(projectId));
      formData.append('type', type); // [New] 区分 input/generation

      try {
          const res = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', body: formData });
          const data = await res.json();
          return data.status === 'success' ? data.file.url : null;
      } catch (e) {
          console.error("Upload asset error:", e);
          return null;
      }
  };

  // ... handleExecuteWorkflow ...
  const handleExecuteWorkflow = async (type, chatInputText = "") => {
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
                  
                  // [Modified] 使用 for...of 支持异步上传
                  for (const [index, item] of resData.data.entries()) {
                      const isObj = typeof item === 'object' && item !== null;
                      const type = isObj ? item.type : 'image';
                      const value = isObj ? item.value : item;
                      const x = refObj.x + refObj.width + 50 + (index * (refObj.width + 20));
                      const y = refObj.y;

                      if (type === 'image') {
                          let resultUrl = value;
                          // [New] 如果是 Base64/Blob，先上传固化
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

          // [Modified] 获取当前激活的配置
          const activeProfile = apiConfig.profiles.find(p => p.id === apiConfig.activeId) || apiConfig.profiles[0];

          // [Modified] Helper to format content for Vision models (Text + Image)
          const formatContent = (t, img) => {
              if (!img) return t;
              return [
                  { type: "text", text: t || " " },
                  { type: "image_url", image_url: { url: img } }
              ];
          };

          // Prepare messages for backend
          // 1. Process history messages (convert images to base64 if needed)
          const historyLimit = activeProfile.contextLimit || 10;
          const historyMsgs = workflow.chatMessages.slice(-historyLimit);

          const messages = await Promise.all(historyMsgs.map(async m => {
              let img = null;
              // [Fix] 关键修复：只允许 USER 角色携带图片。
              // 大多数模型（Gemini, GPT-4）不支持 Assistant 历史消息中包含图片，这会导致报错或图片被忽略。
              if (m.image && m.role === 'user') {
                  img = m.image.startsWith('data:') ? m.image : await urlToBase64(m.image);
              }
              return { role: m.role, content: formatContent(m.text, img) };
          }));

          // 2. Process current message
          let currentImg = null;
          if (inputImage && inputImage.src) {
              // 使用增强版 urlToBase64，如果失败会在控制台看到红色错误
              currentImg = await urlToBase64(inputImage.src);
          } else {
              // [New] Implicit Context: 如果当前没有绑定图片，自动携带最近一张历史图片
              // 这解决了“多轮修改”时，AI 无法看到上一轮生成图片的问题
              const lastImageMsg = [...workflow.chatMessages].reverse().find(m => m.image);
              if (lastImageMsg && lastImageMsg.image) {
                  console.log("🔄 Auto-attaching context image:", lastImageMsg.image);
                  currentImg = await urlToBase64(lastImageMsg.image);
              }
          }
          messages.push({ role: 'user', content: formatContent(text, currentImg) });
          
          // [New] Process current mask (for inpainting)
          let currentMask = null;
          if (inputMask && inputMask.src) {
              try { currentMask = await urlToBase64(inputMask.src); }
              catch (e) { console.error("Failed to load current mask", e); }
          }

          // [Modified] Auto-detect protocol for image generation models
          const isImageModel = activeProfile.model.toLowerCase().includes('image') || activeProfile.model.toLowerCase().includes('dall-e');
          const protocol = isImageModel ? "litellm_image" : "litellm";

          const payloadData = {
              protocol: protocol,
              model: activeProfile.model, 
              api_key: activeProfile.apiKey,
              project_id: projectId, // [New] 传递项目ID以便后端保存图片
          };

          if (activeProfile.baseUrl && activeProfile.baseUrl.trim()) {
              payloadData.base_url = activeProfile.baseUrl.trim();
          }

          if (isImageModel) {
              payloadData.prompt = text;
              if (currentImg) payloadData.image = currentImg; // [Fix] Pass input image for img2img/edits
              if (currentMask) payloadData.mask = currentMask; // [New] Pass mask
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

  // [New] 5. 本地化文件上传逻辑 (带 project_id)
  const handleFileUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      console.log(`🚀 Uploading ${file.name} to Project: ${projectId}`);
      
      // [Modified] 使用 uploadAsset 统一上传逻辑，确保 type='input' 被正确传递
      // 这样后端才会将其存入 inputs 文件夹，而不是项目根目录
      const url = await uploadAsset(file, file.name, 'input');

      if (url) {
          console.log("✅ Upload success:", url);
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
      } else {
          alert('上传失败');
      }

      if (localFileInputRef.current) {
          localFileInputRef.current.value = '';
      }
  };

  const handleDropObject = async (dropData) => {
      if (!dropData) return;
      if (dropData.id) { canvas.updateImages([...canvas.images, dropData]); return; }

      const id = `drop_${Date.now()}`;
      let newObj = null;

      if (dropData.type === 'image') {
          let src = dropData.content;
          
          // [New] 优先处理 File 对象 (来自粘贴或文件拖拽)
          if (dropData.file) {
              const url = await uploadAsset(dropData.file, dropData.file.name, 'input');
              if (url) src = url;
              else src = URL.createObjectURL(dropData.file); // 上传失败则降级使用本地预览
          }
          
          // [Modified] 拦截 Base64 和 Blob 字符串 (来自内部拖拽或其他)
          else if (typeof src === 'string' && (src.startsWith('data:image') || src.startsWith('blob:'))) {
              try {
                  const res = await fetch(src);
                  const blob = await res.blob();
                  const uploadedUrl = await uploadAsset(blob, `drop_${Date.now()}.png`, 'input');
                  if (uploadedUrl) {
                      src = uploadedUrl;
                  }
              } catch (e) {
                  console.error("Drop upload failed", e);
              }
          }

          newObj = {
              id, type: 'image', x: dropData.x - 600, y: dropData.y - 600, width: 1200, height: 1200,
              src: src, sourceIds: dropData.sourceIds || [], opacity: 1, isLocked: false,
              isGenerated: false
          };
      } else if (dropData.type === 'text') {
          newObj = {
              id, type: 'text', x: dropData.x, y: dropData.y, width: 800, height: 400,
              text: dropData.content, fontSize: 32, fill: '#000000', sourceIds: dropData.sourceIds || [], isLocked: false, align: 'left'
          };
      }
      if (newObj) { canvas.updateImages([...canvas.images, newObj]); canvas.setSelectedId(id); }
  };

  // [Modified] 使用 localFileInputRef
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
          
          // [Fix] 强制直接点击本地 input，完全绕过 canvas.handleAddObject
          // 这样能确保 100% 触发 handleFileUpload 并带上 project_id
          if (localFileInputRef.current) {
              localFileInputRef.current.click();
          }
          return;
      }
      
      // [New] 手动处理文字添加，确保默认尺寸足够大 (800x400)
      if (type === 'text') {
          const newText = {
              id: `text_${Date.now()}`,
              type: 'text',
              name: 'Text',
              // 计算屏幕中心位置
              x: (window.innerWidth / 2 - canvas.offset.x) / canvas.zoom - 400, 
              y: (window.innerHeight / 2 - canvas.offset.y) / canvas.zoom - 200,
              width: 800, 
              height: 100,
              text: "双击编辑文本", 
              fontSize: 32, 
              fill: '#000000', 
              isLocked: false, 
              align: 'left'
          };
          canvas.updateImages([...canvas.images, newText]);
          canvas.setSelectedId(newText.id);
          return;
      }
      
      // 其他类型 (如 shape) 继续使用 canvas 处理
      canvas.handleAddObject(type, localFileInputRef);
  };

  const handleLayerActionWrapper = (action, id) => {
      // [New] 前端合成选中项 (Image + Mask -> Transparent PNG)
      if (action === 'composite_selected') {
          const selectedIds = Array.isArray(canvas.selectedId) ? canvas.selectedId : [canvas.selectedId];
          if (selectedIds.length !== 2) return;

          const item1 = canvas.images.find(i => i.id === selectedIds[0]);
          const item2 = canvas.images.find(i => i.id === selectedIds[1]);
          if (!item1 || !item2) return;

          // 简单的启发式判断：谁是遮罩？
          // 1. 名字包含 'mask'
          // 2. 或者是 Frame 类型
          // 3. 否则默认 item2 (后选中的/上层的) 是遮罩
          let imageObj = item1;
          let maskObj = item2;
          
          if (item1.name?.toLowerCase().includes('mask') || item1.type === 'frame') {
              maskObj = item1; imageObj = item2;
          } else if (item2.name?.toLowerCase().includes('mask') || item2.type === 'frame') {
              maskObj = item2; imageObj = item1;
          } else {
              // 默认 item2 为遮罩
              maskObj = item2; imageObj = item1;
          }

          const processComposition = async () => {
              try {
                  // 1. 加载图片
                  const loadImg = (src) => new Promise((resolve, reject) => {
                      const img = new Image();
                      img.crossOrigin = "Anonymous";
                      img.onload = () => resolve(img);
                      img.onerror = reject;
                      img.src = src;
                  });

                  const [imgEl, maskEl] = await Promise.all([
                      loadImg(imageObj.src),
                      loadImg(maskObj.src || maskObj.fill) // 兼容 Frame 纯色，虽然 loadImg 会失败，这里暂只支持图片
                  ]);

                  // 2. 创建 Canvas 进行合成
                  const cvs = document.createElement('canvas');
                  cvs.width = imgEl.naturalWidth;
                  cvs.height = imgEl.naturalHeight;
                  const ctx = cvs.getContext('2d');

                  // 3. 绘制原图
                  ctx.drawImage(imgEl, 0, 0);
                  
                  // 4. 应用遮罩 (使用 destination-in 混合模式，或者像素操作)
                  // 这里使用像素操作以支持黑白遮罩 (Luminance -> Alpha)
                  const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
                  
                  // 绘制遮罩到临时 Canvas 获取像素数据
                  const maskCvs = document.createElement('canvas');
                  maskCvs.width = cvs.width;
                  maskCvs.height = cvs.height;
                  const mCtx = maskCvs.getContext('2d');
                  mCtx.drawImage(maskEl, 0, 0, cvs.width, cvs.height); // 强制缩放遮罩匹配原图
                  const maskData = mCtx.getImageData(0, 0, cvs.width, cvs.height);

                  // 5. 像素混合：Mask 的红色通道值 -> 原图的 Alpha 通道
                  for (let i = 0; i < imgData.data.length; i += 4) {
                      imgData.data[i + 3] = maskData.data[i]; // R -> A
                  }
                  ctx.putImageData(imgData, 0, 0);

                  // 6. 导出并上传
                  cvs.toBlob(async (blob) => {
                      const url = await uploadAsset(blob, `comp_${Date.now()}.png`, 'generation');
                      if (url) {
                          const newImg = {
                              id: `comp_${Date.now()}`,
                              type: 'image',
                              name: 'Composite',
                              src: url,
                              x: imageObj.x + imageObj.width + 50,
                              y: imageObj.y,
                              width: imageObj.width,
                              height: imageObj.height,
                              isLocked: false
                          };
                          canvas.setImages(prev => [...prev, newImg]);
                      }
                  });
              } catch (e) {
                  console.error("Composition failed", e);
                  alert("合成失败，请确保图片允许跨域访问");
              }
          };
          
          processComposition();
          return;
      }

      // [New] 创建遮罩层：在图片上覆盖一个等大的半透明Frame，并切换到白色画笔
      if (action === 'create_mask_layer') {
          const img = canvas.images.find(i => i.id === id);
          if (img) {
              const newFrame = {
                  id: `mask_frame_${Date.now()}`,
                  type: 'frame',
                  name: 'Mask_Layer',
                  x: img.x,
                  y: img.y,
                  width: img.width,
                  height: img.height,
                  fill: 'rgba(0, 0, 0, 0.5)', // 半透明黑色背景，方便看清原图进行描绘
                  stroke: '#00FF00', // 绿色边框提示
                  isLocked: false
              };
              canvas.setImages(prev => [...prev, newFrame]);
              canvas.setSelectedId(newFrame.id);
              
              // 自动切换到涂鸦工具，并设置白色画笔 (遮罩通常是黑底白画)
              canvas.setActiveTool('draw');
              canvas.setDrawSettings(prev => ({ ...prev, stroke: '#FFFFFF', strokeWidth: 20, opacity: 1 }));
          }
          return;
      }

      // [New] 根据图片创建画布 (Frame) - 右侧创建 & 原像素尺寸
      if (action === 'create_canvas_from_image') {
          const img = canvas.images.find(i => i.id === id);
          if (img) {
              // 使用原始分辨率，如果未加载完成则回退到显示尺寸
              const w = img.naturalWidth || img.width;
              const h = img.naturalHeight || img.height;
              const gap = 50; // 与原图的间距

              const newFrame = {
                  id: `frame_${Date.now()}`,
                  type: 'frame',
                  name: 'Canvas',
                  x: img.x + img.width + gap,
                  y: img.y,
                  width: w,
                  height: h,
                  rotation: 0, // 画布通常不旋转
                  fill: '#ffffff',
                  stroke: '#4b5563',
                  isLocked: false
              };

              const newImg = {
                  ...img,
                  id: `img_copy_${Date.now()}`,
                  x: newFrame.x,
                  y: newFrame.y,
                  width: w,
                  height: h,
                  // 重置裁切/缩放，确保完整显示原图
                  contentWidth: w,
                  contentHeight: h,
                  contentX: 0,
                  contentY: 0,
                  isLocked: false
              };

              // 同时添加画框和图片副本
              canvas.setImages(prev => [...prev, newFrame, newImg]);
          }
          return;
      }

      // [New] 拦截抠图操作 (rembg)，走 HTTP 接口以确保带上 project_id
      if (action === 'rembg') {
          const img = canvas.images.find(i => i.id === id);
          if (!img || !img.src) return;

          console.log(`🚀 Starting RemBg for image: ${id}`);
          
          // 显示加载状态 (可选: 可以加个 loading toast)
          
          fetch(`${API_BASE_URL}/api/rembg`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  image: img.src,
                  project_id: projectId, // [关键] 必传参数
                  model: 'u2net'
              })
          })
          .then(res => res.json())
          .then(async data => {
              if (data.status === 'success') {
                  console.log("✅ RemBg success:", data.image);
                  
                  // [Fix] 主动上传逻辑：强制作为 generation 上传，不依赖被动扫描
                  let finalSrc = data.image;
                  if (data.image.startsWith('data:') || data.image.startsWith('blob:')) {
                      try {
                          const res = await fetch(data.image);
                          const blob = await res.blob();
                          const url = await uploadAsset(blob, `rembg_${Date.now()}.png`, 'generation');
                          if (url) finalSrc = url;
                      } catch (e) { console.error("Rembg upload failed", e); }
                  }

                  // [Modified] 创建新图层添加到右侧，而不是替换原图
                  const newImg = {
                      ...img, // 继承原图属性 (宽高、旋转等)
                      id: `rembg_${Date.now()}`, // 生成新 ID
                      src: finalSrc, // 使用固化后的 URL
                      x: img.x + img.width + 50, // 位置向右偏移 50px
                      name: (img.name || 'Image') + '_NoBG', // 更新名称
                      isGenerated: true
                  };
                  canvas.setImages(prev => [...prev, newImg]); // [Fix] 使用函数式更新防止状态覆盖
                  canvas.setSelectedId(newImg.id); // 选中新图层
              } else {
                  alert('抠图失败: ' + (data.message || '未知错误'));
              }
          })
          .catch(e => console.error("RemBg error:", e));
          return;
      }

      if (action === 'save_local') {
          const img = canvas.images.find(i => i.id === id);
          if (img && img.src) {
              fetch(img.src)
                  .then(res => res.blob())
                  .then(blob => {
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `image_${id}_${Date.now()}.png`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                  })
                  .catch(e => console.error("Download failed", e));
          }
          return;
      }
      if (action.startsWith('bind_')) {
          const slotName = action.replace('bind_', '');
          const obj = canvas.images.find(i => i.id === id);
          if (obj && workflow.activeWorkflowId) {
              workflow.setAllBindings(prev => ({
                  ...prev,
                  [workflow.activeWorkflowId]: {
                      ...(prev[workflow.activeWorkflowId] || {}),
                      [slotName]: obj
                  }
              }));
          }
          return;
      }
      canvas.handleLayerAction(action, id, workflow.activeWorkflowId, workflow.setAllBindings, uploadAsset);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50 text-gray-900 font-sans">
      {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
      {/* [Modified] 绑定到 localFileInputRef */}
      <input 
        type="file" 
        ref={localFileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
        accept="image/*"
      />
      {/* [Fix] Restore project.fileInputRef input for legacy compatibility (Header Open/Import) */}
      <input 
        type="file" 
        ref={project.fileInputRef} 
        className="hidden" 
        accept=".json,image/*"
      />

      <Sidebar 
          activeTool={canvas.activeTool} 
          onToolSelect={canvas.setActiveTool} 
          onAddObject={handleSidebarAdd}
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
                // [Fix] 手动读取 JSON 文件，避免 handleOpenProject 可能的读取失败
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
                    // 对于非 JSON 文件（如图片），继续使用原有逻辑
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
             onLayerAction={handleLayerActionWrapper}
             bindings={workflow.currentBindings}
             activeWorkflow={activeWorkflow}
             onDropObject={handleDropObject} 
             onHistoryRecord={(manualState) => canvas.takeSnapshot(manualState || canvas.images)}
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
