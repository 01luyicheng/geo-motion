# GeoMotion API 文档

## 概述

GeoMotion 提供 RESTful API 用于几何题目分析和图形生成。

**Base URL:** `http://localhost:3000/api`

---

## POST /api/analyze

分析几何题目图片，提取图形信息和解题思路。

### 请求

```http
POST /api/analyze
Content-Type: application/json

{
  "image": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| image | string | 是 | Base64 编码的图片（含 data URI 前缀） |

### 成功响应

```json
{
  "success": true,
  "data": {
    "id": "analysis_123456",
    "geogebra": "A = (0, 0)\nB = (5, 0)\nC = (2.5, 4.33)\np = Polygon(A, B, C)\nα = Angle(B, A, C)\nText(\"60°\", A + (0.3, 0.2))",
    "conditions": ["三角形ABC是等边三角形", "AB = BC = CA = 5cm"],
    "goal": "求三角形ABC的面积",
    "solution": [
      "根据等边三角形面积公式：S = (√3/4) × a²",
      "代入 a = 5cm",
      "S = (√3/4) × 25 ≈ 10.83 cm²"
    ]
  }
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "INVALID_IMAGE",
    "message": "无法识别图片内容"
  }
}
```

### 错误码

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| `INVALID_IMAGE` | 400 | 图片格式错误 |
| `NO_GEOMETRY_FOUND` | 400 | 未检测到几何图形 |
| `VLM_ERROR` | 500 | VLM 调用失败 |

---

## POST /api/generate-graphic

根据题目文本生成精确几何图形。

### 请求

```http
POST /api/generate-graphic
Content-Type: application/json

{
  "text": "已知三角形ABC中，AB=AC=5cm，∠A=60°",
  "sketch": "data:image/jpeg;base64/..."
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | 是 | 题目文本描述 |
| sketch | string | 否 | 手绘草图 Base64 |

### 成功响应

```json
{
  "success": true,
  "data": {
    "id": "graphic_345678",
    "geogebra": "A = (0, 0)\nB = (5, 0)\nC = (2.5, 4.33)\np = Polygon(A, B, C)",
    "format": "svg",
    "content": "<svg xmlns=\"http://www.w3.org/2000/svg\"...>...</svg>"
  }
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "GENERATION_FAILED",
    "message": "图形生成失败"
  }
}
```

---

## 数据类型

类型定义统一在 `ARCHITECTURE.md` 中，此处仅列出概要：

### AnalysisResult

```typescript
interface AnalysisResult {
  id: string;
  geogebra: string;              // GeoGebra 命令脚本
  conditions: string[];
  goal: string;
  solution: string[];
}
```

---

*最后更新: 2026-03-10*