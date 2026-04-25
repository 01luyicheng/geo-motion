/**
 * OpenRouter API 封装
 * 模型：qwen/qwen3-vl-235b-a22b-instruct（阿里通义千问多模态模型，国内可用，已禁用思考模式）
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

const isDev = process.env.NODE_ENV === 'development';
const debugEnabled = process.env.DEBUG === '1';

/** 判断是否应该输出日志 */
function shouldLog(level: 'info' | 'error'): boolean {
  if (level === 'error') return true;
  // info 级别仅在开发环境或 DEBUG=1 时输出
  return isDev || debugEnabled;
}

/** 过滤敏感字段 */
function filterSensitiveMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const sensitiveKeys = ['image', 'dataUri', 'base64'];
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk.toLowerCase()))) {
      filtered[key] = '[REDACTED]';
    } else {
      filtered[key] = value;
    }
  }
  return filtered;
}

/** 结构化日志（生产环境使用，只记录元数据） */
function logStructured(
  level: 'info' | 'error',
  module: string,
  message: string,
  meta?: Record<string, unknown>
) {
  if (!shouldLog(level)) return;

  const filteredMeta = filterSensitiveMeta(meta);

  if (isDev) {
    const ts = new Date().toISOString();
    if (level === 'error') {
      console.error(`[${module}][${ts}] ${message}`, filteredMeta ? JSON.stringify(filteredMeta) : '');
    } else {
      console.log(`[${module}][${ts}] ${message}`, filteredMeta ? JSON.stringify(filteredMeta) : '');
    }
  } else {
    // 生产环境：输出结构化 JSON 日志，供日志收集系统处理
    const logLine = JSON.stringify({
      level,
      module,
      time: new Date().toISOString(),
      message,
      ...filteredMeta,
    });
    // eslint-disable-next-line no-console
    console.log(logLine);
  }
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
    reasoning: { effort: "none" }, // 禁用思考模式，提高响应速度
    ...(options.responseFormat && { response_format: options.responseFormat }),
  });

  logStructured('info', 'OpenRouter', '开始调用 API', {
    model: MODEL,
    bodySize: requestBody.length,
    messageCount: messages.length,
  });

  if (isDev) {
    console.log(`[OpenRouter][${new Date().toISOString()}] 消息数量:`, messages.length);
  }

  try {
    if (isDev) {
      console.log(`[OpenRouter][${new Date().toISOString()}] 发送请求...`);
    }
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
    logStructured('info', 'OpenRouter', '收到响应', {
      status: response.status,
      networkMs: elapsed,
      totalMs: Date.now() - requestStart,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logStructured('error', 'OpenRouter', 'API 错误', {
        status: response.status,
        totalMs: Date.now() - requestStart,
        errorPreview: errorBody.slice(0, 500),
      });
      throw new Error(`OpenRouter API 错误 (${response.status}): ${errorBody}`);
    }

    const data = await response.json();

    if (isDev) {
      const dataStr = JSON.stringify(data);
      console.log(
        `[OpenRouter][${new Date().toISOString()}] API 原始响应, 总耗时:`,
        Date.now() - requestStart,
        'ms, 状态: OK, 内容长度:',
        dataStr.length,
        ', 内容前100字符:',
        dataStr.substring(0, 100)
      );
    } else {
      logStructured('info', 'OpenRouter', 'API 原始响应', {
        totalMs: Date.now() - requestStart,
        responseType: typeof data,
      });
    }

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
      logStructured('error', 'OpenRouter', 'API 返回错误', {
        totalMs: Date.now() - requestStart,
        error: typedData.error,
      });
      throw new Error(`OpenRouter 错误: ${typedData.error.message ?? '未知错误'}`);
    }

    // 只使用 content，忽略 reasoning_details（CoT思维链）
    const content = typedData.choices?.[0]?.message?.content;

    if (!content) {
      logStructured('error', 'OpenRouter', '返回内容为空', {
        totalMs: Date.now() - requestStart,
      });
      throw new Error('OpenRouter 返回内容为空');
    }

    logStructured('info', 'OpenRouter', 'API 调用成功', {
      contentLength: content.length,
      totalMs: Date.now() - requestStart,
    });
    return content;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      logStructured('error', 'OpenRouter', '请求超时 (600s)', {
        totalMs: Date.now() - requestStart,
      });
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
    reasoning: { effort: "none" }, // 禁用思考模式，提高响应速度
    ...(options.responseFormat && { response_format: options.responseFormat }),
  });

  logStructured('info', 'OpenRouter Stream', '开始流式调用', {
    model: MODEL,
    bodySize: requestBody.length,
  });

  if (isDev) {
    console.log(`[OpenRouter Stream][${new Date().toISOString()}] 请求体大小:`, requestBody.length, '字符');
  }

  // 设置 600 秒超时（10分钟）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logStructured('info', 'OpenRouter Stream', '请求超时，中止连接', {
      totalMs: Date.now() - requestStart,
    });
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
    logStructured('error', 'OpenRouter Stream', 'API 错误', {
      status: response.status,
      errorPreview: errorBody.slice(0, 500),
    });
    throw new Error(`OpenRouter API 错误 (${response.status}): ${errorBody}`);
  }

  if (!response.body) {
    throw new Error('响应 body 为空');
  }

  logStructured('info', 'OpenRouter Stream', '开始接收流', {
    status: response.status,
  });

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

        if (isDev) {
          console.log(`[OpenRouter Stream][${new Date().toISOString()}] 收到行:`, trimmed.substring(0, 100));
        }

        if (!trimmed.startsWith('data: ')) {
          continue;
        }

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          chunkCount++;
          logStructured('info', 'OpenRouter Stream', '流结束', {
            chunkCount,
            totalMs: Date.now() - requestStart,
          });
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
            logStructured('error', 'OpenRouter Stream', '流错误', {
              error: parsed.error,
            });
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
          logStructured('error', 'OpenRouter Stream', '解析错误', {
            error: String(parseErr),
            dataPreview: data.substring(0, 200),
          });
        }
      }
    },
    flush(controller) {
      clearTimeout(timeoutId);
      if (buffer.trim()) {
        logStructured('info', 'OpenRouter Stream', '剩余缓冲区', {
          bufferPreview: buffer.substring(0, 100),
        });
      }
    },
  });

  // 管道连接
  return response.body.pipeThrough(transformStream);
}

