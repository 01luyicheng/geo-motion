# GeoMotion 代码审查问题清单

> 创建时间: 2026-03-10
> 最后更新: 2026-03-13

---

## 已修复问题

| 编号 | 问题 | 修复说明 |
|------|------|----------|
| 1.1 | API 图片大小校验缺失 | 添加 `MAX_BASE64_LENGTH = 13_000_000` 限制 |
| 1.2 | generate-graphic 大小校验缺失 | 同上，草图上传已有校验 |
| 2.1 | GeoGebra 全局状态问题 | 添加 `onerror`、超时处理、错误状态 |
| 2.2 | SVG 导出逻辑不可靠 | 改用直接访问 `window.ggbApplet` |
| 2.3 | 动画重播竞态条件 | 使用 `replayTimeoutRef` 清理定时器 |
| 3.1 | GeoGebra 命令重复执行 | 实现增量执行 (`lastExecutedIndexRef`) |
| 4.1 | 无加载超时处理 | 30秒超时 + 错误状态 + 重试按钮 |
| 3 | 缺少错误边界组件 | 新增 `ErrorBoundary` 类组件，在 `layout.tsx` 中包裹 `<main>` 内容 |
| 4 | 缺少环境变量文档 | 完善 `.env.local.example`，补充 `OPENROUTER_MODEL` 变量说明 |
| 7 | SSE 流处理性能问题 | 使用 `requestAnimationFrame` + `useRef` 批量合并 chunk，避免每个 chunk 触发 re-render |
| 9 | XSS 安全风险 | 已验证安全：流式内容在 `<pre>` 中渲染，React 默认转义 HTML，无风险 |
| 10 | 图片验证不足 | 在 `ImageUploader.tsx` 中添加文件头魔数验证（JPEG/PNG/WEBP） |
| 11 | 类型定义不完整 | 导出 `GgbAppletAPI` 接口，补全 15 个常用方法声明 |
| 12 | 缺少代码格式化工具 | 添加 `frontend/.prettierrc` 配置文件 |
| 13 | 日志格式不统一 | `generate-graphic/route.ts` 错误日志对齐 `analyze/route.ts` 格式（含时间戳） |
| 14 | 硬编码配置 | `openrouter.ts` 中 `MODEL` 改为读取 `process.env.OPENROUTER_MODEL`，带默认值 |
| 15 | 类型断言过多 | 在 `GeoGebraViewer.tsx` 中抽取 `getGgbAppletById()` 辅助函数，集中管理类型断言 |
| 16 | ESLint 规则被绕过 | 使用 `onReadyRef` 移除 `onReady` 对 `initApplet` 的依赖，加入 `initApplet` 到 useEffect 依赖，删除 `eslint-disable` 注释 |
| 17 | 空 catch 块 | 已验证非问题：真实的 catch 块（149-151行）有完整错误处理，无需修改 |
| 18 | localStorage 无容量限制 | `setStoredResult` 添加 try-catch，捕获 `QuotaExceededError` 并打印警告 |
| 6 | 单文件过大 | 提取 `useAnimation` hook（`src/hooks/useAnimation.ts`）和 `useStreamContent` hook（`src/hooks/useStreamContent.ts`）；`streamRequest` 移至 `src/lib/stream.ts`；两个大文件分别从 427→333 行、450→366 行 |

> **注**：原 Issue 5.1（"添加完整的 `validateApiResponse` 函数"）经核查代码库中不存在该函数，属于**误报**，实际从未实现，已移至 M4 待处理。

---

## 待处理问题

### 高优先级

#### H1. 测试覆盖率为零
- **文件**: 全局
- **问题描述**: 项目没有任何测试文件，存在较高的维护风险
- **影响**: 每次修改都需要手动回归测试，重构困难
- **建议**: 添加 API 路由单元测试 + 工具函数测试（推荐 Vitest + Testing Library）

