import { NextRequest } from 'next/server';
import {
  streamOpenRouter,
  ANALYZE_SYSTEM_PROMPT,
  type OpenRouterMessage,
  sanitizeInput,
} from '@/lib/openrouter';
import { analyzeRequestSchema, safeParseJson, validateTimestamp } from '@/lib/validation';

const isDev = process.env.NODE_ENV === 'development';

// 允许路由最多执行 300 秒（AI 响应可能较慢）
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const requestStart = Date.now();

  try {
    // 使用 zod 验证请求体
    const parseResult = await safeParseJson(req, analyzeRequestSchema);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ success: false, error: parseResult.error }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = parseResult.data;

    // 校验时间戳，防止重放攻击
    const timestampCheck = validateTimestamp(body.timestamp);
    if (!timestampCheck.valid) {
      return new Response(
        JSON.stringify({ success: false, error: timestampCheck.error }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 清理输入，防止 prompt 注入
    const previousError = body.previousError ? sanitizeInput(body.previousError) : undefined;

    // 构建用户提示，包含重试信息
    let userPrompt =
      '请识别这道几何题，重建GeoGebra图形并给出简洁解题思路。严格按照系统提示的JSON格式输出。';

    if (body.retryCount && body.retryCount > 0 && previousError) {
      userPrompt = `之前的生成结果有语法错误，请修正后重新生成。\n\n错误信息：${previousError}\n\n请重新识别这道几何题，生成正确的GeoGebra命令。注意检查：\n1. 所有括号必须成对出现\n2. 命令参数不能为空\n3. 不要使用中文字符\n4. 确保命令格式正确\n\n严格按照系统提示的JSON格式输出。`;
    }

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: ANALYZE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: body.image },
          },
          {
            type: 'text',
            text: userPrompt,
          },
        ],
      },
    ];

    const stream = await streamOpenRouter(messages, {
      temperature: 0.1,
      maxTokens: 4096,
    });

    if (isDev) {
      console.log(
        `[analyze][${new Date().toISOString()}] 开始流式响应, 耗时:`,
        Date.now() - requestStart,
        'ms'
      );
    }

    // 返回 SSE 流
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '服务器内部错误';
    console.error(`[analyze][${new Date().toISOString()}] 错误:`, message);
    return new Response(
      JSON.stringify({ success: false, error: { code: 'VLM_ERROR', message } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
