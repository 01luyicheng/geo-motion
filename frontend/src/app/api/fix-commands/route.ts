import { NextRequest } from 'next/server';
import {
  callOpenRouter,
  FIX_COMMANDS_SYSTEM_PROMPT,
  parseVlmJson,
  type OpenRouterMessage,
} from '@/lib/openrouter';

// 允许路由最多执行 300 秒
export const maxDuration = 300;

/** 修复请求体 */
interface FixCommandsRequest {
  /** 原始 GeoGebra 命令 */
  originalCommands: string;
  /** 执行失败的命令及错误信息 */
  errors: Array<{
    command: string;
    error: string;
    index: number;
  }>;
  /** 题目条件（可选，用于上下文） */
  conditions?: string[];
  /** 求解目标（可选，用于上下文） */
  goal?: string;
  /** 重试次数 */
  retryCount?: number;
}

/** 修复响应 */
interface FixCommandsResponse {
  success: boolean;
  geogebra: string;
  fixedCommands?: string[];
  message?: string;
}

export async function POST(req: NextRequest) {
  const requestStart = Date.now();

  try {
    const body = (await req.json()) as FixCommandsRequest;

    // 验证请求参数
    if (!body.originalCommands) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INVALID_REQUEST', message: '未提供原始命令' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!body.errors || body.errors.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INVALID_REQUEST', message: '未提供错误信息' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const retryCount = body.retryCount ?? 0;
    const maxRetries = 3;

    if (retryCount >= maxRetries) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'MAX_RETRIES_EXCEEDED',
            message: `已达到最大重试次数 (${maxRetries})，无法修复命令`,
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 构建错误信息文本
    const errorDetails = body.errors
      .map((e, i) => `${i + 1}. 命令 "${e.command}" (第${e.index + 1}行): ${e.error}`)
      .join('\n');

    // 构建用户提示词
    let userPrompt = `以下 GeoGebra 命令执行时出现错误，请修复：

【原始命令】
${body.originalCommands}

【错误信息】
${errorDetails}

【修复要求】
1. 分析每条失败命令的原因（语法错误、对象不存在、参数错误等）
2. 修复所有失败的命令，保持其他正确命令不变
3. 确保修复后的命令能正确创建几何图形
4. 返回完整的修复后命令（不只是修复的部分）`;

    // 如果有题目条件，添加到提示词中
    if (body.conditions && body.conditions.length > 0) {
      userPrompt += `\n\n【题目条件】\n${body.conditions.join('\n')}`;
    }

    // 如果有求解目标，添加到提示词中
    if (body.goal) {
      userPrompt += `\n\n【求解目标】\n${body.goal}`;
    }

    // 添加重试提示
    if (retryCount > 0) {
      userPrompt += `\n\n【注意】这是第 ${retryCount + 1} 次尝试修复，请仔细检查命令的正确性。`;
    }

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: FIX_COMMANDS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    console.log(
      `[fix-commands][${new Date().toISOString()}] 开始修复命令, 失败命令数:`,
      body.errors.length,
      '重试次数:',
      retryCount
    );

    const response = await callOpenRouter(messages, {
      temperature: 0.1,
      maxTokens: 4096,
    });

    console.log(
      `[fix-commands][${new Date().toISOString()}] 收到修复响应, 耗时:`,
      Date.now() - requestStart,
      'ms'
    );

    // 解析响应
    const parsed = parseVlmJson<{ geogebra: string }>(response);

    if (!parsed.geogebra) {
      throw new Error('修复后的命令为空');
    }

    // 提取修复的命令列表
    const fixedCommands = parsed.geogebra
      .split('\n')
      .filter((line) => line.trim());

    const result: FixCommandsResponse = {
      success: true,
      geogebra: parsed.geogebra,
      fixedCommands,
      message: `成功修复 ${body.errors.length} 条命令`,
    };

    console.log(
      `[fix-commands][${new Date().toISOString()}] 修复完成, 总耗时:`,
      Date.now() - requestStart,
      'ms'
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '服务器内部错误';
    console.error(`[fix-commands][${new Date().toISOString()}] 错误:`, message);
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'FIX_ERROR', message },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
