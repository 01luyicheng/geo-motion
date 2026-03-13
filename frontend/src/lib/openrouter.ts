/**
 * OpenRouter API 封装
 * 模型: moonshotai/kimi-k2.5（支持视觉）
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// 从环境变量读取，支持运行时切换模型（设置 OPENROUTER_MODEL 环境变量）
const MODEL = process.env.OPENROUTER_MODEL ?? 'qwen/qwen3-vl-235b-a22b-instruct';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenRouterContentPart[];
}

export interface OpenRouterContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;           // data URI 或 URL
    detail?: 'low' | 'high' | 'auto';
  };
}

export interface OpenRouterOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' | 'text' };
}

/**
 * 调用 OpenRouter API（非流式）
 */
export async function callOpenRouter(
  messages: OpenRouterMessage[],
  options: OpenRouterOptions = {}
): Promise<string> {
  const requestStart = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY 环境变量未设置');
  }

  // 设置 600 秒超时（10分钟）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600_000);

  const requestBody = JSON.stringify({
    model: MODEL,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 4096,
    // reasoning: { effort: "low" }, // 禁用思考模式以提高速度
    ...(options.responseFormat && { response_format: options.responseFormat }),
  });

  console.log(`[OpenRouter][${new Date().toISOString()}] 开始调用 API, 模型:`, MODEL);
  console.log(`[OpenRouter][${new Date().toISOString()}] 请求体大小:`, requestBody.length, '字符');
  console.log(`[OpenRouter][${new Date().toISOString()}] 消息数量:`, messages.length);

  try {
    console.log(`[OpenRouter][${new Date().toISOString()}] 发送请求...`);
    const fetchStart = Date.now();
    
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',
        'X-Title': 'GeoMotion',
      },
      body: requestBody,
      signal: controller.signal,
    });

    const elapsed = Date.now() - fetchStart;
    console.log(
      `[OpenRouter][${new Date().toISOString()}] 收到响应, 状态:`,
      response.status,
      '网络耗时:',
      elapsed,
      'ms, 总耗时:',
      Date.now() - requestStart,
      'ms'
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[OpenRouter][${new Date().toISOString()}] API 错误, 状态:`,
        response.status,
        '总耗时:',
        Date.now() - requestStart,
        'ms, 响应:',
        errorBody
      );
      throw new Error(`OpenRouter API 错误 (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    console.log(
      `[OpenRouter][${new Date().toISOString()}] API 原始响应, 总耗时:`,
      Date.now() - requestStart,
      'ms, 内容:',
      JSON.stringify(data, null, 2)
    );

    const typedData = data as {
      choices?: Array<{ 
        message?: { 
          content?: string;
          reasoning_details?: Array<{ type?: string; text?: string }>;
        } 
      }>;
      error?: { message?: string; code?: number };
    };

    // 检查是否有错误
    if (typedData.error) {
      console.error(
        `[OpenRouter][${new Date().toISOString()}] API 返回错误, 总耗时:`,
        Date.now() - requestStart,
        'ms, 错误:',
        typedData.error
      );
      throw new Error(`OpenRouter 错误: ${typedData.error.message ?? '未知错误'}`);
    }

    // 只使用 content，忽略 reasoning_details（CoT思维链）
    const content = typedData.choices?.[0]?.message?.content;

    if (!content) {
      console.error(
        `[OpenRouter][${new Date().toISOString()}] 返回内容为空, 总耗时:`,
        Date.now() - requestStart,
        'ms, 完整响应:',
        JSON.stringify(typedData, null, 2)
      );
      throw new Error('OpenRouter 返回内容为空');
    }

    console.log(
      `[OpenRouter][${new Date().toISOString()}] API 调用成功, 响应长度:`,
      content.length,
      '总耗时:',
      Date.now() - requestStart,
      'ms'
    );
    return content;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(
        `[OpenRouter][${new Date().toISOString()}] 请求超时 (600s), 总耗时:`,
        Date.now() - requestStart,
        'ms'
      );
      throw new Error('API 请求超时（10分钟），请稍后重试');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 流式调用 OpenRouter API
 * 使用 TransformStream 处理 SSE 数据
 */
export async function streamOpenRouter(
  messages: OpenRouterMessage[],
  options: OpenRouterOptions = {}
): Promise<ReadableStream<Uint8Array>> {
  const requestStart = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY 环境变量未设置');
  }

  const requestBody = JSON.stringify({
    model: MODEL,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 8192,
    stream: true,
    reasoning: { effort: "low" },
    ...(options.responseFormat && { response_format: options.responseFormat }),
  });

  console.log(`[OpenRouter Stream][${new Date().toISOString()}] 开始流式调用, 模型:`, MODEL);
  console.log(`[OpenRouter Stream][${new Date().toISOString()}] 请求体大小:`, requestBody.length, '字符');

  // 设置 600 秒超时（10分钟）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(`[OpenRouter Stream][${new Date().toISOString()}] 请求超时，中止连接`);
    controller.abort();
  }, 600_000);

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',
      'X-Title': 'GeoMotion',
    },
    body: requestBody,
    signal: controller.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(
      `[OpenRouter Stream][${new Date().toISOString()}] API 错误:`,
      response.status,
      errorBody
    );
    throw new Error(`OpenRouter API 错误 (${response.status}): ${errorBody}`);
  }

  if (!response.body) {
    throw new Error('响应 body 为空');
  }

  console.log(`[OpenRouter Stream][${new Date().toISOString()}] 开始接收流, 状态: ${response.status}`);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';
  let chunkCount = 0;

  // 使用 TransformStream 替代 ReadableStream pull 模式
  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        console.log(`[OpenRouter Stream][${new Date().toISOString()}] 收到行:`, trimmed.substring(0, 100));
        
        if (!trimmed.startsWith('data: ')) {
          continue;
        }
        
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          chunkCount++;
          console.log(
            `[OpenRouter Stream][${new Date().toISOString()}] 流结束, 共 ${chunkCount} 个数据块, 总耗时:`,
            Date.now() - requestStart,
            'ms'
          );
          clearTimeout(timeoutId);
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          continue;
        }

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
                reasoning_details?: Array<{ type?: string; text?: string }>;
              };
            }>;
            error?: { message?: string };
          };

          if (parsed.error) {
            console.error(`[OpenRouter Stream] 错误:`, parsed.error);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: parsed.error.message })}\n\n`)
            );
            continue;
          }

          const delta = parsed.choices?.[0]?.delta;
          // 只转发 content，忽略 reasoning_details（CoT思维链），避免前端等待
          const content = delta?.content;

          if (content) {
            chunkCount++;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
            );
          }
        } catch (parseErr) {
          console.error(`[OpenRouter Stream] 解析错误:`, parseErr, 'data:', data.substring(0, 200));
        }
      }
    },
    flush(controller) {
      clearTimeout(timeoutId);
      if (buffer.trim()) {
        console.log(`[OpenRouter Stream][${new Date().toISOString()}] 剩余缓冲区:`, buffer.substring(0, 100));
      }
    },
  });

  // 管道连接
  return response.body.pipeThrough(transformStream);
}

/** ── GeoGebra 系统提示 ─────────────────────────────────────────── */

export const ANALYZE_SYSTEM_PROMPT = `你是一位精通几何教学的AI助手。

