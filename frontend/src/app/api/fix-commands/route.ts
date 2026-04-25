import { NextRequest } from 'next/server';
import {
  callOpenRouter,
  FIX_COMMANDS_SYSTEM_PROMPT,
  parseVlmJson,
  type OpenRouterMessage,
  sanitizeInput,
} from '@/lib/openrouter';
import { fixCommandsRequestSchema, safeParseJson, fixCommandsOutputSchema } from '@/lib/validation';

const isDev = process.env.NODE_ENV === 'development';

// 允许路由最多执行 300 秒
export const maxDuration = 300;

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
    // 使用 zod 验证请求体
    const parseResult = await safeParseJson(req, fixCommandsRequestSchema);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: parseResult.error,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = parseResult.data;

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

    // 清理输入，防止 prompt 注入
    const originalCommands = sanitizeInput(body.originalCommands);
    const goal = body.goal ? sanitizeInput(body.goal) : undefined;
    const conditions = body.conditions?.map((c) => sanitizeInput(c));

    // 构建错误信息文本
    const errorDetails = body.errors
      .map((e, i) => `${i + 1}. 命令 "${sanitizeInput(e.command)}" (第${e.index + 1}行): ${sanitizeInput(e.error)}`)
      .join('\n');

    // 构建用户提示词
    let userPrompt = `以下 GeoGebra 命令执行时出现错误，请修复：\n\n【原始命令】\n${originalCommands}\n\n【错误信息】\n${errorDetails}\n\n【修复要求】\n1. 分析每条失败命令的原因（语法错误、对象不存在、参数错误等）\n2. 修复所有失败的命令，保持其他正确命令不变\n3. 确保修复后的命令能正确创建几何图形\n4. 返回完整的修复后命令（不只是修复的部分）`;

    // 如果有题目条件，添加到提示词中
    if (conditions && conditions.length > 0) {
      userPrompt += `\n\n【题目条件】\n${conditions.join('\n')}`;
    }

    // 如果有求解目标，添加到提示词中
    if (goal) {
      userPrompt += `\n\n【求解目标】\n${goal}`;
    }

    // 添加重试提示
    if (retryCount > 0) {
      userPrompt += `\n\n【注意】这是第 ${retryCount + 1} 次尝试修复，请仔细检查命令的正确性。`;
    }

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: FIX_COMMANDS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    if (isDev) {
      console.log(
        `[fix-commands][${new Date().toISOString()}] 开始修复命令, 失败命令数:`,
        body.errors.length,
        '重试次数:',
        retryCount
      );
    }

    const response = await callOpenRouter(messages, {
      temperature: 0.1,
      maxTokens: 4096,
    });

    if (isDev) {
      console.log(
        `[fix-commands][${new Date().toISOString()}] 收到修复响应, 耗时:`,
        Date.now() - requestStart,
        'ms'
      );
    }

    // 解析响应
    const parsed = parseVlmJson(response, fixCommandsOutputSchema);

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

    if (isDev) {
      console.log(
        `[fix-commands][${new Date().toISOString()}] 修复完成, 总耗时:`,
        Date.now() - requestStart,
        'ms'
      );
    }

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
