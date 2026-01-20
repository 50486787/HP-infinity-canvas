"""
backend/app/pipelines/pipe_c_api.py
Pipeline C: 通用大模型 API 调用 (Via LiteLLM)
支持文本对话和图片生成。
"""
import logging
import base64
import httpx
import io
import os
from typing import Dict, Any
from app.websocket_manager import manager
from app.schemas import WSMessage
from app.utils import storage

logger = logging.getLogger("backend.pipe_c")

try:
    import litellm
    litellm.suppress_instrumentation = True # 禁止发送遥测数据
    logger.info("✅ LiteLLM module loaded successfully.")
except ImportError as e:
    logger.error(f"❌ LiteLLM import failed: {e}")
    litellm = None

# [New] Google GenAI SDK Support
try:
    from google import genai
    from google.genai import types
    from PIL import Image
    GOOGLE_GENAI_AVAILABLE = True
except ImportError:
    GOOGLE_GENAI_AVAILABLE = False

async def _load_image_pil(image_input: Any) -> Any:
    """Helper: Load image input as PIL Image for Google SDK"""
    try:
        data = None
        if isinstance(image_input, str):
            if image_input.startswith("http"):
                async with httpx.AsyncClient() as client:
                    resp = await client.get(image_input)
                    if resp.status_code == 200:
                        data = resp.content
            elif image_input.startswith("data:"):
                if "," in image_input:
                    _, encoded = image_input.split(",", 1)
                else:
                    encoded = image_input
                data = base64.b64decode(encoded)
            else:
                try:
                    data = base64.b64decode(image_input)
                except:
                    pass
        elif isinstance(image_input, bytes):
            data = image_input
            
        if data:
            return Image.open(io.BytesIO(data))
    except Exception as e:
        logger.warning(f"Failed to load PIL image: {e}")
    return None