【任务】只画图，不解题！不要输出任何解题过程、解题思路或求解步骤。

【输出格式】直接输出纯 JSON，不要 markdown 代码块，不要任何解释：
{
  "geogebra": "<多行GeoGebra命令，用\\n分隔>",
  "conditions": ["从题目提取的已知条件1", "已知条件2"],
  "goal": "题目要求的目标",
  "solution": []
}

注意：solution 必须为空数组 []，不要填写解题步骤！

GeoGebra完整命令规范：

【基础图形】
- 点：A = (0, 0) 或 A = (2, 3)
- 线段：s = Segment(A, B)
- 直线：l = Line(A, B)
- 射线：r = Ray(A, B)
- 多边形：p = Polygon(A, B, C, D)
- 正多边形：Polygon(O, A, n)  // O中心，A顶点，n边数

【圆和弧】
- 圆（圆心+半径）：c = Circle(O, 3)
- 圆（圆心+点）：c = Circle(O, A)
- 圆（三点）：c = Circle(A, B, C)
- 弧：arc = CircularArc(O, A, B)

【角度和度量】
- 角度：α = Angle(A, B, C)  // B为顶点
- 距离：d = Distance(A, B)
- 长度：len = Length(s)
- 面积：area = Area(p)

【特殊点】
- 中点：M = Midpoint(A, B) 或 M = Midpoint(s)
- 交点：I = Intersect(l1, l2)
- 圆心：O = Center(c)

