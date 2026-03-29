# GitHub Copilot 代码审查指南

## 项目背景

GeoMotion 是一个使用 VLM 将几何题目转换为动态图形的教学辅助工具。

- **前端**: Next.js 14, React, TypeScript
- **样式**: Tailwind CSS, shadcn/ui
- **图形**: GeoGebra 嵌入
- **VLM**: OpenRouter API (GPT-4 Vision)

## 代码审查要点

### TypeScript 规范

- 使用严格的类型定义，避免 `any`
- 接口命名使用 PascalCase
- 组件 props 需要定义类型接口

### React 规范

- 使用函数组件和 Hooks
- 避免在渲染中定义函数
- 正确使用 useEffect 依赖数组

### 样式规范

- 使用 Tailwind CSS 类名
- 避免内联样式
- 响应式设计优先

### 性能考虑

- 避免不必要的重渲染
- 图片使用 Next.js Image 组件
- 合理使用 memo/useMemo/useCallback

### 安全考虑

- 不在客户端暴露 API Keys
- 用户输入需要验证
- 防止 XSS 攻击

## 审查输出格式

请按以下格式输出审查结果：

### ✅ 优点
- 代码的优点

### ⚠️ 建议改进
- 具体的改进建议

### ❌ 问题
- 需要修复的问题（如有）

### 📚 学习资源
- 相关的学习链接（如有）
