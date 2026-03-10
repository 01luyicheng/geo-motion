import { NextRequest, NextResponse } from 'next/server';
import {
  callOpenRouter,
  parseVlmJson,
  ANALYZE_SYSTEM_PROMPT,
  type OpenRouterMessage,
} from '@/lib/openrouter';
import type { AnalysisResult, ApiResponse } from '@/types';

// 10MB 的 base64 编码长度限制（base64 编码会增加约 33%）
const MAX_BASE64_LENGTH = 13_000_000;

interface VlmAnalyzeOutput {
  geogebra: string;
  conditions: string[];
  goal: string;
  solution: string[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { image?: string };

    if (!body.image) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'INVALID_IMAGE', message: '未提供图片' } },
        { status: 400 }
      );
    }

    // 校验 base64 图片大小限制（约 10MB）
    if (body.image.length > MAX_BASE64_LENGTH) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'IMAGE_TOO_LARGE', message: '图片大小超过 10MB 限制' } },
        { status: 400 }
      );
    }

    // 基本格式检查
    if (!body.image.startsWith('data:image/')) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'INVALID_IMAGE', message: '图片格式错误，需为 data URI' } },
        { status: 400 }
      );
    }

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: ANALYZE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: body.image, detail: 'high' },
          },
          {
            type: 'text',
            text: '请分析这道几何题，生成GeoGebra命令重建图形，并给出解题思路。严格按照系统提示的JSON格式输出。',
          },
        ],
      },
    ];

    const rawContent = await callOpenRouter(messages, {
      temperature: 0.1,
      maxTokens: 4096,
      responseFormat: { type: 'json_object' },
    });

    let parsed: VlmAnalyzeOutput;
    try {
      parsed = parseVlmJson<VlmAnalyzeOutput>(rawContent);
    } catch {
      console.error('[analyze] JSON 解析失败，原始内容:', rawContent);
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'VLM_ERROR', message: 'AI 返回格式错误，请重试' } },
        { status: 500 }
      );
    }

    if (!parsed.geogebra || !parsed.conditions || !parsed.goal) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: { code: 'NO_GEOMETRY_FOUND', message: '未能从图片中识别几何图形' } },
        { status: 400 }
      );
    }

    const result: AnalysisResult = {
      id: `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      geogebra: parsed.geogebra,
      conditions: parsed.conditions,
      goal: parsed.goal,
      solution: parsed.solution ?? [],
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json<ApiResponse<AnalysisResult>>({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : '服务器内部错误';
    console.error('[analyze] 错误:', message);
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: { code: 'VLM_ERROR', message } },
      { status: 500 }
    );
  }
}