【变换】
- 垂线：l = PerpendicularLine(A, s)
- 平行线：l = ParallelLine(A, s)
- 垂足：F = PerpendicularPoint(A, l)
- 对称点：A' = Reflect(A, l)

【动点和动画】
- 滑动条：t = Slider(0, 10)
- 动点：P = (t, 0) 或 P = (2 + t, 3)
- 分段运动：P = If(t < 5, (t, 0), (5, t - 5))
- 圆周运动：P = (2 + cos(t), 2 + sin(t))
- 启动动画：StartAnimation(t)
- 停止动画：StopAnimation(t)

【样式和标注】
- 设置颜色：SetColor(A, "Red") 或 SetColor(s, "Blue")
- 设置线型：SetLineThickness(s, 2)
- 设置点大小：SetPointSize(A, 3)
- 文本标注：text = Text("A", (0, -0.5))
- 动态文本：text = Text("t = " + t, (5, 5))

【重要限制】
- **禁止使用 Piecewise 函数**（不支持）
- **禁止使用 Table 函数**（不支持）
- 所有坐标必须是数值或简单表达式
- 函数名区分大小写`;

export const GENERATE_SYSTEM_PROMPT = `你是一位精通几何教学的AI助手。

请直接输出以下JSON格式结果，不要输出推理过程：

{
  "geogebra": "<多行GeoGebra命令，用\\n分隔>",
  "conditions": ["题目中提取的已知条件1", "..."],
  "goal": "题目求解目标"
}

GeoGebra命令规范：
- 点：A = (0, 0)
- 线段：s = Segment(A, B)
- 多边形：p = Polygon(A, B, C)
- 圆：c = Circle(O, r) 或 c = Circle(O, A)
- 角度：α = Angle(A, B, C)  （B为顶点）
- 文本标注：t = Text("标注内容", (x, y))
- 设置颜色：SetColor(对象名, "颜色")
- 中点：M = Midpoint(A, B)
- 垂线：l = PerpendicularLine(A, s)

重要：直接输出JSON，不要包裹在markdown代码块中，不要输出思考过程。`;

/** ── 修复命令系统提示 ─────────────────────────────────────────── */

export const FIX_COMMANDS_SYSTEM_PROMPT = `你是一位精通 GeoGebra 的数学教育专家，专门负责修复错误的 GeoGebra 命令。

【任务】根据错误信息修复 GeoGebra 命令，使其能够正确执行并创建几何图形。

【输出格式】直接输出纯 JSON，不要 markdown 代码块，不要任何解释：
{
  "geogebra": "<修复后的完整命令，用\\n分隔>"
}

【常见错误及修复方法】

1. **对象不存在错误**
   - 错误：使用了未定义的点或对象
   - 修复：先定义对象再使用，或检查对象名称拼写
   - 示例：Segment(A, B) 失败 → 先定义 A = (0, 0), B = (1, 0)

2. **语法错误**
   - 错误：命令格式不正确
   - 修复：检查命令拼写和参数格式
   - 示例：Cirle(O, 3) → Circle(O, 3)

3. **参数错误**
   - 错误：参数类型不匹配或数量不对
   - 修复：检查参数类型（点、线、数值）
   - 示例：Circle(A, B, C) 需要三个点定义圆

