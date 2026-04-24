# GeoMotion 待修复问题清单

## 高优先级

### H1. 测试覆盖率为零
- **文件**: 全局
- **问题描述**: 项目没有任何测试文件，存在较高的维护风险
- **影响**: 每次修改都需要手动回归测试，重构困难
- **建议**: 添加 API 路由单元测试 + 工具函数测试（推荐 Vitest + Testing Library）
- **交叉审查发现**:
  - `route.test.ts` 中模拟的 `safeParseJson` 与实际实现不完全一致（测试中手动实现验证逻辑，而非使用真实 zod schema），可能导致测试通过但实际行为不同
  - `analyze/route.test.ts` 的 `afterEach` 仅调用 `vi.clearAllMocks()`，未清理 `resetStore()` 状态，测试间存在状态污染风险
  - `utils.test.ts` 中 `sanitizeInput` 测试未覆盖 `null`/`undefined` 输入（虽然代码中有处理），测试不完整
  - 测试覆盖率仍不足：缺少 `middleware.ts`、`GeoGebraViewer.tsx`、`useAnimation.ts` 等关键组件的测试

### H2. 分享链接功能受限于本地存储
- **文件**: `frontend/src/app/analyze/[id]/page.tsx`
- **问题描述**: 分享按钮复制当前 URL，但分析结果仅存储在本地 `localStorage`，无法实现跨设备分享
- **影响**: 教师无法将链接发给学生跨设备使用，分享能力受限
- **建议**: 实现服务端持久化实现真正的跨设备分享
- **交叉审查发现**:
  - **内存泄漏风险**: `save-result/route.ts` 使用 `Map` 做内存存储，无最大容量限制，恶意用户可持续 POST 大量数据导致内存耗尽（DoS 攻击）
  - **数据丢失风险**: 内存存储在服务器重启/部署后全部丢失，生产环境不可用
  - **无数据大小限制**: `saveResultRequestSchema` 未限制 `result` 对象的大小，单条记录可能非常大
  - **ID 冲突风险**: `generateId()` 使用 `crypto.randomUUID()`，虽然冲突概率极低，但无唯一性校验
  - **测试依赖内部实现**: `result/[id]/route.test.ts` 直接导入 `memoryStore` 进行测试，破坏了模块封装性
  - **清理机制问题**: `setInterval` 每 10 分钟清理过期数据，但 Next.js 在 serverless 环境下可能每次请求都创建新的 interval，导致内存泄漏（虽然当前非 serverless 部署，但架构上存在问题）

### H3. 解题步骤质量与教学联动不足
- **文件**: `frontend/src/lib/openrouter.ts`, `frontend/src/app/analyze/[id]/page.tsx`
- **问题描述**: 步骤文本和动画命令执行是两条平行信息流，缺少逐步联动与可解释性
- **影响**: 学生难以建立"命令 -> 几何结论 -> 解题步骤"的认知映射
- **建议**: 建立学习模式联动（步骤高亮、命令定位、单步解释）
- **交叉审查发现**:
  - **类型兼容性隐患**: `AnalysisResult.solution` 定义为 `string[] | Step[]`，但 `page.tsx` 第 147 行解析时假设所有元素都可转换为 `Step`，如果 AI 返回混合类型（部分字符串部分对象），`typeof s === 'string'` 判断可能遗漏边缘情况
  - **AI 提示词兼容性**: `ANALYZE_SYSTEM_PROMPT` 新增 `solution` 字段要求（`commandIndices` + `explanation`），但 `GENERATE_SYSTEM_PROMPT` 未更新，导致"草图转精确图"模式生成的结果缺少学习模式支持
  - **旧数据兼容**: `useRealtimeGeoGebra.ts` 第 14 行 `solution: string[]` 类型定义与新的 `Step[]` 不兼容，实时预览功能可能无法正确处理新格式
  - **学习模式 UI 问题**: `analyze/[id]/page.tsx` 第 412 行学习模式按钮文本始终显示"学习模式"，无法区分当前状态（进入/退出），用户体验不佳
  - **命令索引越界风险**: `page.tsx` 第 143 行 `getCommandIndicesByStepIndex` 直接返回 `commandIndices`，未验证索引是否超出 `commandLines` 长度范围，AI 可能返回无效索引

