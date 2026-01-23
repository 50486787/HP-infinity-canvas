# HP-infinity-canvas
# version1.2-20260123 增加与ps的交互和与adobe bridge的交互，需要另外安装相应软件的插件和脚本，也修复了启动器
## **需要先安装node.js。https://nodejs.org/en**
## **需要先安装python3.10以上版本**
## **安装：在frontend双击start.bat安装并启动前端，在backend双击start.bat安装并启动后端，第二次启动才建议使用主目录的start_all.bat。**
## **快捷启动：双击start_all.bat，会自动启动前端和后端然后开启网页。**

---

## **帮助：网页内右上角的问号，有大概的使用方法。**



## 前端readme：

如果你不懂编程，请按以下步骤操作：

1. **准备环境**: 确保你的电脑安装了 Node.js (下载 LTS 版本并一路“下一步”安装)。
2. **下载项目**: 点击网页右上角的 `Code` -> `Download ZIP`，下载后解压。
3. **一键运行**: 进入文件夹，双击 **`start.bat`** 文件。
   - 它会自动帮你下载需要的库（第一次会慢一点）。
   - 看到 `Local: http://localhost:5173` 字样时，在浏览器打开这个网址即可。

---

## 🛠️ 开发人员指南

如果你是开发者，可以使用标准流程：

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```





## 后端readme：

1. **安装 Python**: 确保电脑安装了 Python (3.10 或更高版本)。
2. **一键运行**: 双击 `start.bat`。
   - 脚本会自动检测并安装 `uv` 工具。
   - `uv` 会自动创建虚拟环境并下载所有依赖。
   - 服务启动在: `http://127.0.0.1:8020`

## 🛠️ 常用命令 (开发者)

如果你习惯使用命令行：

```bash
# 同步依赖
uv sync

# 启动服务
uv run uvicorn main:app --reload --port 8020
```
