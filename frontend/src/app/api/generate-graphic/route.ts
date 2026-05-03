import { NextRequest } from 'next/server';
import {
  streamOpenRouter,
  GENERATE_SYSTEM_PROMPT,
  type OpenRouterMessage,
  type OpenRouterContentPart,
  sanitizeInput,
} from '@/lib/openrouter';
import { generateGraphicRequestSchema, safeParseJson, validateTimestamp } from '@/lib/validation';

const isDev = process.env.NODE_ENV === 'development';

// 允许路由最多执行 300 秒（AI 响应可能较慢）
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const requestStart = Date.now();

  try {
    // 使用 zod 验证请求体
    const parseResult = await safeParseJson(req, generateGraphicRequestSchema);
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
    const text = sanitizeInput(body.text);
    const previousError = body.previousError ? sanitizeInput(body.previousError) : undefined;

    // 构建消息内容
    const contentParts: OpenRouterContentPart[] = [];

    // 如果有草图，先附上图片
    if (body.sketch) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: body.sketch },
      });

      // 构建提示文本，包含重试信息
      let promptText = `题目文本：${text}\n\n以上是手绘草图，请结合题目文本和草图，生成精确的GeoGebra命令。严格按照系统提示的JSON格式输出。`;

      if (body.retryCount && body.retryCount > 0 && previousError) {
        promptText = `题目文本：${text}\n\n之前的生成结果有语法错误，请修正后重新生成。\n\n错误信息：${previousError}\n\n以上是手绘草图，请结合题目文本和草图，生成正确的GeoGebra命令。注意检查：\n1. 所有括号必须成对出现\n2. 命令参数不能为空\n3. 不要使用中文字符\n4. 确保命令格式正确\n\n严格按照系统提示的JSON格式输出。`;
      }

      contentParts.push({
        type: 'text',
        text: promptText,
      });
    } else {
      // 构建提示文本，包含重试信息
      let promptText = `题目文本：${text}\n\n请根据题目文本生成精确的GeoGebra命令。严格按照系统提示的JSON格式输出。`;

      if (body.retryCount && body.retryCount > 0 && previousError) {
        promptText = `题目文本：${text}\n\n之前的生成结果有语法错误，请修正后重新生成。\n\n错误信息：${previousError}\n\n请重新生成正确的GeoGebra命令。注意检查：\n1. 所有括号必须成对出现\n2. 命令参数不能为空\n3. 不要使用中文字符\n4. 确保命令格式正确\n\n严格按照系统提示的JSON格式输出。`;
      }

      contentParts.push({
        type: 'text',
        text: promptText,
      });
    }

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: GENERATE_SYSTEM_PROMPT },
      { role: 'user', content: contentParts },
    ];

    const stream = await streamOpenRouter(messages, {
      temperature: 0.1,
      maxTokens: 4096,
    });

    if (isDev) {
      console.log(
        `[generate-graphic][${new Date().toISOString()}] 开始流式响应, 耗时:`,
        Date.now() - requestStart,
        'ms'
      );
    }

    // 返回 SSE 流，携带限流响应头（从 middleware 传递的请求头中读取）
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    };
    const rateLimitLimit = req.headers.get('X-RateLimit-Limit');
    const rateLimitRemaining = req.headers.get('X-RateLimit-Remaining');
    const rateLimitReset = req.headers.get('X-RateLimit-Reset');
    if (rateLimitLimit) headers['X-RateLimit-Limit'] = rateLimitLimit;
    if (rateLimitRemaining) headers['X-RateLimit-Remaining'] = rateLimitRemaining;
    if (rateLimitReset) headers['X-RateLimit-Reset'] = rateLimitReset;

    return new Response(stream, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : '服务器内部错误';
    console.error(
      `[generate-graphic][${new Date().toISOString()}] 错误:`,
      message
    );
    return new Response(
      JSON.stringify({ success: false, error: { code: 'GENERATION_FAILED', message } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