### H4. API 安全加固
- **文件**: `frontend/src/app/api/*`, `frontend/src/lib/openrouter.ts`
- **问题描述**:
  - **CORS 配置缺失**: 所有 API 路由均未设置 CORS 头
  - **输入验证不足**: 无严格的长度限制和注入防护，存在 Prompt 注入风险
  - **无 CSP 配置**: 缺少内容安全策略
- **影响**: 存在 CSRF 攻击、Prompt 注入等安全风险
- **建议**: 添加 CORS 白名单、实现请求体大小限制、添加 CSP 配置
- **交叉审查发现**:
  - **CORS 配置过于宽松**: `middleware.ts` 第 27 行 `!origin` 允许无 Origin 头的请求（如 curl、Postman），生产环境应移除
  - **CSP 策略存在风险**: `script-src 'unsafe-eval' 'unsafe-inline'` 大幅削弱 CSP 保护，虽然 GeoGebra 需要 eval，但应限制为仅加载 GeoGebra 相关脚本
  - **中间件 matcher 范围过大**: `middleware.ts` 第 137 行 matcher 匹配所有非静态资源路径，包括 `_next/data` 等内部路径，可能干扰 Next.js 内部功能
  - **zod 验证过于严格**: `imageDataUriSchema` 使用正则 `dataUriRegex` 要求 base64 字符集，但某些合法 data URI 可能包含 URL 编码字符，导致误拦截
  - **缺少请求签名验证**: 虽然添加了输入清理，但 API 仍无请求签名/HMAC 验证，无法防止重放攻击
  - **敏感信息泄露**: `openrouter.ts` 中大量 `console.log` 输出请求体内容，可能泄露用户上传的图片数据（base64 编码）到日志

### H5. API 路由缺乏速率限制
- **文件**: `frontend/src/app/api/analyze/route.ts`、`frontend/src/app/api/generate-graphic/route.ts`、`frontend/src/app/api/fix-commands/route.ts`
- **问题描述**: 任何人都可以不限次数调用 API，单用户可迅速耗尽 OpenRouter API 配额
- **影响**: API 密钥可被滥用，造成直接经济损失
- **建议**: 添加基于 IP 的请求频率限制（可使用 `@upstash/ratelimit` 或 Next.js middleware）
- **交叉审查发现**:
  - **双重保护冲突风险**: middleware 和路由层都调用 `checkRateLimit`，同一请求会被计数两次，实际限制变为配置值的一半（例如配置 5 次/分钟，实际只能请求 2-3 次）
  - **IP 伪造风险**: `getClientIp` 优先信任 `x-forwarded-for` 头，攻击者可伪造此头绕过限制或嫁祸他人
  - **共享 IP 误伤**: 学校/企业网络下多个用户共用出口 IP，5 次/分钟的限制可能误伤正常用户
  - **无用户级限制**: 仅基于 IP 限制，同一用户切换网络（如 WiFi -> 4G）即可绕过限制
  - **清理机制不完善**: `cleanupExpiredEntries` 仅在 `checkRateLimit` 调用时触发，如果某个 IP 长期不请求，其过期数据会一直留在内存中直到下次清理触发
  - **缺少分布式支持**: 内存存储无法在多实例部署时共享限流状态，负载均衡下限制失效

---

## 中优先级

### M2. 生产环境日志输出过多
- **文件**: `frontend/src/lib/openrouter.ts`
- **问题描述**: 大量 `console.log` 输出请求体、响应内容等详细信息，生产环境可能泄露内部实现细节
- **影响**: 生产服务器日志中可见 API 调用详情
- **建议**: 用 `process.env.NODE_ENV === 'development'` 控制日志级别

### M3. API 响应运行时验证不足
- **文件**: `frontend/src/lib/openrouter.ts`
- **问题描述**: 使用 TypeScript 类型断言而非运行时验证，类型断言仅在编译时有效
- **影响**: 无法捕获 API 响应结构异常，可能导致运行时错误
- **建议**: 使用 `zod` 验证 `choices[0].message.content` 结构

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

### U3. 学习闭环不完整
- **代码现状**: 命令面板默认折叠；解题思路仅在分析模式可用；无命令解释
- **用户痛点**: 学生不清楚"这一步命令对应哪条几何结论"
- **改进方案**: 增加"学习模式"；步骤高亮与命令联动；支持单步解释

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
