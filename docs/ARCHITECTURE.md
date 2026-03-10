# GeoMotion 技术架构文档

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│   Next.js 14 + TypeScript + Tailwind CSS                    │
│   ┌─────────────┐  ┌─────────────────────────────────────┐ │
│   │  图片上传   │  │       GeoGebra 嵌入                  │ │
│   └─────────────┘  │  (图形渲染 + 交互 + 动画)            │ │
│                    └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Next.js API Routes                       │
│   /api/analyze          /api/generate-graphic               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     OpenRouter API                           │
│   调用 GPT-4 Vision 或其他 VLM                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 前端架构

### 目录结构

```
frontend/src/
├── app/
│   ├── page.tsx                 # 首页
│   ├── layout.tsx               # 布局
│   ├── globals.css              # 全局样式
│   └── api/
│       ├── analyze/
│       │   └── route.ts         # 分析接口
│       └── generate-graphic/
│           └── route.ts         # 图形生成接口
├── components/
│   ├── ui/                      # shadcn/ui 组件
│   ├── GeoGebraViewer.tsx       # GeoGebra 嵌入组件
│   └── ImageUploader.tsx        # 图片上传组件
├── lib/
│   └── openrouter.ts            # OpenRouter API 封装
└── types/
    └── index.ts                 # 类型定义
```

---

## GeoGebra 嵌入

### 加载 GeoGebra Applet

```typescript
// components/GeoGebraViewer.tsx
'use client';

import { useEffect, useRef } from 'react';

interface GeoGebraViewerProps {
  commands: string;              // GeoGebra 命令脚本
  width?: number;
  height?: number;
  showToolbar?: boolean;
}

export function GeoGebraViewer({
  commands,
  width = 800,
  height = 500,
  showToolbar = false,
}: GeoGebraViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appletRef = useRef<any>(null);

  useEffect(() => {
    // 动态加载 GeoGebra 脚本
    const script = document.createElement('script');
    script.src = 'https://www.geogebra.org/apps/deployggb.js';
    script.onload = () => {
      const ggbApplet = new (window as any).GGBApplet({
        appName: 'geometry',
        width,
        height,
        showToolBar: showToolbar,
        showAlgebraInput: false,
        showMenuBar: false,
        enableLabelDrags: false,
        enableShiftDragZoom: true,
      }, true);

      ggbApplet.inject(containerRef.current);
      appletRef.current = ggbApplet;

      // 执行命令
      commands.split('\n').forEach((cmd) => {
        if (cmd.trim()) {
          ggbApplet.evalCommand(cmd.trim());
        }
      });
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [commands, width, height, showToolbar]);

  return <div ref={containerRef} />;
}
```

### 逐行执行动画

```typescript
// 播放动画：逐行执行 GeoGebra 命令
function playAnimation(commands: string, delay: number = 1000) {
  const lines = commands.split('\n').filter(l => l.trim());
  let index = 0;

  const interval = setInterval(() => {
    if (index < lines.length) {
      appletRef.current?.evalCommand(lines[index]);
      index++;
    } else {
      clearInterval(interval);
    }
  }, delay);

  return () => clearInterval(interval);
}
```

---

## 数据类型

### GeoGebraCommand

```typescript
interface GeoGebraCommand {
  type: 'point' | 'line' | 'segment' | 'polygon' | 'circle' | 'angle' | 'text';
  name: string;
  definition: string;
  style?: {
    color?: string;
    thickness?: number;
    lineStyle?: number;          // 1=实线, 2=虚线
  };
}
```

### AnalysisResult

```typescript
interface AnalysisResult {
  id: string;
  geogebra: string;              // GeoGebra 命令脚本
  conditions: string[];          // 已知条件
  goal: string;                  // 求解目标
  solution: string[];            // 解题步骤
}
```

---

## API 接口规范

### POST /api/analyze

**请求：**
```typescript
{
  image: string;        // Base64 编码的图片，含 data URI 前缀
                       // 例如: "data:image/jpeg;base64,/9j/4AAQ..."
}
```

**响应：**
```typescript
{
  success: boolean;
  data?: AnalysisResult;
  error?: { code: string; message: string };
}
```

### POST /api/generate-graphic

**请求：**
```typescript
{
  text: string;         // 题目文本
  sketch?: string;      // 草图 Base64（可选），含 data URI 前缀
}
```

**响应：**
```typescript
{
  success: boolean;
  data?: {
    id: string;
    geogebra: string;   // GeoGebra 命令脚本
    format: 'svg' | 'png';
    content: string;    // SVG 字符串或 PNG Base64
  };
  error?: { code: string; message: string };
}
```

---

## VLM 集成

### OpenRouter 调用

```typescript
// lib/openrouter.ts

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function analyzeGeometry(imageBase64: string): Promise<AnalysisResult> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VLM_PROMPT },
            { type: 'image_url', image_url: { url: imageBase64 } }
          ]
        }
      ]
    })
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

### VLM Prompt 模板

```
你是一个几何数学专家。请分析这张几何题目图片。

## 任务
1. 识别所有几何图形
2. 提取已知条件
3. 识别求解目标
4. 给出解题步骤

## 输出格式（JSON）
{
  "geogebra": "A = (0, 0)\\nB = (5, 0)\\nC = (2.5, 4.33)\\np = Polygon(A, B, C)",
  "conditions": ["AB = AC", "∠A = 60°"],
  "goal": "求∠B的度数",
  "solution": ["根据等腰三角形性质...", "∠B = (180° - 60°) / 2 = 60°"]
}

## GeoGebra 命令参考
- 点: A = (x, y)
- 线段: s = Segment(A, B)
- 多边形: p = Polygon(A, B, C)
- 圆: c = Circle(A, B) 或 c = Circle(A, 3)
- 角度: α = Angle(B, A, C)
- 中点: M = Midpoint(A, B)
- 垂线: PerpendicularLine(A, s)
- 平行线: Parallel(A, s)
- 文本: Text("内容", position)
- 虚线: SetLineStyle(element, 2)

坐标系建议：使用合理的实际坐标，便于在 GeoGebra 中显示。
```

---

## 部署

### 环境变量

```env
OPENROUTER_API_KEY=your-api-key
```

### 部署平台

- 推荐：Vercel
- 无需独立后端，Next.js API Routes 足够

---

*文档版本: 3.0 | 最后更新: 2026-03-10*
