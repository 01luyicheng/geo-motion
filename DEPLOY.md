# GeoMotion 快速部署指南

## 项目简介

GeoMotion 是一个使用 VLM（视觉语言模型）将几何题目转换为动态图形的教学辅助工具。

**核心功能：**
- 拍照上传几何题目，自动生成解题动画
- 基于 GeoGebra 的交互式图形，支持拖动顶点、缩放、测量
- 动画播放控制，展示作图过程

---

## 环境要求

- **Node.js**: 18.0 或更高版本
- **npm**: 8.0 或更高版本（或 yarn 1.22+）
- **OpenRouter API Key**: 用于调用 VLM 模型

---

## 快速部署（3步完成）

### 方式一：使用自动部署脚本（推荐）

```bash
# 1. 进入项目目录
cd geo-motion

# 2. 运行自动部署脚本
./deploy.sh

# 3. 按提示输入 OpenRouter API Key
```

### 方式二：手动部署

#### 步骤 1: 安装依赖

```bash
cd frontend
npm install
```

#### 步骤 2: 配置环境变量

```bash
# 复制环境变量模板
cp .env.local.example .env.local

# 编辑 .env.local 文件，填入你的 API Key
# OPENROUTER_API_KEY=sk-or-v1-your-api-key-here
```

**获取 API Key:**
1. 访问 [OpenRouter 官网](https://openrouter.ai/keys)
2. 注册/登录账号
3. 创建新的 API Key
4. 复制 Key 到 `.env.local` 文件

#### 步骤 3: 启动服务

```bash
# 开发模式
npm run dev

# 生产构建
npm run build
npm start
```

访问 http://localhost:3000 即可使用。

---

## 部署到生产环境

### 部署到 Vercel（推荐）

1. **Fork/导入项目到 GitHub**

2. **登录 Vercel**
   - 访问 [vercel.com](https://vercel.com)
   - 点击 "Add New Project"
   - 导入 GitHub 仓库

3. **配置构建设置**
   - Framework Preset: `Next.js`
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `.next`

4. **添加环境变量**
   - 进入 Project Settings → Environment Variables
   - 添加 `OPENROUTER_API_KEY`
   - （可选）添加 `OPENROUTER_MODEL` 指定模型

5. **部署**
   - 点击 Deploy
   - 完成后获得生产环境 URL

### Docker 部署

```bash
# 构建镜像
docker build -t geo-motion .

# 运行容器
docker run -p 3000:3000 -e OPENROUTER_API_KEY=your-key geo-motion
```

---

## 目录结构

```
geo-motion/
├── frontend/          # Next.js 前端项目
│   ├── src/          # 源代码
│   ├── package.json  # 依赖配置
│   └── .env.local    # 环境变量（需手动创建）
├── docs/             # 项目文档
│   ├── API.md        # API 接口文档
│   ├── ARCHITECTURE.md # 技术架构
│   └── SPEC.md       # 功能规格
├── README.md         # 项目说明
└── DEPLOY.md         # 本部署指南
```

---

## 常见问题

### Q1: 安装依赖失败？

**解决方案：**
```bash
# 清除缓存后重试
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Q2: 提示 "OPENROUTER_API_KEY is required"？

**解决方案：**
确保已创建 `.env.local` 文件并正确填写 API Key。

### Q3: 分析功能无法使用？

**检查清单：**
- [ ] API Key 是否有效（在 OpenRouter 控制台检查）
- [ ] 网络是否能访问 openrouter.ai
- [ ] 浏览器控制台是否有错误信息

### Q4: GeoGebra 无法加载？

**解决方案：**
- 检查网络连接（需要访问 geogebra.org）
- 清除浏览器缓存后重试
- 检查浏览器是否阻止了第三方脚本

---

## 技术栈

- **前端框架**: Next.js 14 + React 18 + TypeScript
- **样式**: Tailwind CSS + shadcn/ui
- **图形**: GeoGebra 嵌入
- **AI**: OpenRouter API (多模态 VLM)

---

## 支持

如有问题，请查看：
- [项目文档](docs/)
- [GitHub Issues](https://github.com/01luyicheng/geo-motion/issues)

---

**版本**: 1.0  
**更新日期**: 2026-03-13
