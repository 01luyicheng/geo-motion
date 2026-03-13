# GeoMotion 比赛项目打包清单

## 项目信息

- **项目名称**: GeoMotion
- **项目描述**: 使用 VLM 将几何题目转换为动态图形的教学辅助工具
- **版本**: 1.0
- **打包日期**: 2026-03-13

---

## 打包文件清单

### 核心代码文件
```
frontend/
├── src/
│   ├── app/
│   │   ├── analyze/[id]/page.tsx      # 分析结果页面
│   │   ├── api/
│   │   │   ├── analyze/route.ts       # 图片分析 API
│   │   │   ├── fix-commands/route.ts  # 命令修复 API
│   │   │   └── generate-graphic/route.ts  # 图形生成 API
│   │   ├── globals.css                # 全局样式
│   │   ├── layout.tsx                 # 根布局
│   │   └── page.tsx                   # 首页
│   ├── components/
│   │   ├── AnimationControls.tsx      # 动画控制组件
│   │   ├── ErrorBoundary.tsx          # 错误边界
│   │   ├── GeoGebraViewer.tsx         # GeoGebra 嵌入组件
│   │   ├── ImageUploader.tsx          # 图片上传组件
│   │   ├── ThemeProvider.tsx          # 主题提供者
│   │   └── ThemeToggle.tsx            # 主题切换
│   ├── hooks/
│   │   ├── useAnimation.ts            # 动画 Hook
│   │   ├── useRealtimeGeoGebra.ts     # GeoGebra 实时 Hook
│   │   └── useStreamContent.ts        # 流式内容 Hook
│   ├── lib/
│   │   ├── openrouter.ts              # OpenRouter API 封装
│   │   ├── stream.ts                  # 流处理工具
│   │   └── utils.ts                   # 工具函数
│   └── types/
│       └── index.ts                   # TypeScript 类型定义
├── .env.local.example                 # 环境变量模板
├── next.config.js                     # Next.js 配置
├── package.json                       # 依赖配置
├── tailwind.config.js                 # Tailwind 配置
└── tsconfig.json                      # TypeScript 配置
```

### 文档文件
```
docs/
├── API.md                             # API 接口文档
├── ARCHITECTURE.md                    # 技术架构文档
├── ISSUES.md                          # 已知问题清单
└── SPEC.md                            # 功能规格文档
```

### 部署配置文件
```
├── deploy.bat                         # Windows 自动部署脚本
├── deploy.sh                          # Linux/macOS 自动部署脚本
├── Dockerfile                         # Docker 构建文件
├── docker-compose.yml                 # Docker Compose 配置
├── vercel.json                        # Vercel 部署配置
├── .env.example                       # 环境变量示例
├── DEPLOY.md                          # 部署指南
├── PACKAGE.md                         # 本打包清单
├── README.md                          # 项目说明
└── .gitignore                         # Git 忽略配置
```

---

## 快速开始（3种方式）

### 方式一：Windows 一键部署（最简单）

1. 双击运行 `deploy.bat`
2. 按提示配置 OpenRouter API Key
3. 自动启动服务

### 方式二：Docker 部署（推荐生产环境）

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 OPENROUTER_API_KEY

# 2. 启动服务
docker-compose up -d

# 3. 访问 http://localhost:3000
```

### 方式三：Vercel 部署（推荐在线演示）

1. Fork 项目到 GitHub
2. 登录 [Vercel](https://vercel.com)
3. 导入项目，设置 Root Directory 为 `frontend`
4. 添加环境变量 `OPENROUTER_API_KEY`
5. 点击 Deploy

---

## 环境要求

- **Node.js**: 18.0+
- **npm**: 8.0+
- **OpenRouter API Key**: 必需

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | Next.js 14 + React 18 |
| 开发语言 | TypeScript |
| 样式方案 | Tailwind CSS |
| UI 组件 | shadcn/ui |
| 图形渲染 | GeoGebra 嵌入 |
| AI 服务 | OpenRouter API |

---

## 核心功能

1. **图片上传分析**: 拍照上传几何题目，VLM 自动识别并分析
2. **动态图形展示**: 基于 GeoGebra 的交互式图形
3. **动画播放**: 逐行执行作图命令，展示解题过程
4. **命令修复**: 自动修复和优化 GeoGebra 命令

---

## 注意事项

1. **API Key 安全**: 请勿将真实的 `.env.local` 文件提交到代码仓库
2. **网络依赖**: 需要访问 openrouter.ai 和 geogebra.org
3. **浏览器兼容**: 推荐使用 Chrome/Edge/Firefox 最新版本

---

## 项目亮点

- ✅ 创新的几何教学辅助工具
- ✅ 完整的类型安全（TypeScript）
- ✅ 响应式设计，支持移动端
- ✅ 多种部署方式支持
- ✅ 详细的文档和部署脚本

---

**祝比赛顺利！**
