import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';
import { resetStore } from '@/lib/ratelimit';

// 模拟 openrouter 模块
vi.mock('@/lib/openrouter', () => ({
  streamOpenRouter: vi.fn(async () => {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: test\n\n'));
        controller.close();
      },
    });
  }),
  ANALYZE_SYSTEM_PROMPT: 'mock-system-prompt',
  sanitizeInput: vi.fn((input: string) => input),
}));

// 模拟 validation 模块
vi.mock('@/lib/validation', async () => {
  const actual = await vi.importActual<typeof import('@/lib/validation')>('@/lib/validation');
  return {
    ...actual,
    safeParseJson: vi.fn(async (req: Request, schema: unknown) => {
      try {
        const body = await req.json();
        // 简单模拟验证逻辑
        if (!body.image) {
          return {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: '图片不能为空' },
          };
        }
        if (!body.image.startsWith('data:image/')) {
          return {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: '图片格式错误，需为 data URI' },
          };
        }
        if (body.image.length > 13_000_000) {
          return {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: '图片大小超过 10MB 限制' },
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

describe('POST /api/analyze', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    resetStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('未提供图片时返回 400', async () => {
    const req = new Request('http://localhost/api/analyze', {
      method: 'POST',
      body: JSON.stringify({}),
    }) as unknown as import('next/server').NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('图片过大时返回 400', async () => {
    const largeImage = 'data:image/png;base64,' + 'a'.repeat(14_000_000);
    const req = new Request('http://localhost/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ image: largeImage }),
    }) as unknown as import('next/server').NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('图片格式错误时返回 400', async () => {
    const req = new Request('http://localhost/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ image: 'not-a-data-uri' }),
    }) as unknown as import('next/server').NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('正确请求返回 SSE 流', async () => {
    const image = 'data:image/png;base64,abc123';
    const req = new Request('http://localhost/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ image }),
    }) as unknown as import('next/server').NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('包含重试信息时构建修正提示', async () => {
    const image = 'data:image/png;base64,abc123';
    const req = new Request('http://localhost/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ image, retryCount: 1, previousError: 'syntax error' }),
    }) as unknown as import('next/server').NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('内部异常时返回 500', async () => {
    const { streamOpenRouter } = await import('@/lib/openrouter');
    vi.mocked(streamOpenRouter).mockImplementationOnce(async () => {
      throw new Error('mock error');
    });

    const image = 'data:image/png;base64,abc123';
    const req = new Request('http://localhost/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ image }),
    }) as unknown as import('next/server').NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VLM_ERROR');
  });
});
