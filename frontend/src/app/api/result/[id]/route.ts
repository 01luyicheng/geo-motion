import { NextRequest } from 'next/server';
import { memoryStore } from '../../save-result/route';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'INVALID_ID', message: '未提供结果 ID' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const entry = memoryStore.get(id);

    if (!entry) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'NOT_FOUND', message: '分析结果不存在或已过期' },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 检查是否过期
    if (entry.expiresAt < Date.now()) {
      memoryStore.delete(id);
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'EXPIRED', message: '分析结果已过期' },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: entry.result,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '服务器内部错误';
    console.error('[result] 错误:', message);
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'SERVER_ERROR', message },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
