# GeoMotion

使用VLM将几何题目转换为动态图形的教学辅助工具。

## 功能特点

- **几何题 → 动图**: 拍照上传几何题目，自动生成解题动画
- **草图 → 精确图**: 输入题目文本+手绘草图，生成印刷级精确图形

## 技术栈

- **前端**: Next.js 14, React, TypeScript
- **样式**: Tailwind CSS, shadcn/ui
- **图形**: GeoGebra 嵌入
- **VLM**: OpenRouter API

## 项目结构

```
geo-motion/
├── docs/
│   ├── SPEC.md           # 功能规格
│   ├── ARCHITECTURE.md   # 技术架构
│   └── API.md            # API文档
├── frontend/
│   ├── src/
│   │   ├── app/          # 页面和API路由
│   │   ├── components/   # 组件
│   │   └── lib/          # 工具函数
│   └── package.json
└── README.md
```

## 开发

```bash
cd frontend
npm install
npm run dev
```

创建 `.env.local` 文件：

```env
OPENROUTER_API_KEY=your-api-key
```

访问 http://localhost:3000