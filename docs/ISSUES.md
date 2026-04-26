# GeoMotion 待修复问题清单

## 高优先级

---

## 中优先级

### M4. 外部服务依赖风险
- **文件**: `frontend/src/components/GeoGebraViewer.tsx`, `frontend/src/lib/openrouter.ts`
- **问题描述**:
  - **GeoGebra**: 依赖 CDN 加载，无本地 fallback
  - **OpenRouter**: 单一 VLM 提供商，无故障转移机制
- **影响**: CDN 故障或 API 停服将导致核心功能不可用
- **建议**: 添加 GeoGebra 降级方案；支持多 VLM 提供商故障转移

### M5. 可观测性建设
- **文件**: 全局
- **问题描述**:
  - **性能监控缺失**: 无 TTFB 埋点、无流式传输速度监控
  - **错误追踪缺失**: 无 Sentry 等错误聚合分析
  - **指标仪表盘缺失**: 无关键业务指标监控
- **影响**: 无法及时发现性能瓶颈和系统故障
- **建议**: 集成 Sentry 错误追踪、添加性能埋点、建立指标仪表盘

### M6. 数据验证与版本控制缺失
- **文件**: `frontend/src/lib/utils.ts`, `frontend/src/app/analyze/[id]/page.tsx`
- **问题描述**:
  - **无数据验证**: `getStoredResult` 仅使用 `JSON.parse`，无结构验证
  - **无版本控制**: localStorage 数据没有版本号
  - **无数据迁移机制**: 接口变更时旧数据无法自动迁移
- **影响**: 数据结构变更时可能产生兼容性问题
- **建议**: 添加运行时数据验证（Zod）、添加版本号支持数据迁移

---

## 低优先级

### L3. AnalysisResult.id 字段冗余
- **文件**: `frontend/src/app/page.tsx`
- **问题描述**: `AnalysisResult.id` 使用复杂字符串拼接生成，但未被实际使用（存储使用独立的 generateId）
- **影响**: 逻辑冗余，增加维护成本
- **建议**: 移除 `result.id` 字段，下载时动态生成文件名

### L4. handleSpeedChange 重复定时器逻辑
- **文件**: `frontend/src/hooks/useAnimation.ts`
- **问题描述**: `handleSpeedChange` 复制了 `handlePlay` 中的定时器逻辑
- **影响**: 代码重复，修改需同步两处
- **建议**: 提取 `startInterval(speed, startFrom)` 辅助函数消除重复

### L5. AI 请求取消后 UX 体验不足
- **文件**: `frontend/src/app/page.tsx`, `frontend/src/lib/stream.ts`
- **问题描述**: 取消机制技术已实现（AbortController），但取消后 UX 体验可优化
- **影响**: 用户体验有待优化
- **建议**: 添加"一键重试"按钮、阶段回执、失败归因提示

### L6. 部署架构统一
- **文件**: `Dockerfile`, `DEPLOY.md`
- **问题描述**:
  - **Node.js 版本不一致**: DEPLOY.md 声明 18.0+，Dockerfile 使用 node:24-alpine
  - **无健康检查端点**: 缺少 `/api/health`
- **影响**: 部署流程不清晰
- **建议**: 统一 Node.js 版本、添加健康检查端点

### L7. 国际化准备
- **文件**: `frontend/src/lib/openrouter.ts`, 所有 `.tsx` 组件
- **问题描述**:
  - **系统提示硬编码中文**: `ANALYZE_SYSTEM_PROMPT` 等完全硬编码中文
  - **UI 文本未分离**: 错误提示、按钮文字等直接写在组件中
  - **无 i18n 框架**: 未集成国际化框架
- **影响**: 国际化改造成本高
- **建议**: 抽取系统提示为配置文件、建立 i18n 框架

---

## UX 优化专项

### U1. 上传前质量控制不足
- **代码现状**: 已有类型/大小/魔数校验，但无裁剪、压缩、拍照引导
- **用户痛点**: 拍照歪斜、背景杂乱导致识别失败
- **改进方案**: 增加裁剪与透视矫正；增加拍照提示遮罩；自动压缩

### U2. 生成进度不透明
- **代码现状**: 进度条固定 60%，阶段信息不准确
- **用户痛点**: 用户不知道系统卡在哪一阶段
- **改进方案**: 引入阶段状态机；增加阶段事件回调；显示各阶段耗时

### U3. 学习闭环不完整（部分已修复）
- **代码现状**:
  - 命令面板默认折叠
  - 学习模式、步骤高亮与命令联动、单步解释功能已实现（H3 修复）
- **用户痛点**: 学生不清楚"这一步命令对应哪条几何结论"
- **改进方案**: 命令面板默认展开，或记住用户上次折叠状态

