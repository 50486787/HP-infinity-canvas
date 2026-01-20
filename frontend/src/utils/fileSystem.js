/**
 * src/utils/fileSystem.js
 * 核心 IO 模块：实现语义化扁平存储 (ZIP) 与 导出逻辑
 */
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// --- 辅助：将 Blob/URL 转为 ArrayBuffer ---
const fetchAsset = async (url) => {
    const res = await fetch(url);
    return await res.blob();
};

// --- 辅助：获取文件后缀 ---
const getExt = (mimeType, src) => {
    if (src && src.toLowerCase().endsWith('.jpg')) return 'jpg';
    if (src && src.toLowerCase().endsWith('.png')) return 'png';
    if (mimeType === 'image/jpeg') return 'jpg';
    return 'png'; // 默认
};

// ==========================================
// 1. 打包 (Package) -> 全量归档 (.zip)
// ==========================================
export const saveProjectPackage = async (projectData, fileName) => {
    const zip = new JSZip();
    const { images, ...meta } = projectData;

    // 1. 创建目录结构
    const inputsFolder = zip.folder("inputs");
    const generationsFolder = zip.folder("generations");

    // 2. 处理所有图片资源
    // 我们需要深拷贝 images 数组，因为我们要把里面的 src (Blob URL) 替换为 zip 内的相对路径
    const serializedImages = await Promise.all(images.map(async (img) => {
        const newImg = { ...img };

        // 只有 image 类型且有 src 的才需要处理资源
        if (img.type === 'image' && img.src) {
            try {
                const blob = await fetchAsset(img.src);
                const ext = getExt(blob.type, img.src);
                
                // 命名规则：原文件名(或ID) + 简短Hash.后缀
                // 这里的 Hash 简单用 timestamp 或 random 模拟，实际项目可用 crypto
                const safeName = (img.originalName || img.id).replace(/[^a-zA-Z0-9]/g, '_');
                const zipFileName = `${safeName}_${Math.random().toString(36).substr(2, 5)}.${ext}`;

                // 区分 inputs (用户上传) 和 generations (AI生成)
                // 简单判定：如果是本地上传的通常没有 sourceIds，生成的有。或者根据逻辑标记。
                // 这里暂定：所有都放 inputs，除非有 explicit flag。
                // [Modified] 增强判定逻辑：除了 check isGenerated 标志，还检查 ID 前缀
                // 这能防止因 metadata 丢失导致的分类错误，确保 gen_, rembg_, result_ 开头的图片一定进 generations
                const isGenerated = img.isGenerated === true || 
                                    (img.id && (img.id.startsWith('gen_') || img.id.startsWith('rembg_') || img.id.startsWith('result_')));

                if (isGenerated) {
                    generationsFolder.file(zipFileName, blob);
                    newImg.src = `generations/${zipFileName}`;
                } else {
                    inputsFolder.file(zipFileName, blob);
                    newImg.src = `inputs/${zipFileName}`;
                }
            } catch (e) {
                console.warn("Failed to pack image:", img.id, e);
                // 失败时保留原 src (可能是外链)
            }
        }
        return newImg;
    }));

    // 3. 写入 project.json
    const finalJson = {
        meta: {
            ...meta,
            savedAt: Date.now(),
            version: '2.0'
        },
        images: serializedImages
    };

    zip.file("project.json", JSON.stringify(finalJson, null, 2));

    // 4. 生成并下载
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `${fileName}_${Date.now()}.zip`);
};

// ==========================================
// 2. 保存结构 (Save) -> 轻量级 (.json)
// ==========================================
export const saveProjectStructure = (projectData, fileName) => {
    // 仅保存 JSON，不包含图片实体，图片路径如果是 Blob URL 在重开后会失效
    // 这通常用于"临时保存"或"开发调试"。
    // 蓝图中这是一个轻量级操作。
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: "application/json" });
    saveAs(blob, `${fileName}.json`);
};

// ==========================================
// 3. 提取器 (Extractor) -> 保存原图
// ==========================================
export const saveOriginalImage = async (imgObj) => {
    if (!imgObj || !imgObj.src) return;
    try {
        const blob = await fetchAsset(imgObj.src);
        // 使用 file-saver 保存，保证 100% 原画质
        saveAs(blob, `${imgObj.originalName || imgObj.id}.${getExt(blob.type, imgObj.src)}`);
    } catch (e) {
        console.error("Save original failed", e);
    }
};

// ==========================================
// 4. 文本IO -> 保存文本
// ==========================================
export const saveTextFile = (textObj) => {
    if (!textObj || !textObj.text) return;
    const blob = new Blob([textObj.text], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${textObj.id}.txt`);
};

// ==========================================
// 5. 打开项目 (Open) -> 解析 .zip 或 .json
// ==========================================
export const loadProjectFile = async (file) => {
    if (file.name.endsWith('.json')) {
        const text = await file.text();
        return JSON.parse(text);
    } 
    else if (file.name.endsWith('.zip') || file.name.endsWith('.canvas')) {
        const zip = await JSZip.loadAsync(file);
        
        // 读取 project.json
        const jsonFile = zip.file("project.json");
        if (!jsonFile) throw new Error("Invalid project: missing project.json");
        
        const projectData = JSON.parse(await jsonFile.async("string"));

        // 还原图片路径：将相对路径 (inputs/xx.png) 转回 Blob URL
        const restoredImages = await Promise.all(projectData.images.map(async (img) => {
            if (img.type === 'image' && img.src && !img.src.startsWith('data:') && !img.src.startsWith('http')) {
                const imgFile = zip.file(img.src);
                if (imgFile) {
                    const blob = await imgFile.async("blob");
                    img.src = URL.createObjectURL(blob);
                }
            }
            return img;
        }));

        projectData.images = restoredImages;
        return projectData;
    }
    throw new Error("Unsupported file type");
};

// 导出合成图辅助函数 (Compositor)
export const exportCompositorImage = async (frameObj, allImages, generatorFunc) => {
    // 调用 imageGenerator 生成 Base64
    const dataURL = await generatorFunc(frameObj, allImages, false);
    // 转换并下载
    const res = await fetch(dataURL);
    const blob = await res.blob();
    // 文件名逻辑：使用 Frame 的 name
    const fileName = frameObj.name || frameObj.id || 'export';
    saveAs(blob, `${fileName}.png`);
};