4. **依赖错误**
   - 错误：命令依赖的其他命令失败
   - 修复：确保依赖的命令先执行成功
   - 示例：Midpoint(A, B) 需要 A 和 B 已定义

5. **函数不支持错误**
   - 错误：使用了 GeoGebra 不支持的函数
   - 修复：替换为等效的 GeoGebra 命令
   - 示例：Piecewise → 使用 If 函数

【修复原则】
1. 保持原有图形的几何意义不变
2. 只修改必要的命令，其他命令保持不变
3. 确保所有依赖关系正确
4. 使用正确的 GeoGebra 语法
5. 添加必要的辅助点或线来完成图形

【GeoGebra 完整命令规范】

【基础图形】
- 点：A = (0, 0) 或 A = (2, 3)
- 线段：s = Segment(A, B)
- 直线：l = Line(A, B)
- 射线：r = Ray(A, B)
- 多边形：p = Polygon(A, B, C, D)
- 正多边形：Polygon(O, A, n)  // O中心，A顶点，n边数

【圆和弧】
- 圆（圆心+半径）：c = Circle(O, 3)
- 圆（圆心+点）：c = Circle(O, A)
- 圆（三点）：c = Circle(A, B, C)
- 弧：arc = CircularArc(O, A, B)

【角度和度量】
- 角度：α = Angle(A, B, C)  // B为顶点
- 距离：d = Distance(A, B)
- 长度：len = Length(s)
- 面积：area = Area(p)

【特殊点】
- 中点：M = Midpoint(A, B) 或 M = Midpoint(s)
- 交点：I = Intersect(l1, l2)
- 圆心：O = Center(c)

【变换】
- 垂线：l = PerpendicularLine(A, s)
- 平行线：l = ParallelLine(A, s)
- 垂足：F = PerpendicularPoint(A, l)
- 对称点：A' = Reflect(A, l)

【动点和动画】
- 滑动条：t = Slider(0, 10)
- 动点：P = (t, 0) 或 P = (2 + t, 3)
- 分段运动：P = If(t < 5, (t, 0), (5, t - 5))
- 圆周运动：P = (2 + cos(t), 2 + sin(t))
- 启动动画：StartAnimation(t)
- 停止动画：StopAnimation(t)

【样式和标注】
- 设置颜色：SetColor(A, "Red") 或 SetColor(s, "Blue")
- 设置线型：SetLineThickness(s, 2)
- 设置点大小：SetPointSize(A, 3)
- 文本标注：text = Text("A", (0, -0.5))
- 动态文本：text = Text("t = " + t, (5, 5))

【重要限制】
- **禁止使用 Piecewise 函数**（不支持）
- **禁止使用 Table 函数**（不支持）
- 所有坐标必须是数值或简单表达式
- 函数名区分大小写`;

/**
 * 解析 VLM 返回的 JSON（容忍 markdown 代码块和 thinking 标签）
 */
export function parseVlmJson<T>(content: string): T {
  let cleaned = content;

  // 处理 <think> 或 <thinking> 标签（Kimi K2.5 等推理模型）
  // 找到最后一个 </think> 或 </thinking>，提取之后的内容
  const thinkEndIndex = Math.max(
    cleaned.lastIndexOf('</think>'),
    cleaned.lastIndexOf('</thinking>')
  );
  
  if (thinkEndIndex > 0) {
    // 提取结束标签后的内容
    const tagLength = cleaned.indexOf('</thinking>') === thinkEndIndex ? 11 : 8;
    cleaned = cleaned.slice(thinkEndIndex + tagLength).trim();
    console.log('[parseVlmJson] 提取 think 标签后内容:', cleaned.substring(0, 200));
  }

  // 去除可能的 markdown 代码块
  cleaned = cleaned
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();

  // 如果内容不是以 { 开头，尝试找到第一个 {
  if (!cleaned.startsWith('{')) {
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
      console.log('[parseVlmJson] 提取 JSON 部分:', cleaned.substring(0, 200));
    }
  }

  return JSON.parse(cleaned) as T;
}