### U4. 历史结果不可管理
- **代码现状**: 无历史列表页，用户只能靠 URL 命中
- **用户痛点**: 难以复用旧结果，重复生成浪费 token
- **改进方案**: 新增历史页；支持搜索筛选；增加"重新编辑并再生成"入口

---

## 缺失功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 历史记录查看 | 中 | 结果存于 localStorage 但无列表入口 |
| PNG 导出 | 中 | SPEC.md 提到支持 PNG 导出，代码仅实现 SVG |

---

## 交叉审查专项报告（前5次提交）

> 审查日期: 2026-04-25
> 审查范围: H2、H4、H5、M2、M3 修复涉及的文件变更
> 测试状态: 全部通过（72 tests passed）

### 一、修复冲突与重复修改分析

#### 1.1 `validation.ts` 被 3 次修复修改（H2、H4、M3）
- **H2**: 新增 `saveResultRequestSchema`，限制 result 对象大小
- **H4**: 新增 `imageDataUriSchema` 正则验证，增加输入清理
- **M3**: 新增 `openRouterResponseSchema` / `openRouterStreamChunkSchema` zod 验证
- **冲突评估**: 无直接代码冲突，但 `imageDataUriSchema` 的正则表达式存在兼容性问题（见下方）

#### 1.2 `openrouter.ts` 被 3 次修复修改（H4、M2、M3）
- **H4**: 新增 `sanitizeInput` 函数，防止 Prompt 注入
- **M2**: 用 `logStructured` 替代 `console.log`，按环境控制日志输出
- **M3**: 新增 `parseVlmJson` 函数，使用 zod 进行运行时验证
- **冲突评估**: `logStructured` 的 `filterSensitiveMeta` 与 `sanitizeInput` 功能有重叠，但职责不同（一个过滤日志、一个过滤输入），无冲突

#### 1.3 `resultStore.ts` 被 2 次修复修改（H2、M2）
- **H2**: 新增内存存储实现、容量限制、过期清理
- **M2**: 新增 `checkStoreAvailability`、`isVercelServerless` 等环境检测
- **冲突评估**: 无冲突，M2 在 H2 基础上扩展

### 二、新引入问题

#### 2.1 类型错误
- 见"本轮5次提交交叉审查记录"中的 8 个 TypeScript 类型错误

#### 2.2 逻辑错误（已修复）
- ~~**[HIGH]** `middleware.ts` 第 62 行：CORS 源检查允许空 origin~~
  - **状态**: 已修复（H4 修复中已改为 `if (!isAllowedOrigin)`，明确拒绝无 Origin 头的请求）

- ~~**[HIGH]** `ratelimit.ts` 第 138 行：edge 模式下 `request.ip` 可能为 undefined~~
  - **状态**: 已修复（H5 修复中已为 `unknown` IP 设置独立限制 3 次/分钟）

#### 2.3 性能问题
- **[MEDIUM]** `page.tsx` 第 77-109 行：`useEffect` 中同步调用 `fetch`，在服务端渲染时可能造成瀑布请求
- **[LOW]** `ratelimit.ts` 第 55-69 行：`setInterval` 在模块加载时自动启动，测试环境中即使未使用限流也会创建定时器

### 三、遗漏的边界情况

#### 3.1 输入验证边界
- `imageDataUriSchema` 限制 13MB，但 `saveResultRequestSchema` 中 `result.geogebra` 限制 50KB，`result.conditions` 每项 500 字符，但未验证 `image` 字段在 `saveResult` 中不会出现（当前确实不会，但 schema 未显式排除）
- `fixCommandsRequestSchema` 中 `errors` 数组的 `index` 字段未验证是否超出 `originalCommands` 的行数范围

#### 3.2 存储边界
- `resultStore.ts` 的 `lazyCleanup` 仅在 GET 时触发，如果某个结果 7 天内从未被访问，它会在内存中保留到下次 GET 触发清理，而非主动删除
- `memoryStore` 的 `MAX_CAPACITY = 1000` 在 serverless 环境下每个实例独立计算，实际总容量 = 1000 * 实例数

#### 3.3 流式处理边界
- `openrouter.ts` 第 336-373 行：流式响应中如果收到非 JSON 的 `data:` 行，仅记录日志后丢弃，未向客户端转发错误

### 四、测试覆盖评估

