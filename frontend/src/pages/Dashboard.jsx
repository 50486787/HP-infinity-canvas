// src/pages/Dashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../config';

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // 1. 加载项目列表
  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects`);
      const data = await res.json();
      if (data.status === 'success') {
        setProjects(data.projects);
      }
    } catch (err) {
      console.error("加载项目失败:", err);
    } finally {
      setLoading(false);
    }
  };

  // 2. 新建项目
  const handleCreate = async () => {
    const name = prompt("请输入项目名称", "我的新作品");
    if (!name) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        // 创建成功后，直接跳转到编辑器，并带上项目ID
        navigate(`/project/${data.project.id}`);
      }
    } catch (err) {
      alert("创建失败: " + err.message);
    }
  };

  // 3. 导入项目 (预留 UI，逻辑后续完善)
  const handleImport = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/projects/import`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        fetchProjects(); // 刷新列表
      } else {
        alert("导入失败: " + (data.detail || "未知错误"));
      }
    } catch (err) {
      alert("导入出错: " + err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 4. 删除项目
  const handleDelete = async (e, projectId) => {
    e.stopPropagation(); // 阻止冒泡，防止触发卡片点击跳转
    if (!window.confirm("确定要删除该项目吗？此操作无法恢复。")) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        setProjects(prev => prev.filter(p => p.id !== projectId));
      } else {
        alert("删除失败: " + (data.detail || "未知错误"));
      }
    } catch (err) {
      alert("删除出错: " + err.message);
    }
  };

  return (
    <div style={styles.container}>
      <input type="file" ref={fileInputRef} style={{display: 'none'}} accept=".zip" onChange={handleFileChange} />
      <header style={styles.header}>
        <h1 style={styles.title}>工作台</h1>
        <div style={styles.actions}>
          <button onClick={handleImport} style={styles.secondaryBtn}>导入项目</button>
          <button onClick={handleCreate} style={styles.primaryBtn}>+ 新建项目</button>
        </div>
      </header>

      {loading ? (
        <div style={styles.loading}>加载中...</div>
      ) : (
        <div style={styles.grid}>
          {projects.length === 0 && (
            <div style={styles.empty}>还没有项目，快去创建一个吧！</div>
          )}
          
          {projects.map((p) => (
            <div 
              key={p.id} 
              style={styles.card}
              onClick={() => navigate(`/project/${p.id}`)}
            >
              <div style={styles.cardPreview}>
                {/* 如果项目有缩略图可以在这里显示，暂时用占位符 */}
                <span style={{fontSize: '40px'}}>🎨</span>
              </div>
              <div style={styles.cardInfo}>
                <div style={styles.cardHeader}>
                  <h3 style={styles.cardTitle}>{p.name}</h3>
                  <button 
                    onClick={(e) => handleDelete(e, p.id)}
                    style={styles.deleteBtn}
                    title="删除项目"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <p style={styles.cardDate}>更新于: {p.updated_at}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 简单的内联样式
const styles = {
  container: { padding: '40px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' },
  title: { margin: 0, color: '#333' },
  actions: { display: 'flex', gap: '10px' },
  primaryBtn: { padding: '10px 20px', background: '#007AFF', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' },
  secondaryBtn: { padding: '10px 20px', background: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' },
  card: { border: '1px solid #eee', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' },
  cardPreview: { height: '160px', background: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #eee' },
  cardInfo: { padding: '16px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' },
  cardTitle: { margin: 0, fontSize: '16px', fontWeight: '600', lineHeight: '1.4', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  deleteBtn: { background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cardDate: { margin: 0, fontSize: '12px', color: '#999' },
  loading: { textAlign: 'center', color: '#666', marginTop: '50px' },
  empty: { gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#999', background: '#f9f9f9', borderRadius: '8px' }
};
