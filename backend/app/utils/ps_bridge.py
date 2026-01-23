import os
import time
import json
import uuid
import shutil
import re

try:
    import comtypes
    from photoshop import Session
    HAS_PHOTOSHOP = True
except ImportError:
    HAS_PHOTOSHOP = False

# ---------------------------------------------------------
# 🛠️ 导出功能 (PS -> 画布)
# 核心策略：快照 -> 破坏性操作(栅格化) -> 复制 -> 回滚历史记录
# ---------------------------------------------------------

def _export_single_layer(ps, layer, index, batch_id, save_dir, url_prefix):
    """
    导出单个图层 - 【真·栅格化版】
    使用 "向下合并到空图层" (Merge Down) 策略。
    这会强制将 图层样式(投影/描边)、透明度、混合模式 全部烘焙成死像素。
    """
    app = ps.app
    doc = app.activeDocument

    # 1. 选中图层
    try:
        doc.activeLayer = layer
    except:
        return None

    # === 🌟 存档: 记录历史状态 ===
    try:
        start_state = doc.activeHistoryState
    except:
        return None

    try:
        # === 2. 创建副本 ===
        # 必须操作副本，不能动原图
        temp_layer = layer.duplicate()
        
        # === 🌟 核心黑科技: 三明治合并法 ===
        # 为了把特效(投影等)和透明度"烘焙"进像素，我们需要把它和一个普通空图层合并
        
        # A. 新建一个空白图层
        empty_layer = doc.artLayers.add()
        empty_layer.name = "MERGE_BASE"
        
        # B. 把空白图层移动到 temp_layer 的下面
        # ElementPlacement.PlaceAfter = 放在目标之后(即视觉上的下方)
        empty_layer.move(temp_layer, ps.ElementPlacement.PlaceAfter)
        
        # C. 选中 temp_layer (上面的图层)
        doc.activeLayer = temp_layer
        
        # D. 向下合并 (Merge)
        # 这步操作会把 temp_layer (带特效/透明度) + empty_layer (实心像素) 
        # 挤压成一个新的 baked_layer (所有特效都变成了像素)
        baked_layer = temp_layer.merge()

        # === 3. 获取烘焙后的精确坐标 ===
        # 比如加了外发光，bounds 会比原图层大一圈，这时候才能取到正确的大小
        bounds = [float(x) for x in baked_layer.bounds]
        left, top, right, bottom = bounds
        width = right - left
        height = bottom - top
        
        # 忽略空图层
        if width <= 0.1 or height <= 0.1:
            doc.activeHistoryState = start_state
            return None

        # === 4. 复制像素 ===
        baked_layer.copy()

    except Exception as e:
        print(f"  ⚠️ 烘焙失败: {layer.name} -> {e}")
        doc.activeHistoryState = start_state
        return None

    # === 🌟 回滚: 无论后面发生什么，先让原文档恢复原样 ===
    # 只要 copy 完成，数据就在剪贴板里了，原文档可以复原了
    doc.activeHistoryState = start_state

    # === 5. 保存到新文档 ===
    try:
        print(f"  📤 导出(含特效): {layer.name}")
        
        # 继承分辨率
        target_res = doc.resolution
        new_doc = app.documents.add(width, height, target_res, "temp", 2, 3)
        
        new_doc.paste()
        
        # 保存
        options = ps.PNGSaveOptions()
        options.compression = 0
        options.interlaced = False
        
        safe_name = layer.name.replace(" ", "_").replace("/", "-")
        filename = f"{batch_id}_{index}_{safe_name}.png"
        save_path = os.path.join(save_dir, filename)
        
        new_doc.saveAs(save_path, options, True)
        new_doc.close(2) 
        
        # 恢复焦点
        app.activeDocument = doc

        return {
            "id": f"{batch_id}_{index}",
            "name": layer.name,
            "src": f"{url_prefix}/{filename}", 
            "filename": filename,
            "x": left,
            "y": top,
            "width": width,
            "height": height,
            "z_index": index,
            "opacity": layer.opacity # 注意：因为已经烘焙进像素了，这里虽然记录了透明度，但图片本身已经是半透明像素了
        }

    except Exception as e:
        print(f"  ❌ 保存失败: {e}")
        return None
