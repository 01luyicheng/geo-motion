import { NextRequest } from 'next/server';
import {
  streamOpenRouter,
  GENERATE_SYSTEM_PROMPT,
  type OpenRouterMessage,
  type OpenRouterContentPart,
} from '@/lib/openrouter';

// 允许路由最多执行 300 秒（AI 响应可能较慢）
export const maxDuration = 300;

// 10MB 的 base64 编码长度限制（base64 编码会增加约 33%）
const MAX_BASE64_LENGTH = 13_000_000;

export async function POST(req: NextRequest) {
  const requestStart = Date.now();
  
  try {
    const body = await req.json() as { 
      text?: string; 
      sketch?: string;
      retryCount?: number;
      previousError?: string;
    };

    if (!body.text || body.text.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'INVALID_REQUEST', message: '请提供题目文本' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 构建消息内容
    const contentParts: OpenRouterContentPart[] = [];

    // 如果有草图，先附上图片
    if (body.sketch && body.sketch.startsWith('data:image/')) {
      // 校验草图 base64 大小限制（约 10MB）
      if (body.sketch.length > MAX_BASE64_LENGTH) {
        return new Response(
          JSON.stringify({ success: false, error: { code: 'SKETCH_TOO_LARGE', message: '草图大小超过 10MB 限制' } }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      contentParts.push({
        type: 'image_url',
        image_url: { url: body.sketch },
      });
      
      // 构建提示文本，包含重试信息
      let promptText = `题目文本：${body.text}\n\n以上是手绘草图，请结合题目文本和草图，生成精确的GeoGebra命令。严格按照系统提示的JSON格式输出。`;
      
      if (body.retryCount && body.retryCount > 0 && body.previousError) {
        promptText = `题目文本：${body.text}\n\n之前的生成结果有语法错误，请修正后重新生成。\n\n错误信息：${body.previousError}\n\n以上是手绘草图，请结合题目文本和草图，生成正确的GeoGebra命令。注意检查：\n1. 所有括号必须成对出现\n2. 命令参数不能为空\n3. 不要使用中文字符\n4. 确保命令格式正确\n\n严格按照系统提示的JSON格式输出。`;
      }
      
      contentParts.push({
        type: 'text',
        text: promptText,
      });
    } else {
      // 构建提示文本，包含重试信息
      let promptText = `题目文本：${body.text}\n\n请根据题目文本生成精确的GeoGebra命令。严格按照系统提示的JSON格式输出。`;
      
      if (body.retryCount && body.retryCount > 0 && body.previousError) {
        promptText = `题目文本：${body.text}\n\n之前的生成结果有语法错误，请修正后重新生成。\n\n错误信息：${body.previousError}\n\n请重新生成正确的GeoGebra命令。注意检查：\n1. 所有括号必须成对出现\n2. 命令参数不能为空\n3. 不要使用中文字符\n4. 确保命令格式正确\n\n严格按照系统提示的JSON格式输出。`;
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

    console.log(
      `[generate-graphic][${new Date().toISOString()}] 开始流式响应, 耗时:`,
      Date.now() - requestStart,
      'ms'
    );

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