#### 4.1 已覆盖（良好）
- `ratelimit.test.ts`: 覆盖 IP 获取、路由匹配、限流计数、响应头、清理逻辑（34 个测试）
- `utils.test.ts`: 覆盖类名合并、ID 生成、文件大小格式化、localStorage 操作（15 个测试）
- `openrouter.test.ts`: 覆盖输入清理、JSON 解析（16 个测试）
- `save-result/route.test.ts`: 覆盖保存、验证、大小限制（4 个测试）
- `result/[id]/route.test.ts`: 覆盖获取、不存在、过期（3 个测试）

#### 4.2 未覆盖（需补充）
- ~~`middleware.ts`: 无测试~~ → **已补充**（H1 修复中已添加 middleware.test.ts，19 个测试）
- ~~`stream.ts`: 无测试~~ → **已补充**（H1 修复中已添加 stream.test.ts，17 个测试）
- `analyze/route.ts` / `generate-graphic/route.ts`: 仅 `analyze` 有测试，`generate-graphic` 无测试
- `fix-commands/route.ts`: 无测试，修复逻辑、重试限制、错误处理未验证
- `page.tsx`: 无组件测试，交互逻辑、状态管理未验证
- `useRealtimeGeoGebra.ts`: 无测试，命令提取、JSON 解析未验证

### 五、代码风格一致性

#### 5.1 不一致点
- **日志前缀格式**: `openrouter.ts` 使用 `[Module][ISO时间]`，`analyze/route.ts` 使用 `[analyze][ISO时间]`，`save-result/route.ts` 使用 `[save-result]`，格式不统一
- **错误响应结构**: 大部分路由使用 `{ success: false, error: { code, message } }`，但 `fix-commands/route.ts` 额外返回 `geogebra` 和 `fixedCommands` 字段在成功时，结构与其他路由不一致
- **注释语言**: 大部分注释为中文，但 `openrouter.ts` 第 390 行的 `/** ── GeoGebra 系统提示` 使用了特殊符号分隔，与其他文件风格不同

#### 5.2 建议
- 统一日志格式为 `[模块] 消息` 或 `[模块][时间] 消息`
- 统一 API 响应结构，成功时统一为 `{ success: true, data: T }`
- 统一字符串引号为单引号（符合项目 `.prettierrc` 配置）

### 六、修复建议优先级

| 优先级 | 问题 | 建议修复方案 |
|--------|------|-------------|
| P0 | `middleware.ts` 允许空 Origin | 移除 `&& origin` 条件，或添加 `!origin` 时拒绝 |
| P0 | `ratelimit.ts` unknown IP 共享配额 | 为 unknown IP 设置独立限制或拒绝服务 |
| P2 | 测试覆盖不足 | 补充 middleware、stream、fix-commands、generate-graphic 测试 |
| P2 | 代码风格不一致 | 配置 ESLint/Prettier 规则自动统一 |

---

*本报告由交叉审查生成，所有问题已验证并记录。*

---

## 本轮5次提交交叉审查记录（仅记录，不修复）

> 审查日期: 2026-04-26  
> 审查范围: H1-H5 修复提交  
> 测试状态: 全部通过（133 tests passed）  
> 类型检查: **8 个错误**

### 审查结论
- 前 5 次提交对应问题均已按预期修复并已从问题清单移除。
- 交叉审查过程中发现 **8 个 TypeScript 类型错误**，已记录如下，**本轮按要求不修复**。
- 未发现修复冲突、逻辑漏洞或新的运行时错误。

### 新发现问题（待后续修复）

#### [CRITICAL] TypeScript 类型错误（7 个）

**1. `AnimationControls.tsx` - onStep 参数类型不匹配（2 处）**
- **文件**: `frontend/src/components/AnimationControls.tsx:76, 135`
- **错误**: `Argument of type 'number' is not assignable to parameter of type '1 | -1'`
- **原因**: `onStep(-current)` 和 `onStep(total - 1 - current)` 产生 `number` 类型，但 `onStep` 签名要求字面量联合类型 `1 | -1`
- **影响**: 前端生产构建无法通过

**2. `stream.test.ts` - 只读属性赋值（4 处）**
- **文件**: `frontend/src/lib/stream.test.ts:226, 250, 255, 278`
- **错误**: `Cannot assign to 'NODE_ENV' because it is a read-only property`
- **原因**: 测试中直接修改 `process.env.NODE_ENV`，但 TypeScript 将其声明为 readonly
- **影响**: 类型检查失败；测试运行通过但构建失败

**3. `validation.ts` - zod 选项参数错误**
- **文件**: `frontend/src/lib/validation.ts:94`
- **错误**: `Object literal may only specify known properties, and 'required_error' does not exist in type '{ error?: ... }'`
- **原因**: 使用了 `required_error` 选项，但当前 zod 版本不支持此参数名（应为 `message` 或其他正确参数）
- **影响**: 类型检查失败