/** ── GeoGebra 系统提示 ─────────────────────────────────────────── */

export const ANALYZE_SYSTEM_PROMPT = `你是一位精通 GeoGebra 的数学教育 AI。

【任务】根据题目生成 GeoGebra 几何图形命令，并给出简洁解题思路。

【严格规则 - 必须遵守】
1. **GeoGebra 命令必须使用英文**，即使题目是中文！
2. **禁止使用任何中文字符在命令中**（包括函数名、变量名）
3. 常用函数英文对照：如果=If、并且=And、或者=Or、平方根=sqrt、正弦=sin、余弦=cos
4. 所有坐标必须是数值或简单表达式
5. 函数名区分大小写

【输出格式】直接输出纯 JSON，不要 markdown 代码块：
{
  "geogebra": "<多行GeoGebra命令，用\\n分隔>",
  "conditions": ["从题目提取的已知条件1", "已知条件2"],
  "goal": "题目要求的目标",
  "solution": [
    {
      "text": "步骤1描述",
      "commandIndices": [0, 1],
      "explanation": "该步骤的几何原理说明"
    },
    {
      "text": "步骤2描述",
      "commandIndices": [2],
      "explanation": "该步骤的几何原理说明"
    }
  ]
}

【solution 字段要求】
1. 提供 2-5 条简洁步骤，聚焦思路，不写冗长推导
2. 每个步骤必须包含 commandIndices 字段，表示该步骤对应哪些 GeoGebra 命令索引（0-based）
3. 每个步骤必须包含 explanation 字段，说明该步骤的几何原理和数学依据
4. 如题目信息不足，可返回空数组 []
5. commandIndices 必须准确对应 geogebra 字段中的命令行索引

【命令顺序】
1. 先定义所有点（A = (0, 0)）
2. 再定义线段/直线（s = Segment(A, B)）
3. 然后定义圆/多边形（c = Circle(O, 3)）
4. 最后设置样式（SetColor, Text）

【命令示例】
- 点：A = (0, 0)
- 线段：s = Segment(A, B)
- 圆：c = Circle(O, 3)
- 角度：α = Angle(A, B, C)
- 中点：M = Midpoint(A, B)
- 垂线：l = PerpendicularLine(A, s)
- 滑动条：t = Slider(0, 10)
- 分段运动：P = If(t < 5, (t, 0), (5, t - 5))
- 颜色：SetColor(A, "Red")
- 文本：text = Text("A", (0, -0.5))

【禁止】
- Piecewise、Table 函数
- 中文命令（如"如果"必须用"If"）
- 在 geogebra 字段中夹带解释文字`;

