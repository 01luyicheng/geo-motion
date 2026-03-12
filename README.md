# GeoMotion

使用VLM将几何题目转换为动态图形的教学辅助工具。

## 功能特点

- **几何题 → 动图**: 拍照上传几何题目，自动生成解题动画
- **草图 → 精确图**: 输入题目文本+手绘草图，生成印刷级精确图形
- **交互式图形**: 基于 GeoGebra，支持拖动顶点、缩放、测量
- **动画播放**: 逐行执行 GeoGebra 命令，展示作图过程

## 技术栈

- **前端**: Next.js 14, React, TypeScript
- **样式**: Tailwind CSS, shadcn/ui
- **图形**: GeoGebra 嵌入
- **VLM**: OpenRouter API (GPT-4 Vision)

---

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn
- OpenRouter API Key

### 1. 克隆项目

```bash
git clone https://github.com/01luyicheng/geo-motion.git
cd geo-motion
```

### 2. 安装依赖

```bash
cd frontend
npm install
```

### 3. 配置环境变量

复制示例文件：

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`，填入你的 OpenRouter API Key：

```env
OPENROUTER_API_KEY=sk-or-v1-your-api-key-here
```

获取 API Key：[OpenRouter 官网](https://openrouter.ai/keys)

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

---

## 部署到生产环境

### 部署到 Vercel（推荐）

1. **Fork/导入项目**
   - 登录 [Vercel](https://vercel.com)
   - 点击 "Add New Project"
   - 导入 GitHub 仓库

2. **配置构建设置**
   - Framework Preset: Next.js
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `.next`

3. **添加环境变量**
   - 进入项目 Settings → Environment Variables
   - 添加 `OPENROUTER_API_KEY`

4. **部署**
   - 点击 Deploy
   - 完成后会获得生产环境 URL

### 其他平台

#### Docker 部署

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci --only=production

COPY frontend/. .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

构建并运行：

```bash
docker build -t geo-motion .
docker run -p 3000:3000 -e OPENROUTER_API_KEY=your-key geo-motion
```

#### 静态导出

如需静态托管（CDN）：

```bash
# 修改 next.config.js
# output: 'export'

npm run build
# 输出到 out/ 目录
```

---

## 使用指南

### 上传几何题目

1. 打开首页，点击上传区域
2. 选择几何题目的图片（支持 JPG、PNG）
3. 等待 VLM 分析完成
4. 跳转到分析结果页

### 查看分析结果

- **GeoGebra 图形**: 可拖动顶点、缩放、测量
- **已知条件**: 列出题目给出的条件
- **求解目标**: 明确需要求解的内容
- **解题步骤**: 详细的解题过程

### 动画控制

- **播放**: 逐行执行 GeoGebra 命令
- **暂停**: 暂停动画
- **重置**: 清空图形重新开始
- **调速**: 调整动画播放速度

### 导出图形

- 复制 GeoGebra 命令，粘贴到 GeoGebra 软件
- 截图保存生成的图形

---

## API 接口

### POST /api/analyze

分析几何题目图片

**请求：**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "geogebra": "A = (0, 0)\nB = (5, 0)\n...",
    "conditions": ["AB = AC", "∠A = 60°"],
    "goal": "求∠B的度数",
    "solution": ["步骤1...", "步骤2..."]
  }
}
```

### POST /api/generate-graphic

根据文本生成精确图形

**请求：**
```json
{
  "text": "已知三角形ABC，AB=AC，顶角60度",
  "sketch": "data:image/jpeg;base64,..."
}
```

---

## 项目结构

```
geo-motion/
├── docs/
│   ├── SPEC.md           # 功能规格
│   ├── ARCHITECTURE.md   # 技术架构
│   ├── API.md            # API文档
│   └── ISSUES.md         # 已知问题
├── frontend/
│   ├── src/
│   │   ├── app/          # 页面和API路由
│   │   │   ├── page.tsx              # 首页
│   │   │   ├── layout.tsx            # 布局
│   │   │   ├── analyze/[id]/         # 分析结果页
│   │   │   └── api/                  # API路由
│   │   │       ├── analyze/route.ts
│   │   │       └── generate-graphic/route.ts
│   │   ├── components/   # 组件
│   │   │   ├── ImageUploader.tsx     # 图片上传
│   │   │   ├── GeoGebraViewer.tsx    # GeoGebra嵌入
│   │   │   └── ui/                   # shadcn组件
│   │   ├── lib/          # 工具函数
│   │   │   └── openrouter.ts         # VLM调用
│   │   └── types/
│   │       └── index.ts              # 类型定义
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── tsconfig.json
└── README.md
```

---

## 常见问题

### Q: 分析失败怎么办？

- 检查图片清晰度，确保几何图形可见
- 检查 OPENROUTER_API_KEY 是否有效
- 查看浏览器控制台和网络请求

### Q: GeoGebra 无法加载？

- 检查网络连接（需要访问 geogebra.org）
- 清除浏览器缓存重试

### Q: 如何更换 VLM 模型？

编辑 `frontend/src/lib/openrouter.ts`，修改 `model` 参数：

```typescript
model: 'anthropic/claude-3-opus-20240229'  // 或其他模型
```

可用模型列表：[OpenRouter Models](https://openrouter.ai/models)

---

## 开发计划

- [x] 基础架构搭建
- [x] 图片上传功能
- [x] VLM 分析接口
- [x] GeoGebra 嵌入
- [x] 动画播放控制
- [ ] 图形导出功能
- [ ] 历史记录保存
- [ ] 用户账户系统

---

## 贡献

欢迎提交 Issue 和 PR！

## 许可证

MIT License
