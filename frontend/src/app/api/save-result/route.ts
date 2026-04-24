import { NextRequest } from 'next/server';
import { generateId } from '@/lib/utils';
import type { AnalysisResult } from '@/types';
import { saveResultRequestSchema, safeParseJson } from '@/lib/validation';
import {
  getClientIp,
  checkRateLimit,
  createRateLimitResponse,
  ROUTE_LIMITS,
} from '@/lib/ratelimit';

// 7 天过期时间（毫秒）
const EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredEntry {
  result: AnalysisResult;
  expiresAt: number;
}

// 内存存储（Map），key 为分享 ID
const memoryStore = new Map<string, StoredEntry>();

// 定期清理过期数据（每 10 分钟）
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt < now) {
      memoryStore.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[save-result] 清理 ${cleaned} 条过期数据，剩余 ${memoryStore.size} 条`);
  }
}, 10 * 60 * 1000);

export async function POST(req: NextRequest) {
  // ── 双重保护：路由层速率限制 ──
  const ip = getClientIp(req);
  const route = '/api/save-result';
  const limitResult = checkRateLimit(ip, route, ROUTE_LIMITS[route]);
  if (!limitResult.allowed) {
    return createRateLimitResponse(limitResult);
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
    const entry: StoredEntry = {
      result: body.result,
      expiresAt: Date.now() + EXPIRE_MS,
    };

    memoryStore.set(id, entry);

    console.log(
      `[save-result] 已保存结果 id=${id}, 当前存储量=${memoryStore.size}`
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

// 导出存储供 result/[id]/route.ts 使用
export { memoryStore };