export const GENERATE_SYSTEM_PROMPT = `你是一位精通 GeoGebra 的数学教育 AI。

【任务】根据题目生成 GeoGebra 几何图形命令。

【严格规则 - 必须遵守】
1. **GeoGebra 命令必须使用英文**，即使题目是中文！
2. **禁止使用任何中文字符在命令中**（包括函数名、变量名）
3. 常用函数英文对照：如果=If、并且=And、或者=Or、平方根=sqrt、正弦=sin、余弦=cos
4. 所有坐标必须是数值或简单表达式
5. 函数名区分大小写

【输出格式】直接输出纯 JSON，不要 markdown 代码块：
{
  "geogebra": "<多行GeoGebra命令，用\\n分隔>",
  "conditions": ["题目中提取的已知条件1", "..."],
  "goal": "题目求解目标"
}

【命令示例】
- 点：A = (0, 0)
- 线段：s = Segment(A, B)
- 多边形：p = Polygon(A, B, C)
- 圆：c = Circle(O, 3)
- 角度：α = Angle(A, B, C)
- 中点：M = Midpoint(A, B)
- 垂线：l = PerpendicularLine(A, s)
- 滑动条：t = Slider(0, 10)
- 分段运动：P = If(t < 5, (t, 0), (5, t - 5))
- 颜色：SetColor(A, "Red")
- 文本：text = Text("A", (0, -0.5))

【禁止】
- Piecewise、Table 函数
- 中文命令（如"如果"必须用"If"）`;

/** ── 修复命令系统提示 ─────────────────────────────────────────── */

export const FIX_COMMANDS_SYSTEM_PROMPT = `你是一位精通 GeoGebra 的数学教育专家，专门负责修复错误的 GeoGebra 命令。

【任务】根据错误信息修复 GeoGebra 命令，使其能够正确执行并创建几何图形。

【输出格式】直接输出纯 JSON，不要 markdown 代码块，不要任何解释：
{
  "geogebra": "<修复后的完整命令，用\\n分隔>"
}

【常见错误及修复方法】

1. **中文命令错误（最常见）**
   - 错误：使用了中文字符作为函数名
   - 修复：将所有中文函数名替换为英文
   - 示例：
     - "如果" → "If"
     - "并且" → "And"
     - "或者" → "Or"
     - "平方根" → "sqrt"
     - "正弦" → "sin"
     - "余弦" → "cos"
   - 修复后：P = If(t < 5, (t, 0), (5, t - 5))

2. **对象不存在错误**
   - 错误：使用了未定义的点或对象
   - 修复：先定义对象再使用，或检查对象名称拼写
   - 示例：Segment(A, B) 失败 → 先定义 A = (0, 0), B = (1, 0)

3. **语法错误**
   - 错误：命令格式不正确
   - 修复：检查命令拼写和参数格式
   - 示例：Cirle(O, 3) → Circle(O, 3)

4. **参数错误**
   - 错误：参数类型不匹配或数量不对
   - 修复：检查参数类型（点、线、数值）
   - 示例：Circle(A, B, C) 需要三个点定义圆

5. **依赖错误**
   - 错误：命令依赖的其他命令失败
   - 修复：确保依赖的命令先执行成功
   - 示例：Midpoint(A, B) 需要 A 和 B 已定义

6. **函数不支持错误**
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
 * 输入清理函数：防止 Prompt 注入
 * - 过滤控制字符和危险特殊字符
 * - 限制最大长度
 * - 去除零宽字符
 */
export function sanitizeInput(input: string, maxLength = 5000): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // 截断超长输入
  let cleaned = input.length > maxLength ? input.slice(0, maxLength) : input;

  // 去除零宽字符（常用于绕过过滤）
  cleaned = cleaned.replace(
    /[\u200B-\u200F\uFEFF\u2060-\u206F]/g,
    ''
  );

  // 过滤控制字符（保留换行和制表符）
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 过滤危险的 prompt 注入标记（不区分大小写）
  const dangerousPatterns = [
    /ignore previous instructions/gi,
    /disregard (all )?previous (instructions|prompts)/gi,
    /you are now/gi,
    /system prompt/gi,
    /new instruction/gi,
    /\{\{.*?\}\}/g, // 模板注入
    /<%.*?%>/g, // 模板注入
    /<\?php/gi,
    /<script/gi,
  ];

  for (const pattern of dangerousPatterns) {
    cleaned = cleaned.replace(pattern, '[FILTERED]');
  }

  // 限制连续特殊字符（防止编码绕过）
  cleaned = cleaned.replace(/[!@#$%^&*+]{5,}/g, (match) => match.slice(0, 4));

  return cleaned.trim();
}

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
    if (isDev) {
      console.log('[parseVlmJson] 提取 think 标签后内容:', cleaned.substring(0, 200));
    }
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
      if (isDev) {
        console.log('[parseVlmJson] 提取 JSON 部分:', cleaned.substring(0, 200));
      }
    }
  }

  return JSON.parse(cleaned) as T;
}
