import { NextRequest } from 'next/server';
import { generateId } from '@/lib/utils';
import type { AnalysisResult } from '@/types';
import { saveResultRequestSchema, safeParseJson } from '@/lib/validation';
import {
  getResultStore,
  createStoredEntry,
  checkStoreAvailability,
} from '@/app/api/lib/resultStore';

const isDev = process.env.NODE_ENV === 'development';

// 请求体大小限制：10MB
const MAX_BODY_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  // 检查请求体大小
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'PAYLOAD_TOO_LARGE', message: '请求体超过 10MB 限制' },
      }),
      { status: 413, headers: { 'Content-Type': 'application/json' } }
    );
  }

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

    const store = getResultStore();
    let id = generateId();
    while (store.has(id)) {
      id = generateId();
    }
    const entry = createStoredEntry(body.result);

    const saved = store.set(id, entry);
    if (!saved) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'CAPACITY_EXCEEDED', message: '存储容量已满，请稍后重试' },
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (isDev) {
      console.log(
        `[save-result] 已保存结果 id=${id}, 当前存储量=${store.size}`
      );
    }

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
