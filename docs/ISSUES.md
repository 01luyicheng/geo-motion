# GeoMotion 代码审查问题清单

> 创建时间: 2026-03-10
> 最后更新: 2026-03-29

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

#### H2. 分享链接功能受限于本地存储
- **文件**: `frontend/src/app/analyze/[id]/page.tsx`
- **问题描述**: 分享按钮复制当前 URL，但分析结果仅存储在本地 `localStorage`，无法实现跨设备分享。虽然 UI 已通过按钮文字"复制本机链接"和提示文字"仅在本设备有效"明确告知用户限制，但功能本质上仍受限于本地存储
- **影响**: 教师无法将链接发给学生跨设备使用，分享能力受限
- **建议**: 要么实现服务端持久化实现真正的跨设备分享，要么保持当前提示（已缓解）

#### H3. 解题步骤质量与教学联动不足
- **文件**: `frontend/src/lib/openrouter.ts`（`ANALYZE_SYSTEM_PROMPT`），`frontend/src/app/analyze/[id]/page.tsx`，`docs/SPEC.md`
- **问题描述**: 目前已支持返回并展示 `solution`，但"步骤文本"和"动画命令执行"仍是两条平行信息流，缺少逐步联动与可解释性
- **影响**: 学生能看到结果，但难以建立"命令 -> 几何结论 -> 解题步骤"的认知映射
- **建议**: 建立学习模式联动（步骤高亮、命令定位、单步解释），提升教学效果

#### H4. ~~AI 请求取消机制体验不足~~ 【已缓解】
- **文件**: `frontend/src/app/page.tsx`，`frontend/src/lib/stream.ts`
- **审查结果**: 经代码审查确认，取消机制实现已相当完善：
  - ✅ 取消功能已实现（AbortController）
  - ✅ 取消后有明确的状态反馈（cancelNotice 提示"已取消本次请求，你可以调整输入后重新开始"）
  - ✅ 取消后 loading 状态正确重置，实时预览正确关闭
  - ✅ 自动重试机制已存在（针对语法错误最多3次）
- **建议**: 可考虑添加"一键重试"按钮进一步优化，但当前实现已满足基本需求

---

### 中优先级