def export_scene_to_canvas(save_dir, url_prefix):
    """
    【导出入口】
    生成 JSON 记录画布容器尺寸，并导出所有可见图层。
    save_dir: 图片和 JSON 保存的绝对路径
    url_prefix: 前端访问这些图片的 URL 前缀 (如 /files/Project_X/ps_exchange)
    """
    if not HAS_PHOTOSHOP:
        return {"error": "Photoshop library not installed."}

    # 确保目录存在
    os.makedirs(save_dir, exist_ok=True)
    
    # 生成本次批次号
    batch_id = uuid.uuid4().hex[:8]
    print(f"🚀 开始导出 (批次: {batch_id})")

    # [关键修复] 在当前线程初始化 COM (解决 asyncio.to_thread 导致的连接失败)
    if HAS_PHOTOSHOP:
        comtypes.CoInitialize()

    try:
        with Session() as ps:
            app = ps.app
            if app.documents.length == 0:
                return {"error": "没打开文档"}

            doc = app.activeDocument
            original_ruler = app.preferences.rulerUnits
            original_layer = doc.activeLayer
            
            # 强制单位为像素
            app.preferences.rulerUnits = ps.Units.Pixels

            try:
                # === 1. 记录“容器”信息 (原始画布) ===
                scene_data = {
                    "batch_id": batch_id,
                    "canvas_width": doc.width,
                    "canvas_height": doc.height,
                    "resolution": doc.resolution,
                    "layers": []
                }
                
                # === 2. 导出“内容”信息 (图层) ===
                layers = doc.layers
                total = len(layers)

                for i, layer in enumerate(layers):
                    if layer.visible:
                        # z_index 越大越靠上
                        z_score = total - i
                        data = _export_single_layer(ps, layer, z_score, batch_id, save_dir, url_prefix)
                        if data:
                            scene_data["layers"].append(data)

                # 尝试还原最初选中的图层
                try: doc.activeLayer = original_layer
                except: pass

            except Exception as e:
                print(f"❌ 导出流程出错: {e}")
                return {"error": str(e)}
            finally:
                # 还原单位设置
                app.preferences.rulerUnits = original_ruler
    except Exception as e:
        return {"error": f"Photoshop connection failed: {e}"}

    # 生成 JSON
    json_filename = f"{batch_id}_layout.json"
    json_path = os.path.join(save_dir, json_filename)
    
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(scene_data, f, indent=2, ensure_ascii=False)

    print(f"✅ 导出成功: {json_filename}")
    # 返回 JSON 路径供前端使用
    return json_path


# ---------------------------------------------------------
# 🛠️ 智能导入功能 (画布 -> PS)
# ---------------------------------------------------------

def _import_single_png_to_doc(ps, target_doc, path, x, y, width=None, height=None, name=None):
    """
    底层操作：将一张 PNG 贴入【已存在的】target_doc 中，并移动到指定位置
    """
    app = ps.app
    try:
        # 打开 PNG
        temp_doc = app.open(path)
        
        # [Fix] 获取原始物理尺寸 (使用图片原尺寸而非图层内容尺寸)
        # 这样可以正确处理带透明边框的图片，防止内容被错误拉伸
        orig_w = float(temp_doc.width)
        orig_h = float(temp_doc.height)
        
        # 分辨率对齐 (防止 72dpi 图片贴入 300dpi 文档变小)
        if temp_doc.resolution != target_doc.resolution:
            try: temp_doc.resizeImage(Resolution=target_doc.resolution)
            except: pass

        # [Fix] 使用 duplicate 代替 copy/paste
        # duplicate 能保留图层相对于画布的绝对位置 (即保留透明边框的偏移)
        layer = temp_doc.activeLayer
        new_layer = layer.duplicate(target_doc, ps.ElementPlacement.PlaceAtBeginning)
        
        temp_doc.close(2) # 关闭 PNG (不保存)

        # 切换回目标文档
        app.activeDocument = target_doc
        
        # 确保选中新图层 (处理 duplicate 可能不返回对象的情况)
        if new_layer is None:
            new_layer = target_doc.layers[0]
            
        target_doc.activeLayer = new_layer
        
        if name: new_layer.name = name

        # 1. 智能缩放 (基于原始尺寸计算比例)
        if width and height and orig_w > 0 and orig_h > 0:
            # [Fix] 增加容差判断，只有差异超过 1px 才缩放，避免浮点数误差导致的微小拉伸/模糊
            if abs(width - orig_w) > 1 or abs(height - orig_h) > 1:
                scale_x = (width / orig_w) * 100.0
                scale_y = (height / orig_h) * 100.0
                new_layer.resize(scale_x, scale_y, ps.AnchorPosition.TopLeft)
        
        # 2. 绝对定位
        # duplicate 后图层位置相对于 (0,0) 的偏移量保持不变，直接 translate(x, y) 即可
        new_layer.translate(x, y)
        
        return True
    except Exception as e:
        print(f"  ❌ 贴图失败: {e}")
        return False

def _find_sibling_json(png_path):
    """
    黑科技：根据 PNG 文件名 (a1b2_1_Name.png) 反查同目录下的 JSON (a1b2_layout.json)
    """
    dirname = os.path.dirname(png_path)
    basename = os.path.basename(png_path)
    
    # 提取开头的 8位 UUID
    match = re.match(r"^([a-f0-9]{8})_", basename)
    if match:
        batch_id = match.group(1)
        json_name = f"{batch_id}_layout.json"
        json_path = os.path.join(dirname, json_name)
        if os.path.exists(json_path):
            return json_path
    return None

