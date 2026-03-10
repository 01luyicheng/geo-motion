# GeoMotion 代码审查问题清单

> 创建时间: 2026-03-10
> 状态: 待验证

---

## 1. 安全性问题

### 1.1 API 图片大小校验缺失
- **文件**: `frontend/src/app/api/analyze/route.ts`
- **问题描述**: 后端 API 未对上传的 base64 图片大小进行校验，恶意用户可绕过前端 10MB 限制发送超大请求
- **风险等级**: 高
- **验证点**: 检查 API route 是否有 base64 字符串长度限制

### 1.2 API 图片大小校验缺失（generate-graphic）
- **文件**: `frontend/src/app/api/generate-graphic/route.ts`
- **问题描述**: 同上，草图上传也缺少大小校验
- **风险等级**: 高
- **验证点**: 检查 API route 是否有 base64 字符串长度限制

---

## 2. 潜在 Bug

### 2.1 GeoGebra 脚本全局状态问题
- **文件**: `frontend/src/components/GeoGebraViewer.tsx`
- **位置**: 第 15-17 行
- **代码**:
  ```typescript
  let ggbScriptLoaded = false;
  let ggbScriptLoading = false;
  const ggbReadyCallbacks: (() => void)[] = [];
  ```
- **问题描述**: 模块级变量在页面切换后可能状态不一致，快速切换页面可能导致回调错乱
- **风险等级**: 中
- **验证点**: 确认这些变量是否可能导致并发问题

### 2.2 SVG 导出逻辑不可靠
- **文件**: `frontend/src/app/analyze/[id]/page.tsx`
- **位置**: 第 155-165 行
- **代码**:
  ```typescript
  const api = (window as unknown as Record<string, typeof window.ggbApplet>);
  const svg = Object.values(api).find(...)
  ```
- **问题描述**: 通过遍历 window 对象查找 API 实例不可靠
- **风险等级**: 中
- **验证点**: 检查是否有更可靠的方式获取 GeoGebra API 实例

### 2.3 动画重播逻辑竞态条件
- **文件**: `frontend/src/app/analyze/[id]/page.tsx`
- **位置**: 第 78-88 行
- **问题描述**: 动画播放结束后使用 setTimeout 延迟 200ms 重置状态，期间用户操作可能导致状态混乱
- **风险等级**: 低
- **验证点**: 分析 handlePlay 函数的逻辑流程

---

## 3. 性能问题

### 3.1 GeoGebra 命令重复执行
- **文件**: `frontend/src/components/GeoGebraViewer.tsx`
- **位置**: 第 88-104 行
- **问题描述**: 动画模式下，每次 commandIndex 变化都会调用 `newConstruction()` 重建整个图形，而非增量执行新命令
- **风险等级**: 中
- **验证点**: 确认 useEffect 中的命令执行逻辑

---

## 4. 用户体验问题

### 4.1 无加载超时处理
- **文件**: `frontend/src/components/GeoGebraViewer.tsx`
- **问题描述**: GeoGebra 脚本加载失败时无错误提示，网络问题会导致无限 loading
- **风险等级**: 中
- **验证点**: 检查是否有超时处理和错误状态

---

## 5. 代码规范问题

### 5.1 API 响应缺少运行时类型验证
- **文件**: `frontend/src/app/page.tsx`
- **位置**: 第 47 行
- **代码**:
  ```typescript
  const json = await res.json() as ApiResponse<AnalysisResult>;
  ```
- **问题描述**: 直接使用类型断言，未验证返回数据结构是否符合预期
- **风险等级**: 低
- **验证点**: 确认是否有 zod 或其他运行时验证

### 5.2 类型定义不完整
- **文件**: `frontend/src/types/index.ts`
- **问题描述**: `window.ggbApplet` 类型定义缺少部分方法声明
- **风险等级**: 低
- **验证点**: 检查 GGBApplet 相关类型是否完整

---

## 6. 缺失功能

| 功能 | 状态 | 说明 |
|------|------|------|
| PNG 导出 | 未实现 | SPEC.md 提到支持 PNG 导出，但代码仅实现 SVG |
| 历史记录 | 未实现 | 分析结果存储在 localStorage，无法查看历史 |
| 暗色模式切换 | 未实现 | CSS 定义了暗色变量，但无切换入口 |

---

## 验证状态

| 编号 | 问题 | 验证结果 | 风险评估 | 说明 |
|------|------|----------|----------|------|
| 1.1 | API 图片大小校验缺失 | ✅ 确认存在 | 高 | 后端确实缺少 base64 大小限制 |
| 1.2 | generate-graphic 大小校验缺失 | ✅ 确认存在 | 高 | 同上，草图上传也无校验 |
| 2.1 | GeoGebra 全局状态问题 | ⚠️ 部分存在 | 中 | 全局状态设计合理，真正问题是缺少 onerror 处理 |
| 2.2 | SVG 导出逻辑不可靠 | ✅ 确认存在 | 中 | 遍历 window 对象不可靠，应使用 exportGeoGebraSvg() |
| 2.3 | 动画重播竞态条件 | ✅ 确认存在 | 低 | setTimeout 未清理，实际影响较小 |
| 3.1 | GeoGebra 命令重复执行 | ✅ 确认存在 | 中 | 每次 newConstruction() 重建，应增量执行 |
| 4.1 | 无加载超时处理 | ✅ 确认存在 | 中 | 缺少 onerror 和超时处理 |
| 5.1 | API 响应无运行时验证 | ✅ 确认存在 | 低 | 仅使用类型断言 |
| 5.2 | 类型定义不完整 | ⚠️ 部分存在 | 低 | 当前功能够用，但不完整 |

---

## 统计

| 类别 | 确认存在 | 部分存在 | 不存在 |
|------|---------|---------|--------|
| 安全性 | 2 | 0 | 0 |
| 潜在 Bug | 2 | 1 | 0 |
| 性能 | 1 | 0 | 0 |
| 用户体验 | 1 | 0 | 0 |
| 代码规范 | 1 | 1 | 0 |
| **总计** | **7** | **2** | **0** |

---

## 修复优先级建议

### 🔴 高优先级（安全相关）
1. **1.1 & 1.2** - API 添加 base64 大小限制

### 🟡 中优先级（影响用户体验）
2. **3.1** - GeoGebra 命令增量执行
3. **4.1** - 添加加载超时和错误处理
4. **2.2** - 使用正确的 SVG 导出方法

### 🟢 低优先级（代码质量）
5. **2.3** - 清理 setTimeout
6. **5.1** - 添加运行时类型验证
7. **2.1** - 补充 onerror 处理
8. **5.2** - 补充类型定义

---

*验证时间: 2026-03-10*