#### ~~M1. 未使用的依赖~~ 【已删除 - 误报】
- **审查结果**: 经代码审查确认，`@tanstack/react-query`、`framer-motion`、`fabric` 这三个依赖根本不存在于 [package.json](file:///c:/Users/21601/Documents/project/geo-motion/frontend/package.json) 中。原问题描述不准确，属于误报。

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

#### ~~L1. `window.ggbApplet` 类型声明不可选~~ 【已删除 - 误报】
- **审查结果**: 经代码审查确认，`ggbApplet` 在 [types/index.ts](file:///c:/Users/21601/Documents/project/geo-motion/frontend/src/types/index.ts#L64) 中已声明为可选属性（`ggbApplet?: GgbAppletAPI`），且使用时也有适当的空值检查。原问题描述不准确，属于误报。

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
| AI 请求取消后恢复体验 | 中 | 已支持取消；需补全阶段回执、失败归因与一键重试 |
| 历史记录查看 | 中 | 结果存于 localStorage 但无列表入口，只能通过 URL 重访 |
| PNG 导出 | 中 | SPEC.md 提到支持 PNG 导出，代码仅实现 SVG |
| 暗色模式切换 | ✅ 已实现 | 功能完整，含切换按钮、CSS 变量、localStorage 持久化和系统主题检测 |
| 解题步骤展示 | ✅ 已实现 | UI 已完整实现解题思路展示面板，含展开/折叠功能 |

---

## UX 优化专项（结合当前代码）

### 目标用户与核心场景

1. 教师（备课/课堂演示）
   - 场景：拍题后快速得到可拖拽图形，并在课堂中逐步演示作图。
   - 当前阻塞：分享链接仅本机有效，跨设备备课不可用。

2. 学生（自学/订正）
   - 场景：上传题目后理解图形构造过程，复盘解题思路。
   - 当前阻塞：结果页"图形-命令-步骤"三者关联弱，学习路径不连续。

3. 教研/内容创作者（素材生产）
   - 场景：批量生成可复用图形并导出。
   - 当前阻塞：缺少历史记录与可检索题库，复用成本高。

### 用户痛点 -> 代码落点 -> 改进建议

#### U1. 分享能力受限于本地存储（高优先级）
- 代码现状：`frontend/src/app/analyze/[id]/page.tsx` 的 `handleShare` 仅复制 `window.location.href`；结果实际存于 `localStorage`。
- 用户痛点：教师将链接发给学生后，学生端打不开，无法实现跨设备分享。
- 当前缓解措施：UI 已通过按钮文字"复制本机链接"和提示文字"仅在本设备有效"明确告知用户限制。
- 改进方案：
  - 新增服务端持久化分享接口（例如 `POST /api/share`、`GET /api/share/[id]`）。
  - 结果页优先读服务端，回退本地缓存。
  - 分享按钮文案分为"复制本机链接"和"生成可分享链接"。

#### U2. 上传前质量控制不足（高优先级）
- 代码现状：`frontend/src/components/ImageUploader.tsx` 已做类型/大小/魔数校验，但无裁剪、压缩、拍照引导。
- 用户痛点：拍照歪斜、背景杂乱导致识别失败，用户认为 AI 不稳定。
- 改进方案：
  - 上传前增加裁剪与透视矫正（最小可先做裁剪 + 压缩）。
  - 增加拍照提示遮罩（边框对齐、光线提示）。
  - 自动压缩到目标尺寸后再发请求，降低失败率和等待时长。

#### U3. 生成进度不透明（中高优先级）
- 代码现状：`frontend/src/app/page.tsx` 的进度条是固定宽度 `60%`，阶段信息和耗时预期不准确。
- 用户痛点：用户不知道系统卡在哪一阶段，容易重复提交。
- 改进方案：
  - 引入"阶段状态机"：上传校验 -> 模型推理 -> 命令校验 -> 跳转渲染。
  - `streamRequest` 增加阶段事件回调，前端展示阶段耗时与重试原因。
  - 失败时提供明确的下一步操作（重拍、改文本、重试）。

#### U4. 学习闭环不完整（中优先级）
- 代码现状：`frontend/src/app/analyze/[id]/page.tsx` 已分别展示命令和解题思路；`AnimationControls` 只按命令索引播放。
- 用户痛点：学生看得见动画，但不清楚"这一步命令对应哪条几何结论"。
- 改进方案：
  - 增加"学习模式"：播放到第 N 步时，高亮对应 `solution[N]` 与关键命令片段。
  - 在 `GeoGebraViewer` 的命令执行结果中回传成功/失败命令，驱动右侧解释联动。
  - 支持"单步解释"按钮，降低认知负担。

#### U5. 历史结果不可管理（中优先级）
- 代码现状：结果写入 `setStoredResult`，但无历史列表页，用户只能靠 URL 命中。
- 用户痛点：内容创作者难以复用旧结果，重复生成浪费 token。
- 改进方案：
  - 新增历史页（按时间倒序、按模式筛选）。
  - 为每条记录生成摘要字段（条件/目标/首行命令），支持关键字搜索。
  - 增加"重新编辑并再生成"入口，形成迭代闭环。

### 建议优先级与实现拆解

#### P0（1 周）
- 真实可分享链接（U1）
  - 涉及：`frontend/src/app/analyze/[id]/page.tsx`、新增 `frontend/src/app/api/share/*`、存储层。
  - 验收：跨设备打开分享链接成功率 > 95%。

- 上传前裁剪与压缩（U2）
  - 涉及：`frontend/src/components/ImageUploader.tsx`。
  - 验收：平均上传 payload 下降 40%+，识别失败率显著下降。

#### P1（1-2 周）
- 阶段化进度与错误引导（U3）
  - 涉及：`frontend/src/lib/stream.ts`、`frontend/src/app/page.tsx`。
  - 验收：重复提交率下降；取消后再次提交成功率提升。

- 学习模式联动（U4）
  - 涉及：`frontend/src/app/analyze/[id]/page.tsx`、`frontend/src/components/AnimationControls.tsx`、`frontend/src/components/GeoGebraViewer.tsx`。
  - 验收：单步播放可定位到对应解题说明，错误命令可视化。

#### P2（2-4 周）
- 历史记录中心（U5）
  - 涉及：新增 `frontend/src/app/history/page.tsx`，扩展存储工具。
  - 验收：用户可在 3 次点击内找到任一历史结果并重新编辑。

---

## 改进路线图

### 短期（1-2周）
- [ ] 添加日志级别控制（M2）
- [ ] 建立解题步骤与动画联动（H3）
- [ ] 上传前裁剪与压缩（U2）
- [ ] 阶段化进度展示（U3）

### 中期（1-2月）
- [ ] 添加 IP 速率限制（M3）
- [ ] 添加核心单元测试（H1）
- [ ] 实现真实可分享链接（U1）
- [ ] 实现历史记录页面（U5）
- [ ] 实现学习模式联动（U4）
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
| 高优先级待处理 | 3 |
| 中优先级待处理 | 4 |
| 低优先级待处理 | 2 |
| 缺失功能 | 4 |
| 已删除误报 | 3 |

---

## 审查历史

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-03-10 | 创建 | 初始问题清单 |
| 2026-03-13 | 更新 | 修复 20 个问题 |
| 2026-03-13 | 审查 | 派遣 5 个 sub-agent 全面审查问题存在性，更新 3 个问题描述，删除 1 个误报 |
| 2026-03-20 | 更新 | 新增 UX 优化专项，修正 H3/H4 为当前实现状态，路线图加入可执行验收项 |
| 2026-03-29 | 审查 | 派遣 5 个 sub-agent 审查问题清单，删除 3 个误报（L1、M1、H4），修正 H2/U1 描述 |

*最后审查时间: 2026-03-29*
