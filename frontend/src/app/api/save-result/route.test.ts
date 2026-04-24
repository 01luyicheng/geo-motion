import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, memoryStore } from './route';

// 模拟 validation 模块
vi.mock('@/lib/validation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/validation')>('@/lib/validation');
  return {
    ...actual,
    safeParseJson: vi.fn(async (req: Request, schema: unknown) => {
      try {
        const body = await req.json();
        if (!body.result || typeof body.result !== 'object') {
          return {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: '未提供分析结果' },
          };
        }
        return { success: true, data: body };
      } catch {
        return {
          success: false,
          error: { code: 'INVALID_JSON', message: '请求体不是有效的 JSON' },
        };
      }
    }),
  };
});

describe('POST /api/save-result', () => {
  beforeEach(() => {
    memoryStore.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('未提供结果时返回 400', async () => {
    const req = new Request('http://localhost/api/save-result', {
      method: 'POST',
      body: JSON.stringify({}),
    }) as unknown as import('next/server').NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('保存结果后返回唯一 ID', async () => {
    const result = {
      id: 'test-id',
      geogebra: 'A=(1,1)',
      conditions: ['c1'],
      goal: 'goal',
      solution: [],
      createdAt: new Date().toISOString(),
    };

    const req = new Request('http://localhost/api/save-result', {
      method: 'POST',
      body: JSON.stringify({ result }),
    }) as unknown as import('next/server').NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(typeof body.data.id).toBe('string');
    expect(memoryStore.has(body.data.id)).toBe(true);
  });

  it('无效 JSON 时返回 400（由 safeParseJson 处理）', async () => {
    const req = new Request('http://localhost/api/save-result', {
      method: 'POST',
      body: 'not-json',
    }) as unknown as import('next/server').NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_JSON');
  });
});
