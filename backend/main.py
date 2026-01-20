from contextlib import asynccontextmanager
from concurrent.futures import ProcessPoolExecutor
import multiprocessing
import logging
import asyncio
import uuid
import json 
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles # [新增] 用于挂载图片目录
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from app import schemas
from app import dispatcher
from app.websocket_manager import manager
from app.utils import storage # [新增] 引入存储管理器
from app.utils import project_manager # [新增] 引入项目管理器
from app.pipelines import pipe_a_rembg # [新增] 引入 RemBg 管道
from app.pipelines import pipe_b_comfyui # [新增] 引入 ComfyUI 管道
from config import settings

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

# 核心配置：预留一个 CPU 核给系统/API，其余给计算任务
MAX_WORKERS = max(1, multiprocessing.cpu_count() - 1)

# [新增] 配置工作流存储路径 (相对于项目根目录: workspace/workflow)
WORKFLOWS_DIR = settings.WORKSPACE_DIR / "workflow"
WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    生命周期管理器
    """
    # --- 启动阶段 (Startup) ---
    logger.info(f"🚀 Backend Starting...")
    
    # [新增] 1. 初始化文件仓库 (在项目根目录创建 workspace)
    storage.init_storage()
    project_manager.init_projects_system() # 初始化项目目录
    
    # 初始化进程池
    logger.info(f"⚙️ Initializing ProcessPool with {MAX_WORKERS} workers.")
    process_pool = ProcessPoolExecutor(max_workers=MAX_WORKERS)
    app.state.process_pool = process_pool
    
    yield # 应用运行中...
    
    # --- 关闭阶段 (Shutdown) ---
    logger.info("🛑 Backend Shutting down... Closing ProcessPool.")
    process_pool.shutdown(wait=True)
    logger.info("✅ ProcessPool closed.")

# 初始化 APP
app = FastAPI(title="AI Workflow Backend", lifespan=lifespan)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# [新增] 2. 挂载静态文件服务
# 这样前端访问 http://localhost:8020/files/inputs/xxx.png 就能看到图
# storage.WORKSPACE_DIR 指向的是项目根目录下的 workspace
app.mount("/files", StaticFiles(directory=str(settings.WORKSPACE_DIR)), name="files")

@app.get("/")
async def root():
    """健康检查接口"""
    return {"message": "AI Workflow Backend is Running", "status": "active"}

# [新增] ComfyUI 直接执行接口 (适配前端 App.jsx 的 fetch 调用)
@app.post("/api/run")
async def run_workflow(request: Request):
    """
    直接执行 ComfyUI 工作流 (同步/HTTP模式)
    """
    payload = await request.json()
    return await pipe_b_comfyui.run(payload)

# [新增] RemBg 抠图直接执行接口
@app.post("/api/rembg")
async def run_rembg(request: Request):
    """直接执行 RemBg 抠图"""
    payload = await request.json()
    # 使用进程池执行，避免阻塞主线程
    return await pipe_a_rembg.run(payload, request.app.state.process_pool)

# [新增] 3. 上传接口 (统一处理)
@app.post("/upload")
async def upload_file(file: UploadFile = File(...), project_id: str = Form(...), type: str = Form("input")):
    """
    前端上传文件 -> 后端保存
    根据 type 决定是存入 'inputs' 还是 'generations'
    """
    logger.info(f"📂 Receiving upload: {file.filename} (Project: {project_id}, Type: {type})")
    
    if type == "generation":
        # AI 生成的图片，存入 generations 目录
        # save_generated_image 需要 bytes, 所以我们先 read()
        content = await file.read()
        # 从文件名中提取前缀和后缀
        original_name = Path(file.filename or "generated.png")
        prefix = original_name.stem
        ext = original_name.suffix.lstrip('.') or "png"
        
        result = storage.save_generated_image(
            image_bytes=content,
            prefix=prefix,
            ext=ext,
            project_id=project_id
        )
    else:
        # 用户上传的原图，存入 inputs 目录 (默认行为)
        result = await storage.save_upload_file(file, project_id)
    
    logger.info(f"✅ Saved to: {result['path']}")
    return {
        "status": "success", 
        "file": result # 包含 filename, path, url
    }

# --- [新增] 项目管理接口 ---
class CreateProjectRequest(BaseModel):
    name: str

@app.post("/api/projects/create")
async def create_project_api(req: CreateProjectRequest):
    """创建新项目"""
    project = project_manager.create_project(req.name)
    return {"status": "success", "project": project}

@app.post("/api/projects/import")
async def import_project_api(file: UploadFile = File(...)):
    """导入项目"""
    try:
        content = await file.read()
        project = project_manager.import_project(content)
        return {"status": "success", "project": project}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects/{project_id}/export")
async def export_project_api(project_id: str):
    """导出项目 ZIP"""
    try:
        zip_io = project_manager.export_project(project_id)
        filename = f"{project_id}.zip"
        return StreamingResponse(
            zip_io, 
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/projects")
async def list_projects_api():
    """获取项目列表"""
    projects = project_manager.list_projects()
    return {"status": "success", "projects": projects}

@app.get("/api/projects/{project_id}")
async def get_project_api(project_id: str):
    """获取单个项目详情"""
    project = project_manager.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "success", "project": project}

class UpdateProjectRequest(BaseModel):
    id: str
    data: dict

@app.post("/api/projects/save")
async def save_project_api(req: UpdateProjectRequest):
    """保存项目 (覆盖 project.json)"""
    try:
        project_manager.update_project(req.id, req.data)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# [新增] 工作流管理接口
@app.get("/api/workflows")
async def list_workflows():
    """扫描目录，返回所有 .json 工作流文件"""
    try:
        files = [f.name for f in WORKFLOWS_DIR.glob("*.json")]
        return {"workflows": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/workflows/{name}")
async def get_workflow(name: str):
    """读取指定工作流文件的内容"""
    file_path = WORKFLOWS_DIR / name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    try:
        content = json.loads(file_path.read_text(encoding='utf-8'))
        if isinstance(content, dict) and 'name' not in content:
            content['name'] = name
        return content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")

class SaveWorkflowRequest(BaseModel):
    name: str
    content: dict

@app.post("/api/workflows")
async def save_workflow(req: SaveWorkflowRequest):
    """保存工作流到指定目录"""
    name = req.name if req.name.endswith('.json') else f"{req.name}.json"
    file_path = WORKFLOWS_DIR / name
    try:
        file_path.write_text(json.dumps(req.content, indent=2, ensure_ascii=False), encoding='utf-8')
        return {"status": "success", "message": f"Saved to {name}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/task/submit", response_model=schemas.TaskResponse)
async def submit_task(task: schemas.TaskSubmit, request: Request):
    """
    任务提交入口 (HTTP 方式)
    """
    logger.info(f"📥 Received task: {task.task_type} from client {task.client_id}")
    task_id = str(uuid.uuid4())
    
    # 异步分发任务
    asyncio.create_task(dispatcher.dispatch(task, task_id, request.app.state.process_pool))
    
    return {
        "task_id": task_id,
        "status": "queued",
        "message": f"Task {task.task_type} accepted"
    }

# --- WebSocket 端点 ---
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """
    WebSocket 连接端点
    """
    await manager.connect(websocket, client_id)
    try:
        while True:
            # 1. 等待接收前端消息
            data = await websocket.receive_text()
            
            try:
                # 2. 解析 JSON
                payload_data = json.loads(data)
                
                # 3. 校验数据
                task = schemas.TaskSubmit(**payload_data)
                
                # [关键保留] 优先使用前端传来的 ID，确保 WebSocket 能够回调成功
                task_id = task.task_id if task.task_id else str(uuid.uuid4())
                
                logger.info(f"⚡ WS Received task: {task.task_type} | ID: {task_id}")

                # 4. 调用分发器
                process_pool = websocket.app.state.process_pool
                
                asyncio.create_task(
                    dispatcher.dispatch(task, task_id, process_pool)
                )

            except json.JSONDecodeError:
                logger.error("Failed to decode JSON from WebSocket")
            except Exception as e:
                logger.error(f"Error processing WS message: {e}")
                await manager.send_to_client(client_id, schemas.WSMessage(
                    type="error",
                    task_id="unknown",
                    data={"message": str(e)}
                ))
                
    except WebSocketDisconnect:
        manager.disconnect(client_id)
        logger.info(f"Client {client_id} disconnected")

if __name__ == "__main__":
    # 调试模式启动
    uvicorn.run("main:app", host="0.0.0.0", port=8020, reload=True)