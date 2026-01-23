import React from 'react';

const HelpModal = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center border-b pb-3 mb-4 shrink-0">
          <h2 className="text-2xl font-bold">操作帮助</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-3xl font-light"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        
        <div className="space-y-6 overflow-y-auto pr-2 text-gray-700">
          {/* Section 1: Canvas Operations */}
          <div>
            <h3 className="text-xl font-semibold mb-2 border-l-4 border-blue-500 pl-3">1. 基本操作</h3>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li><strong>缩放:</strong> 使用鼠标滚轮。</li>
              <li><strong>平移:</strong> 按住 <strong>鼠标中键</strong> 然后拖动。</li>
              <li><strong>上传:</strong> 可以点击上传，拖拽上传。</li>
              <li><strong>选择/移动对象:</strong> 使用“选择工具”单击选中,然后直接拖动。多选：按住ctrl单击增加，按住atl单击减少。框选：从上往下为框内框选，从下往上为框接触到的元素框选。</li>
              <li><strong>旋转对象:</strong> 拖动选中对象上方的旋转控制点。</li>
              <li><strong>缩放对象:</strong> 拖动边框控制点为等比例缩放，拖动边缘线为自定义缩放。</li>
              <li><strong>裁剪对象:</strong> 浮动栏左上角点击切换到裁剪框模式，此模式只编辑外框，内部图片保持不变。</li>
              <li><strong>内部缩放:</strong> 类似indesign，外部裁剪框内部缩放框。</li>
              <li><strong>画布:</strong> 画布为真实像素，上面摆放图片笔画等随意内容，而后右键合成图片，再作为单张图片使用。如进入comfyui或者api。也可合成遮罩。</li>
              <li><strong>图片转画布:</strong> 图片右键创建画布，将创建图片完整像素的画布，可在上面涂画或者做遮罩，如果做遮罩，应该把图片不透明度设置为0（悬浮栏中）再合成遮罩。</li>
              <li><strong>图片应用遮罩:</strong> 按住ctrl先点击图片，再点击遮罩，然后右键使用合成选中项，可合成透明的png图片。</li>
            </ul>
          </div>

          {/* Section 2: Right Panel & Execution Modes */}
          <div>
            <h3 className="text-xl font-semibold mb-2 border-l-4 border-blue-500 pl-3">2. 右侧面板：两种核心模式</h3>
            <p className="mt-2">
              右侧面板是核心控制区，提供两种工作模式。点击面板左侧的 <kbd>&lt;</kbd> / <kbd>&gt;</kbd> 箭头可折叠或展开面板。
            </p>
            <ul className="space-y-3 mt-3">
              <li className="p-3 bg-gray-50 rounded-lg">
                <strong className="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg> ComfyUI 模式</strong>
                <p className="mt-1 text-sm">此模式用于运行本地的 ComfyUI 工作流。您可以在此管理工作流文件，并将画布中的元素与工作流的特定输入节点进行“绑定”。</p>
                <p className="mt-2 text-sm font-semibold">导入工作流并设定接口</p>
                <p className="mt-2 text-sm font-semibold">导入工作流后应设置输入接口id，fieldname，输出接口id，（ID为comfyui节点左上角的#数字，fieldname为节点的输入字段名）</p>
                <p className="mt-2 text-sm font-semibold">如何绑定插槽？</p>
                <p className="text-sm">在画布上右键单击一个图层（如图片、蒙版），在菜单中选择 <strong>“绑定为...”</strong>，然后选择要绑定的插槽（如 `base_image`, `mask` 等）。绑定后，点击“执行”按钮，该图层的数据就会被发送到工作流对应的节点中。</p>
              </li>
              <li className="p-3 bg-gray-50 rounded-lg">
                <strong className="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> AI 助手模式</strong>
                <p className="mt-1 text-sm">此模式提供一个聊天界面，可与支持视觉的 AI 模型（如 Gemini, GPT-4 Vision）进行交互。您可以发送文字，也可以将画布中的图片作为视觉信息一同发送给 AI。</p>
                 <p className="mt-2 text-sm">AI 会自动理解上一轮对话中的图片上下文，方便您进行多轮修改。例如，发送一张图片并说“把天空换成蓝色”，AI 会基于该图片进行操作。</p>
                 <p className="mt-2 text-sm">需要在模型配置展开栏设置模型和apikey，也可以设置本地模型网页路径</p>
              </li>
            </ul>
          </div>

          {/* Section 3: Advanced Layer Actions */}
          <div>
            <h3 className="text-xl font-semibold mb-2 border-l-4 border-blue-500 pl-3">3. 打包和保存</h3>
            <p className="mt-2">上方栏的功能</p>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li><strong>打包</strong> 把界面上所有内容（包括图片）打包存在硬盘随意位置</li>
              <li><strong>导入项目:</strong> 左上角箭头内，可导入打包的项目，将在workspace新建项目，并把所有图片复制进去</li>
              <li><strong>保存快照:</strong> 在同一个项目中使用，保存当前状态</li>
              <li><strong>打开快照:</strong> 在同一个项目中使用，打开当前状态</li>
            </ul>
          </div>

          {/* Section 4: Advanced Layer Actions */}
          <div>
            <h3 className="text-xl font-semibold mb-2 border-l-4 border-blue-500 pl-3">4. 高级图层操作 (右键菜单)</h3>
            <p className="mt-2">在画布上右键单击图层，会弹出一个功能丰富的上下文菜单。</p>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li><strong>自动抠图 (Remove Background):</strong> 调用 `rembg` 模型自动移除图片背景，并在旁边生成一个透明背景的新图层。</li>
              <li><strong>创建遮罩图层 (Create Mask Layer):</strong> 在选中图片之上覆盖一个半透明的黑色图层，并自动切换到白色画笔，方便您绘制蒙版。</li>
              <li><strong>合成图片与蒙版 (Composite):</strong> 同时选中一个图片和一个蒙版（通常是黑白图），此功能会将它们合成为一张带透明通道的新图片。</li>
              <li><strong>从图片创建画布 (Create Canvas from Image):</strong> 根据选中图片的原始尺寸，在旁边创建一个等大的白色画布（Frame），并将图片复制一份放在新画布上。</li>
              <li><strong>裁剪模式 (Crop):</strong> 进入图片裁剪模式。拖动边框进行裁剪，拖动图片本身可调整图片在框内的位置。</li>
              <li><strong>本地保存 (Save Image Locally):</strong> 将当前图层的图像下载到您的电脑。</li>
            </ul>
          </div>
          
          {/* Section 5: Tools & Shortcuts */}
          <div>
            <h3 className="text-xl font-semibold mb-2 border-l-4 border-blue-500 pl-3">5. 工具及快捷键</h3>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li><strong>涂鸦工具:</strong> 用于自由绘制。可在右侧面板调整颜色、粗细、透明度。</li>
              <li><strong>钢笔工具:</strong> 用于绘制角点线。单击创建锚点，点击起点闭合路径，点击其他工具作为不闭合路径，也就是线条使用。</li>
              <li>
              
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t pt-4 mt-4 text-right shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
