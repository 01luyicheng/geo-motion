# GeoMotion 技术架构文档

## 系统架构

```text
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│   Next.js 14 + TypeScript + Tailwind CSS                    │
│   页面: /, /analyze/[id]                                    │
│   组件: ImageUploader, GeoGebraViewer, AnimationControls    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Next.js API Routes                       │
│   /api/analyze  /api/generate-graphic  /api/fix-commands    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     OpenRouter API                           │
│   可配置多模态模型（默认 qwen/qwen3-vl-235b-a22b-instruct）  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    GeoGebra Runtime                          │
│   通过 deployggb.js 在前端渲染与交互                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 当前实现对齐（2026-03-20）

### 前端关键入口

1. 首页流程编排: `frontend/src/app/page.tsx`
  - 双模式入口（分析几何题 / 草图转精确图）。
  - 支持流式输出、取消请求、语法校验重试、实时 GeoGebra 预览。

2. 结果页交互: `frontend/src/app/analyze/[id]/page.tsx`
  - 支持动画播放、命令复制、SVG 导出、命令自动修复。
  - 分享按钮当前只复制 URL，结果仍依赖本地存储。

3. 上传组件: `frontend/src/components/ImageUploader.tsx`
  - 已实现文件类型、大小、魔数校验（JPEG/PNG/WEBP）。

4. 图形渲染: `frontend/src/components/GeoGebraViewer.tsx`
  - 已实现脚本加载超时、错误回调、增量执行与重试。

### API 关键入口

1. `POST /api/analyze` -> `frontend/src/app/api/analyze/route.ts`
2. `POST /api/generate-graphic` -> `frontend/src/app/api/generate-graphic/route.ts`
3. `POST /api/fix-commands` -> `frontend/src/app/api/fix-commands/route.ts`

### 存储现状

1. 结果存储在浏览器 localStorage（`setStoredResult/getStoredResult`）。
2. 风险：跨设备分享不可用；历史检索能力不足。

---

## 前端目录（核心）

```text
frontend/src/
├── app/
│   ├── page.tsx
│   ├── analyze/[id]/page.tsx
│   └── api/
│       ├── analyze/route.ts
│       ├── generate-graphic/route.ts
│       └── fix-commands/route.ts
├── components/
│   ├── ImageUploader.tsx
│   ├── GeoGebraViewer.tsx
│   └── AnimationControls.tsx
├── hooks/
│   ├── useAnimation.ts
│   ├── useRealtimeGeoGebra.ts
│   └── useStreamContent.ts
├── lib/
│   ├── openrouter.ts
│   ├── stream.ts
│   └── utils.ts
└── types/index.ts
```

---

## 关键数据流

### 流程 A: 几何题分析

1. 用户上传题图 -> `ImageUploader`。
2. 首页调用 `/api/analyze`，通过 `streamRequest` 接收 SSE。
3. `useStreamContent` 聚合 chunk，`useRealtimeGeoGebra` 解析增量命令。
4. 解析完成后保存结果到 localStorage 并跳转结果页。
5. 结果页用 `GeoGebraViewer` 渲染，`AnimationControls` 控制播放。

### 流程 B: 草图生成

1. 用户输入文本 + 可选草图。
2. 首页调用 `/api/generate-graphic`（SSE）。
3. 同流程 A 进行命令解析、校验、保存与展示。

### 流程 C: 命令自动修复

1. `GeoGebraViewer` 上报命令执行错误。
2. 结果页调用 `/api/fix-commands`。
3. 成功后覆盖本地结果并重新渲染。

---

## API 协议（现行）

### POST /api/analyze

请求体:

```json
{
  "image": "data:image/jpeg;base64,...",
  "retryCount": 0,
  "previousError": "可选"
}
```

响应: SSE

```text
data: {"content":"..."}
data: {"content":"..."}
data: [DONE]
```

### POST /api/generate-graphic

请求体:

```json
{
  "text": "题目描述",
  "sketch": "data:image/png;base64,...",
  "retryCount": 0,
  "previousError": "可选"
}
```

响应: SSE（同上）

### POST /api/fix-commands

请求体:

```json
{
  "originalCommands": "A=(0,0)\\nB=(1,0)",
  "errors": [{ "command": "...", "error": "...", "index": 0 }],
  "conditions": [],
  "goal": "",
  "retryCount": 0
}
```

响应体:

```json
{
  "success": true,
  "geogebra": "...",
  "fixedCommands": ["..."],
  "message": "..."
}
```

---

## 目标架构（AI 响应与前端体验重写）

### 1) 协议层：SSE v2 事件化

将当前 `data: { content }` 的单一流，升级为带事件语义的统一协议。

标准事件字段：

1. `requestId`: 请求唯一 ID
2. `seq`: 递增序号
3. `phase`: 生命周期阶段
4. `event`: 事件类型
5. `payload`: 数据体
6. `ts`: 时间戳

事件类型：

1. `lifecycle.started`
2. `content.delta`
3. `command.delta`
4. `validation.result`
5. `recovery.attempt`
6. `recovery.result`
7. `lifecycle.done`
8. `lifecycle.error`

示例：

```text
data: {"requestId":"req_xxx","seq":1,"phase":"submitting","event":"lifecycle.started","payload":{},"ts":"2026-03-21T08:00:00.000Z"}
data: {"requestId":"req_xxx","seq":2,"phase":"streaming","event":"content.delta","payload":{"text":"{"},"ts":"2026-03-21T08:00:00.300Z"}
data: {"requestId":"req_xxx","seq":3,"phase":"streaming","event":"command.delta","payload":{"command":"A = (0, 0)"},"ts":"2026-03-21T08:00:00.450Z"}
data: {"requestId":"req_xxx","seq":4,"phase":"done","event":"lifecycle.done","payload":{},"ts":"2026-03-21T08:00:02.100Z"}
```

迁移期要求：前端同时兼容 v1（仅 content/error）与 v2（事件化）。

### 2) 状态层：统一状态机

首页请求链路采用单状态机：

1. `idle`
2. `submitting`
3. `waiting_first_byte`
4. `streaming`
5. `validating`
6. `recovering`
7. `success`
8. `failed_recoverable`
9. `failed_terminal`
10. `cancelling`
11. `cancelled`

所有按钮状态、提示文案、重试入口与取消行为由状态机派生。

### 3) 渲染层：增量优先

1. 文本流按 chunk 增量拼接，避免全量重扫。
2. GeoGebra 优先执行 `command.delta` 增量命令。
3. 增量执行失败时，降级到全量重建（保证正确性）。
4. 语法验证与命令修复统一为同一恢复链路，避免跨页面逻辑分裂。

### 4) 可观测性与 SLO

核心指标：

1. TTFB（提交到首事件）
2. 首条可读文本时间
3. 取消生效率
4. 失败恢复率
5. 无反馈空窗占比（>4s）

目标值（P75/比率）：

1. TTFB <= 2.5s
2. 首条可读文本 <= 3.0s
3. 取消生效率 >= 98%
4. 失败恢复率 >= 80%
5. 无反馈空窗占比 <= 5%

### 5) 实施路线

1. Phase 1（1-2 周）: 上线 SSE v2 协议与埋点，保留 v1 兼容。
2. Phase 2（1-2 周）: 首页状态机重构，统一取消/重试/修复。
3. Phase 3（1-2 周）: 命令增量渲染优化 + 服务端临时分享能力。

---

## VLM 集成

核心文件: `frontend/src/lib/openrouter.ts`

1. 非流式调用: `callOpenRouter`
2. 流式调用: `streamOpenRouter`
3. Prompt 常量:
  - `ANALYZE_SYSTEM_PROMPT`
  - `GENERATE_SYSTEM_PROMPT`
  - `FIX_COMMANDS_SYSTEM_PROMPT`

模型配置:

```env
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=qwen/qwen3-vl-235b-a22b-instruct
```

---

## 部署

1. 平台: Vercel（推荐）
2. 前端与 API 路由同仓部署
3. 关键环境变量:
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_MODEL`
  - `NEXT_PUBLIC_BASE_URL`（可选）

---

*文档版本: 3.3 | 最后更新: 2026-03-21*