#### H2. 分享链接功能误导用户
- **文件**: `frontend/src/app/analyze/[id]/page.tsx`
- **问题描述**: "分享"按钮复制当前 URL，但分析结果仅存储在本地 `localStorage`。他人打开分享链接会看到"分析结果不存在或已过期"，造成功能误导
- **影响**: 用户体验严重受损，分享功能事实上不可用
- **建议**: 要么移除分享按钮，要么实现服务端持久化，要么在 UI 中明确提示"链接仅在本设备有效"

#### H3. 解题步骤功能设计冲突
- **文件**: `frontend/src/lib/openrouter.ts`（`ANALYZE_SYSTEM_PROMPT`），`frontend/src/app/analyze/[id]/page.tsx`，`docs/SPEC.md`
- **问题描述**: SPEC.md 要求 AI "给出解题步骤"并在结果页展示，但 `ANALYZE_SYSTEM_PROMPT` 中明确要求 `"solution": []`（禁用解题步骤），导致 UI 中的"解题思路"面板永远不会显示内容。存在功能设计与实现之间的矛盾
- **影响**: SPEC 承诺的核心功能未实现；UI 中存在死代码（永不显示的面板）
- **建议**: 明确产品决策——如需保留：修改 prompt 允许 AI 返回解题思路；如确认不需要：移除 UI 中"解题思路"面板并更新 SPEC.md

#### H4. AI 请求无取消机制
- **文件**: `frontend/src/app/page.tsx`，`frontend/src/lib/stream.ts`
- **问题描述**: `streamRequest` 不接受 `AbortSignal`，用户发起请求后无法中断。AI 最长可运行 10 分钟（600秒超时），用户必须等待或刷新页面
- **影响**: 误触提交无法撤回；等待体验差
- **建议**: `streamRequest` 接受可选 `AbortSignal`，前端添加"取消"按钮并管理 `AbortController`

---

### 中优先级

#### M1. 未使用的依赖
- **文件**: `frontend/package.json`
- **问题描述**: 以下依赖已安装但未使用，增加约 200KB 包体积：`@tanstack/react-query`、`framer-motion`、`fabric`
- **建议**: 执行 `npm uninstall @tanstack/react-query framer-motion fabric`

#### M2. 生产环境日志泄露敏感信息
- **文件**: `frontend/src/lib/openrouter.ts` 多处
- **问题描述**: 大量 `console.log` 输出请求体、响应内容等详细信息
- **影响**: 生产服务器日志中可见 API 调用详情；Vercel Function 日志可能被第三方访问
- **建议**: 用 `process.env.NODE_ENV === 'development'` 或自定义 Logger 控制日志级别

#### M3. API 路由缺乏速率限制
- **文件**: `frontend/src/app/api/analyze/route.ts`、`frontend/src/app/api/generate-graphic/route.ts`
- **问题描述**: 任何人都可以不限次数调用 API，单用户可迅速耗尽 OpenRouter API 配额
- **影响**: API 密钥可被滥用，造成高额费用
- **建议**: 添加基于 IP 的请求频率限制（可使用 `@upstash/ratelimit` 或 Next.js middleware）

#### M4. API 响应运行时验证实际未实现（原 Issue 5.1 误报）
- **文件**: `frontend/src/lib/openrouter.ts`
- **问题描述**: ISSUES.md 中声称"添加完整的 `validateApiResponse` 函数"，但代码库中完全不存在此函数。`callOpenRouter` 对 API 响应的校验仅有简单的 `typedData.error` 判断和 `content` 非空检查，无完整运行时结构验证
- **建议**: 添加真正的响应结构验证（例如用 `zod` 验证 `choices[0].message.content` 结构）

#### M5. 外部服务依赖风险
- **文件**: `frontend/src/components/GeoGebraViewer.tsx`, `frontend/src/lib/openrouter.ts`
- **问题描述**: 
  - **GeoGebra**: 依赖 CDN (`https://www.geogebra.org/apps/deployggb.js`) 加载，无本地 fallback；虽有加载失败处理（30秒超时、错误捕获、重试按钮），但缺乏功能降级方案（如显示静态图片或简化版几何图形）
  - **OpenRouter**: 为单一 VLM 提供商，无备用方案；虽支持通过 `OPENROUTER_MODEL` 环境变量切换模型，但仍为单一提供商架构
