import { NextRequest } from 'next/server';
import {
  streamOpenRouter,
  parseVlmJson,
  ANALYZE_SYSTEM_PROMPT,
  type OpenRouterMessage,
} from '@/lib/openrouter';

// 允许路由最多执行 300 秒（AI 响应可能较慢）
export const maxDuration = 300;

// 10MB 的 base64 编码长度限制（base64 编码会增加约 33%）
const MAX_BASE64_LENGTH = 13_000_000;

export async function POST(req: NextRequest) {
  const requestStart = Date.now();
  
  try {
    const body = await req.json() as { image?: string };

    if (!body.image) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'INVALID_IMAGE', message: '未提供图片' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 校验 base64 图片大小限制（约 10MB）
    if (body.image.length > MAX_BASE64_LENGTH) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'IMAGE_TOO_LARGE', message: '图片大小超过 10MB 限制' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 基本格式检查
    if (!body.image.startsWith('data:image/')) {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'INVALID_IMAGE', message: '图片格式错误，需为 data URI' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
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
            text: '请识别这道几何题，只生成GeoGebra命令重建图形。严格按照系统提示的JSON格式输出，solution保持空数组。',
          },
        ],
      },
    ];

    const stream = await streamOpenRouter(messages, {
      temperature: 0.1,
      maxTokens: 4096,
    });

    console.log(
      `[analyze][${new Date().toISOString()}] 开始流式响应, 耗时:`,
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
      `[analyze][${new Date().toISOString()}] 错误:`,
      message
    );
    return new Response(
      JSON.stringify({ success: false, error: { code: 'VLM_ERROR', message } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}