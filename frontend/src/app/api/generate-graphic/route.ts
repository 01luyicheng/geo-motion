import { NextRequest, NextResponse } from 'next/server';
import {
  callOpenRouter,
  parseVlmJson,
  GENERATE_SYSTEM_PROMPT,
  type OpenRouterMessage,
  type OpenRouterContentPart,
} from '@/lib/openrouter';
import type { GraphicResult, ApiResponse } from '@/types';

// 10MB 的 base64 编码长度限制（base64 编码会增加约 33%）
const MAX_BASE64_LENGTH = 13_000_000;

interface VlmGenerateOutput {
  geogebra: string;
  conditions: string[];
  goal: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { text?: string; sketch?: string };

    if (!body.text || body.text.trim().length === 0) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'INVALID_REQUEST', message: '请提供题目文本' } },
        { status: 400 }
      );
    }

    // 构建消息内容
    const contentParts: OpenRouterContentPart[] = [];

    // 如果有草图，先附上图片
    if (body.sketch && body.sketch.startsWith('data:image/')) {
      // 校验草图 base64 大小限制（约 10MB）
      if (body.sketch.length > MAX_BASE64_LENGTH) {
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: { code: 'SKETCH_TOO_LARGE', message: '草图大小超过 10MB 限制' } },
          { status: 400 }
        );
      }
      contentParts.push({
        type: 'image_url',
        image_url: { url: body.sketch },
      });
      contentParts.push({
        type: 'text',
        text: `题目文本：${body.text}\n\n以上是手绘草图，请结合题目文本和草图，生成精确的GeoGebra命令。严格按照系统提示的JSON格式输出。`,
      });
    } else {
      contentParts.push({
        type: 'text',
        text: `题目文本：${body.text}\n\n请根据题目文本生成精确的GeoGebra命令。严格按照系统提示的JSON格式输出。`,
      });
    }

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: GENERATE_SYSTEM_PROMPT },
      { role: 'user', content: contentParts },
    ];

    const rawContent = await callOpenRouter(messages, {
      temperature: 0.1,
      maxTokens: 4096,
    });

    let parsed: VlmGenerateOutput;
    try {
      parsed = parseVlmJson<VlmGenerateOutput>(rawContent);
    } catch {
      console.error('[generate-graphic] JSON 解析失败，原始内容:', rawContent);
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'GENERATION_FAILED', message: 'AI 返回格式错误，请重试' } },
        { status: 500 }
      );
    }

    if (!parsed.geogebra) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'GENERATION_FAILED', message: '图形生成失败，请检查题目描述' } },
        { status: 400 }
      );
    }

    const result: GraphicResult = {
      id: `graphic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      geogebra: parsed.geogebra,
      format: 'svg',
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json<ApiResponse<GraphicResult>>({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : '服务器内部错误';
    console.error('[generate-graphic] 错误:', message);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: { code: 'GENERATION_FAILED', message } },
      { status: 500 }
    );
  }
}