- **建议**: 添加 GeoGebra 加载失败的降级说明或静态回退方案；考虑支持配置多个 VLM 提供商实现故障转移

---

### 低优先级

#### L1. `window.ggbApplet` 类型声明不可选
- **文件**: `frontend/src/types/index.ts`
- **问题描述**: `Window` 接口中 `ggbApplet` 声明为非可选（`GgbAppletAPI`），但在 GeoGebra applet 加载前 `window.ggbApplet` 为 `undefined`
- **建议**: 改为 `ggbApplet?: GgbAppletAPI`（可选类型），避免运行时类型欺骗

#### L2. ~~`useCallback` 依赖数组遗漏~~ 【已删除 - 误报】
- **审查结果**: 经代码审查确认，`appendChunk` 和 `clearStreamContent` 均为稳定引用（使用 `useCallback` 包裹且依赖数组为空），不需要加入 `handleAnalyze` 和 `handleGenerate` 的依赖数组。原问题描述不准确，属于误报。

#### L3. AnalysisResult.id 可简化
- **文件**: `frontend/src/app/page.tsx`, `frontend/src/app/analyze/[id]/page.tsx`
- **问题描述**: `AnalysisResult.id`（使用 `Date.now()` + `Math.random()` 生成，带 `analysis_`/`graphic_` 前缀）与存储键（使用 `generateId()` 生成）互相独立。`result.id` 仅用于 SVG 下载文件名，可以考虑使用存储键 ID 替代以简化逻辑
- **建议**: 统一使用同一个 ID 作为 result.id 和存储键，或直接用存储键作为下载文件名

#### L4. `handleSpeedChange` 重复定时器逻辑
- **文件**: `frontend/src/hooks/useAnimation.ts`
- **问题描述**: `handleSpeedChange` 在播放状态下重新创建 `setInterval`，复制了 `handlePlay` 中的定时器逻辑；后续修改播放逻辑需在两处同步
- **建议**: 提取 `startInterval(speed, startFrom)` 内部辅助函数消除重复

---

## 缺失功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| AI 请求取消 | 高 | 参见 H4，用户无法中断进行中的 AI 请求 |
| 历史记录查看 | 中 | 结果存于 localStorage 但无列表入口，只能通过 URL 重访 |
| PNG 导出 | 中 | SPEC.md 提到支持 PNG 导出，代码仅实现 SVG |
| 暗色模式切换 | ✅ 已实现 | 功能完整，含切换按钮、CSS 变量、localStorage 持久化和系统主题检测 |
| 解题步骤展示 | ✅ 已实现 | UI 已完整实现解题思路展示面板，含展开/折叠功能 |

---

## 改进路线图

### 短期（1-2周）
- [ ] 移除未使用依赖（M1）
- [ ] 添加日志级别控制（M2）
- [ ] 修复分享按钮语义误导（H2）：UI 提示"仅本设备有效"
- [ ] 明确解题步骤产品决策并修复 prompt/UI 不一致（H3）

### 中期（1-2月）
- [ ] 实现 AI 请求取消（H4）
- [ ] 添加 IP 速率限制（M3）
- [ ] 添加核心单元测试（H1）
- [ ] 实现历史记录页面
- [ ] 实现 PNG 导出
- [ ] 添加真正的 API 响应结构验证（M4）

### 长期（3-6月）
- [ ] 多 VLM 提供商支持（M5）
- [ ] 服务端持久化（使结果可跨设备真正分享）
- [ ] E2E 测试
- [ ] 国际化

---

## 审查统计

| 类别 | 数量 |
|------|------|
| 已修复问题 | 20 |
| 高优先级待处理 | 4 |
| 中优先级待处理 | 5 |
| 低优先级待处理 | 3 |
| 缺失功能 | 4 |
| 已删除误报 | 1 |

---

## 审查历史

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-03-10 | 创建 | 初始问题清单 |
| 2026-03-13 | 更新 | 修复 20 个问题 |
| 2026-03-13 | 审查 | 派遣 5 个 sub-agent 全面审查问题存在性，更新 3 个问题描述，删除 1 个误报 |

*最后审查时间: 2026-03-13*