def _restore_from_json(ps, json_path, import_all=True, target_filename=None, force_new_document=False):
    """
    根据 JSON 还原场景 (核心逻辑)
    import_all=True  -> 还原所有图层
    import_all=False -> 只还原 target_filename 指定的那一张，但基于 JSON 建立画布
    """
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    app = ps.app
    app.displayDialogs = ps.DialogModes.DisplayNoDialogs # 禁止弹窗
    base_dir = os.path.dirname(json_path)
    
    # 1. 准备画布 (Container)
    if app.documents.length == 0 or force_new_document:
        # 如果 PS 为空或强制新建，按照 JSON 里的 "canvas_" 重建原始大画布
        w = data.get("canvas_width", 1920)
        h = data.get("canvas_height", 1080)
        res = data.get("resolution", 72)
        print(f"  🆕 基于配置重建画布: {w}x{h} ({res} ppi)")
        target_doc = app.documents.add(w, h, res, "Restored_Canvas", 2, 3)
    else:
        # 如果已有文档，则贴入当前文档
        target_doc = app.activeDocument

    # 2. 筛选要导入的图层 (Content)
    layers_data = data.get("layers", [])
    
    # 如果指定了文件名，就只处理那一个
    if not import_all and target_filename:
        # 找到 JSON 里对应这张图的数据
        layers_data = [l for l in layers_data if l["filename"] == target_filename]
        if not layers_data:
            print(f"  ⚠️ JSON里没找到这张图的记录，将尝试作为普通图片导入。")
            # 如果 JSON 里没有（比如改名了），就返回 False，让外层按普通图片处理
            return False

    # 按 z-index 从小到大排序 (确保底层先画)
    layers_data.sort(key=lambda l: l.get("z_index", 0))

    # 3. 循环导入
    count = 0
    for l_data in layers_data:
        fname = l_data.get("filename")
        local_path = os.path.join(base_dir, fname)
        
        if os.path.exists(local_path):
            print(f"  ⬇️ 还原图层: {l_data.get('name')}")
            _import_single_png_to_doc(
                ps, target_doc, local_path, 
                x=l_data.get("x", 0), 
                y=l_data.get("y", 0),
                width=l_data.get("width"),   # 传入宽
                height=l_data.get("height"), # 传入高
                name=l_data.get("name")
            )
            count += 1
        else:
            print(f"  ❌ 找不到文件: {local_path}")
            
    print(f"✅ 处理完成，共导入 {count} 个图层")
    return count

def smart_import_to_ps(file_path, x=None, y=None, force_new_document=False):
    """
    【导入入口】
    - 传入 JSON: 还原整个场景
    - 传入 PNG: 
        1. 尝试寻找同名 JSON，重建画布并精确还原位置。
        2. 如果找不到 JSON，则作为普通图片导入（空PS直接打开，有PS贴入位置）。
    """
    if not HAS_PHOTOSHOP:
        print("⚠️ [Mock] Photoshop library not installed. Skipping.")
        return {"status": "success", "mock": True, "message": "Library not installed"}

    abs_path = os.path.abspath(file_path)
    if not os.path.exists(abs_path):
        return {"error": "File not found"}

    print(f"🚀 处理导入请求: {os.path.basename(abs_path)}")

    # [关键修复] 在当前线程初始化 COM (解决 asyncio.to_thread 导致的连接失败)
    if HAS_PHOTOSHOP:
        comtypes.CoInitialize()

    imported_count = 0
    try:
        with Session() as ps:
            app = ps.app
            original_ruler = app.preferences.rulerUnits
            app.preferences.rulerUnits = ps.Units.Pixels
            
            try:
                ext = os.path.splitext(abs_path)[1].lower()
                
                # === 情况 A: 拖入 layout.json ===
                if ext == ".json":
                    imported_count = _restore_from_json(ps, abs_path, import_all=True, force_new_document=force_new_document)
                    
                # === 情况 B: 拖入图片 (.png/.jpg) ===
                elif ext in [".png", ".jpg", ".jpeg"]:
                    
                    # 1. 尝试寻找“灵魂” (JSON)
                    sibling_json = _find_sibling_json(abs_path)
                    is_restored = False
                    
                    if sibling_json:
                        print(f"  🔍 发现关联配置: {os.path.basename(sibling_json)}")
                        # 尝试利用 JSON 还原
                        count = _restore_from_json(ps, sibling_json, import_all=False, target_filename=os.path.basename(abs_path))
                        is_restored = count > 0
                    
                    # 2. 如果没找到 JSON，或者 JSON 里没这图，走普通逻辑
                    if not is_restored:
                        print("  ⚠️ 按普通图片导入")
                        
                        # 逻辑修正：如果 PS 为空，直接打开原图 (完美保留尺寸)
                        if app.documents.length == 0:
                            print("  🆕 PS为空，直接打开原图")
                            app.open(abs_path)
                        else:
                            # 贴入当前文档
                            target_x = x if x is not None else 0
                            target_y = y if y is not None else 0
                            _import_single_png_to_doc(ps, app.activeDocument, abs_path, target_x, target_y)
                        imported_count = 1

            except Exception as e:
                print(f"❌ 导入过程出错: {e}")
                return {"error": str(e)}
            finally:
                app.preferences.rulerUnits = original_ruler
                
        return {"status": "success", "count": imported_count}

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    # 可以在这里写一行代码快速测试
    # smart_import_to_ps(r"你的图片路径")
    pass