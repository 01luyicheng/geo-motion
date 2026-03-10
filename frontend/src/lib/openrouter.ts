/**
 * OpenRouter API 封装
 * 模型: moonshotai/kimi-k2.5（支持视觉）
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'moonshotai/kimi-k2.5';

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
 * 调用 OpenRouter API
 */
export async function callOpenRouter(
  messages: OpenRouterMessage[],
  options: OpenRouterOptions = {}
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY 环境变量未设置');
  }

  // 设置 120 秒超时
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  console.log('[OpenRouter] 开始调用 API, 模型:', MODEL);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',
        'X-Title': 'GeoMotion',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 4096,
        ...(options.responseFormat && { response_format: options.responseFormat }),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[OpenRouter] API 错误:', response.status, errorBody);
      throw new Error(`OpenRouter API 错误 (${response.status}): ${errorBody}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter 返回内容为空');
    }

    console.log('[OpenRouter] API 调用成功, 响应长度:', content.length);
    return content;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[OpenRouter] 请求超时 (120s)');
      throw new Error('API 请求超时，请稍后重试');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** ── GeoGebra 系统提示 ─────────────────────────────────────────── */

export const ANALYZE_SYSTEM_PROMPT = `你是一位精通几何教学的AI助手，具有计算机代数和GeoGebra命令生成能力。

你的任务是分析几何题目图片，并输出以下JSON格式（严格遵守，不要有markdown代码块包裹）：

{
  "geogebra": "<多行GeoGebra命令，用\\n分隔>",
  "conditions": ["已知条件1", "已知条件2"],
  "goal": "求解目标",
  "solution": ["解题步骤1", "解题步骤2", "..."]
}

GeoGebra命令规范：
- 点：A = (0, 0)
- 线段：s = Segment(A, B)
- 多边形：p = Polygon(A, B, C)
- 圆：c = Circle(O, r) 或 c = Circle(O, A)
- 角度：α = Angle(A, B, C)  （B为顶点）
- 文本标注：t = Text("标注内容", (x, y))
- 设置颜色：SetColor(对象名, "颜色")，颜色如 "Blue", "Red", "Green"
- 设置线粗：SetLineThickness(对象名, 厚度)
- 中点：M = Midpoint(A, B)
- 垂线：l = PerpendicularLine(A, s)
- 角平分线：bis = AngleBisector(A, B, C)

注意：
1. 命令中不要有注释
2. 坐标要合理，图形不要太小也不要太大（建议在(-2,-2)到(8,8)范围内）
3. 先定义点，再构建图形
4. 最后添加标注文字
5. 每行只写一条命令`;

export const GENERATE_SYSTEM_PROMPT = `你是一位精通几何教学的AI助手，能够根据题目文字描述（和可选的手绘草图）生成精确的几何图形GeoGebra命令。

你的任务是生成以下JSON格式（严格遵守，不要有markdown代码块包裹）：

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

注意：
1. 坐标精确，比例正确
2. 图形在(-2,-2)到(10,10)范围内
3. 先定义点，再构建图形，最后添加标注
4. 每行只写一条命令
5. 适合印刷用途，线条清晰`;

/**
 * 解析 VLM 返回的 JSON（容忍 markdown 代码块）
 */
export function parseVlmJson<T>(content: string): T {
  // 去除可能的 markdown 代码块
  const cleaned = content
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();

  return JSON.parse(cleaned) as T;
}