async def _run_google_genai(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Native Google GenAI SDK call for Gemini models
    Supports: Chat, Vision, Image Generation (Imagen 3)
    """
    try:
        api_key = payload.get("api_key") or os.getenv("GEMINI_API_KEY")
        if not api_key:
             return {"status": "error", "message": "Missing API Key for Gemini"}

        client = genai.Client(api_key=api_key)
        
        # Clean model name (remove 'gemini/' prefix if coming from frontend)
        model = payload.get("model", "gemini-1.5-flash")
        if model.startswith("gemini/"):
            model = model.replace("gemini/", "", 1)

        contents = []
        
        # 1. Handle Chat History (messages)
        if payload.get("messages"):
            for msg in payload["messages"]:
                role = "user" if msg["role"] == "user" else "model"
                parts = []
                content = msg["content"]
                
                if isinstance(content, str):
                    parts.append(types.Part(text=content))
                elif isinstance(content, list):
                    for item in content:
                        if item["type"] == "text":
                            parts.append(types.Part(text=str(item["text"])))
                        elif item["type"] == "image_url":
                            img = await _load_image_pil(item["image_url"]["url"])
                            if img:
                                b = io.BytesIO()
                                fmt = img.format or "PNG"
                                img.save(b, format=fmt)
                                mime_type = f"image/{fmt.lower()}"
                                parts.append(types.Part(inline_data=types.Blob(mime_type=mime_type, data=b.getvalue())))
                
                if parts:
                    contents.append(types.Content(role=role, parts=parts))

        # 2. Handle Direct Prompt/Image (e.g. from Image Gen UI)
        elif payload.get("prompt"):
            parts = [types.Part(text=str(payload["prompt"]))]
            if payload.get("image"):
                img = await _load_image_pil(payload["image"])
                if img:
                    b = io.BytesIO()
                    fmt = img.format or "PNG"
                    img.save(b, format=fmt)
                    mime_type = f"image/{fmt.lower()}"
                    parts.append(types.Part(inline_data=types.Blob(mime_type=mime_type, data=b.getvalue())))
            contents.append(types.Content(role="user", parts=parts))

        # Config: Enable Image Generation
        config = types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"]
        )

        logger.info(f"🚀 Google GenAI Call: {model}")

        # Execute in thread pool (SDK is sync)
        def _call_sync():
            return client.models.generate_content(
                model=model,
                contents=contents,
                config=config
            )
        
        import asyncio
        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(None, _call_sync)

        # Parse Response
        text_content = ""
        images = []
        
        if response.parts:
            for part in response.parts:
                if part.text:
                    text_content += part.text
                if part.inline_data:
                    # Convert raw bytes to base64 data URI
                    img_bytes = part.inline_data.data
                    
                    # Save to project if available
                    project_id = payload.get("project_id")
                    if project_id:
                        save_res = storage.save_generated_image(img_bytes, prefix="gemini_gen", project_id=project_id)
                        images.append(save_res["url"])
                    else:
                        b64_str = base64.b64encode(img_bytes).decode('utf-8')
                        mime = part.inline_data.mime_type or "image/png"
                        images.append(f"data:{mime};base64,{b64_str}")

        result_data = {
            "content": text_content,
            "images": images,
            "raw": str(response)
        }
        
        if not text_content and not images:
             result_data["content"] = "⚠️ Empty response from Gemini."

        return {"status": "success", "data": result_data}

    except Exception as e:
        logger.error(f"❌ Google GenAI Error: {e}")
        return {"status": "error", "message": str(e)}

async def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    通用大模型调用接口。

    支持 "protocol": "litellm" 模式
    直接使用 Python litellm 库调用所有主流大模型。
    Payload 参数:
    - protocol: "litellm"
    - model: 模型名称 (如 "gpt-4", "claude-3-opus", "ollama/llama3")
    - messages: 对话历史
    - api_key, base_url 等可选参数

    支持 "protocol": "litellm_image" 模式
    调用 DALL-E 3, Imagen 等生图模型。
    Payload 参数:
    - protocol: "litellm_image"
    - model: "dall-e-3", "vertex_ai/imagen-3"
    - prompt: "A cute cat"
    """
    # --- 0. Google GenAI 原生调用 (针对 Gemini 模型) ---
    model = payload.get("model", "").lower()
    if model.startswith("gemini") or "gemini" in model:
        if not GOOGLE_GENAI_AVAILABLE:
             return {"status": "error", "message": "google-genai library not installed. Please run `pip install google-genai`"}
        return await _run_google_genai(payload)

    # --- 1. LiteLLM 库调用模式 ---
    if payload.get("protocol") == "litellm":
        if litellm is None:
            return {"status": "error", "message": "LiteLLM library not installed. Please run `pip install litellm`"}
        return await _run_litellm(payload)

    # --- 1.5 LiteLLM 图片生成模式 ---
    if payload.get("protocol") == "litellm_image":
        if litellm is None:
            return {"status": "error", "message": "LiteLLM library not installed. Please run `pip install litellm`"}
        return await _run_litellm_image(payload)

    return {"status": "error", "message": "Unknown protocol. Please use 'litellm' or 'litellm_image'."}

async def _run_litellm(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    使用 LiteLLM 库进行通用大模型调用
    """
    try:
        model = payload.get("model", "gpt-3.5-turbo")
        base_url = payload.get("base_url")
        api_key = payload.get("api_key")

        # [Fix] 如果提供了 base_url 且模型名没有指定提供商（不含 /），则默认为 openai/ 协议
        # 这解决了使用本地模型（如 vLLM/Ollama）时 litellm 报错 "LLM Provider NOT provided" 的问题
        if base_url and "/" not in model:
            model = f"openai/{model}"

        # 构造参数
        kwargs = {
            "model": model,
            "messages": payload.get("messages", []),
            "stream": False,
        }

        # 可选参数映射
        if api_key:
            kwargs["api_key"] = api_key
        elif base_url:
            # [Fix] 本地模型通常不需要 Key，但 OpenAI 客户端库可能要求非空。
            kwargs["api_key"] = "sk-dummy-key"

        if base_url:
            kwargs["api_base"] = base_url
            logger.info(f"🔗 Using Custom Base URL: {base_url}")
            
            # [Fix] 针对本地服务，强制绕过系统代理，防止 VPN 拦截 localhost 请求
            if "localhost" in base_url or "127.0.0.1" in base_url:
                no_proxy = os.environ.get("NO_PROXY", "")
                if "localhost" not in no_proxy:
                    os.environ["NO_PROXY"] = f"{no_proxy},localhost,127.0.0.1".lstrip(",")
            
        # 透传常见参数
        for key in ["temperature", "max_tokens", "top_p", "stop", "frequency_penalty", "presence_penalty"]:
            if key in payload:
                kwargs[key] = payload[key]

        logger.info(f"🚀 LiteLLM Call: {kwargs['model']}")
        
        # 异步调用 (acompletion 是 litellm 的异步方法)
        # 注意：开启 stream=True 后，返回的是一个 AsyncGenerator
        response = await litellm.acompletion(**kwargs)
        
        # 提取文本内容
        content = response.choices[0].message.content
        # 返回标准化结果
        return {"status": "success", "data": {"content": content, "raw": response.model_dump()}}

    except Exception as e:
        logger.error(f"❌ LiteLLM Error: {e}")
        return {"status": "error", "message": str(e)}

async def _run_litellm_image(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    使用 LiteLLM 库进行图片生成 (DALL-E 3, Imagen 3 等)
    """
    try:
        model = payload.get("model", "dall-e-3")
        base_url = payload.get("base_url")
        api_key = payload.get("api_key")

        # [Fix] 如果提供了 base_url 且模型名没有指定提供商（不含 /），则默认为 openai/ 协议
        if base_url and "/" not in model:
            model = f"openai/{model}"

        # 构造参数
        kwargs = {
            "model": model,
            "prompt": payload.get("prompt", ""),
        }
        
        if not kwargs["prompt"]:
             return {"status": "error", "message": "Missing 'prompt' in payload"}

        # 可选参数映射
        if api_key:
            kwargs["api_key"] = api_key
        elif base_url:
            # [Fix] 本地模型通常不需要 Key，但 OpenAI 客户端库可能要求非空。
            kwargs["api_key"] = "sk-dummy-key"

        if base_url:
            kwargs["api_base"] = base_url
            logger.info(f"🔗 Using Custom Base URL: {base_url}")
            
            # [Fix] 针对本地服务，强制绕过系统代理
            if "localhost" in base_url or "127.0.0.1" in base_url:
                no_proxy = os.environ.get("NO_PROXY", "")
                if "localhost" not in no_proxy:
                    os.environ["NO_PROXY"] = f"{no_proxy},localhost,127.0.0.1".lstrip(",")
            
        # [Fix] 支持图生图/编辑模式传入 image
        if payload.get("image"):
            img_input = payload["image"]
            # 如果是 Data URL，转换为 BytesIO 对象 (模拟文件上传)
            if isinstance(img_input, str) and img_input.startswith("data:"):
                try:
                    if "," in img_input:
                        _, encoded = img_input.split(",", 1)
                    else:
                        encoded = img_input
                    img_bytes = base64.b64decode(encoded)
                    img_file = io.BytesIO(img_bytes)
                    img_file.name = "image.png" # 必须设置文件名，否则部分库会报错
                    kwargs["image"] = img_file
                except Exception as e:
                    logger.warning(f"Failed to decode base64 image: {e}")
                    kwargs["image"] = img_input
            else:
                kwargs["image"] = img_input

        # [New] 支持 Mask (用于 Inpainting)
        if payload.get("mask"):
            mask_input = payload["mask"]
            if isinstance(mask_input, str) and mask_input.startswith("data:"):
                try:
                    if "," in mask_input:
                        _, encoded = mask_input.split(",", 1)
                    else:
                        encoded = mask_input
                    mask_bytes = base64.b64decode(encoded)
                    mask_file = io.BytesIO(mask_bytes)
                    mask_file.name = "mask.png"
                    kwargs["mask"] = mask_file
                except Exception:
                    kwargs["mask"] = mask_input
            else:
                kwargs["mask"] = mask_input
            
        # 透传常见参数 (n=数量, size=尺寸, response_format=url/b64_json)
        for key in ["n", "size", "response_format", "quality", "style"]:
            if key in payload:
                kwargs[key] = payload[key]

        logger.info(f"🚀 LiteLLM Image Gen: {kwargs['model']}")
        
        # 异步调用
        response = await litellm.aimage_generation(**kwargs)
        logger.info(f"📸 Raw Response: {response}")
        
        # 提取结果 (兼容 OpenAI 格式对象或字典)
        images = []
        data_items = []
        project_id = payload.get("project_id")

        if hasattr(response, 'data'):
            data_items = response.data
        elif isinstance(response, dict) and 'data' in response:
            data_items = response['data']

        for item in data_items:
            val = None
            # 尝试对象属性访问 (忽略 AttributeError)
            try:
                val = getattr(item, 'url', None) or getattr(item, 'b64_json', None)
            except AttributeError:
                pass
            
            # 尝试字典访问
            if not val and isinstance(item, dict):
                val = item.get('url') or item.get('b64_json')
            
            if val:
                # [Fix] 如果是 Base64 且没有前缀，补上前缀
                if isinstance(val, str) and len(val) > 200 and not val.startswith('http') and not val.startswith('data:'):
                    val = f"data:image/png;base64,{val}"
                
                # [New] 自动保存到项目文件夹
                if project_id:
                    try:
                        image_content = None
                        # 情况 A: 远程 URL (如 DALL-E 3) -> 下载并保存
                        if val.startswith("http"):
                            async with httpx.AsyncClient() as client:
                                resp = await client.get(val)
                                if resp.status_code == 200:
                                    image_content = resp.content
                        
                        # 情况 B: Base64 (如 Stable Diffusion/Gemini) -> 解码并保存
                        elif val.startswith("data:image"):
                            try:
                                _, encoded = val.split(",", 1)
                                image_content = base64.b64decode(encoded)
                            except Exception:
                                pass
                        
                        if image_content:
                            save_result = storage.save_generated_image(image_content, prefix="ai_gen", project_id=project_id)
                            val = save_result["url"] # 替换为本地 URL
                            logger.info(f"💾 Saved AI image to: {val}")
                    except Exception as e:
                        logger.error(f"Failed to save generated image: {e}")

                images.append(val)
        
        # 返回标准化结果
        result_data = {
            "images": images, 
            "raw": response.model_dump() if hasattr(response, "model_dump") else str(response)
        }

        # [Fix] 如果没有生成图片，返回提示信息防止前端卡死
        if not images:
            result_data["content"] = "⚠️ 生成结果为空 (No images returned)。\n请检查下方原始响应以排查问题:\n" + str(result_data["raw"])

        return {
            "status": "success", 
            "data": result_data
        }

    except Exception as e:
        logger.error(f"❌ LiteLLM Image Error: {e}")
        return {"status": "error", "message": str(e)}
