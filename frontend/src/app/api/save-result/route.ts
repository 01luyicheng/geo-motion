import { NextRequest } from 'next/server';
import { generateId } from '@/lib/utils';
import type { AnalysisResult } from '@/types';
import { saveResultRequestSchema, safeParseJson } from '@/lib/validation';
import {
  getResultStore,
  createStoredEntry,
  checkStoreAvailability,
} from '@/app/api/lib/resultStore';

export async function POST(req: NextRequest) {
  // 检查存储可用性（环境检测 + 容量限制）
  const storeCheck = checkStoreAvailability();
  if (!storeCheck.available) {
    return storeCheck.response!;
  }

  try {
    // 使用 zod 验证请求体
    const parseResult = await safeParseJson(req, saveResultRequestSchema);
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

    const id = generateId();
    const store = getResultStore();
    const entry = createStoredEntry(body.result);

    store.set(id, entry);

    console.log(
      `[save-result] 已保存结果 id=${id}, 当前存储量=${store.size}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: { id },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '服务器内部错误';
    console.error('[save-result] 错误:', message);
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'SERVER_ERROR', message },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
