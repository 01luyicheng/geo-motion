import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { middleware } from './middleware';
import { NextRequest } from 'next/server';
import { resetStore } from '@/lib/ratelimit';

function createRequest(init: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  ip?: string;
}): NextRequest {
  const url = init.url ?? 'http://localhost:3000/api/test';
  const headers = new Headers(init.headers);
  return {
    url,
    method: init.method ?? 'GET',
    headers,
    nextUrl: new URL(url),
    ip: init.ip,
  } as unknown as NextRequest;
}

describe('middleware', () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. CORS 配置 ───────────────────────────────────────────

  describe('CORS', () => {
    it('允许的来源设置正确的 Access-Control-Allow-Origin', () => {
      const req = createRequest({
        url: 'http://localhost:3000/api/analyze',
        headers: { origin: 'http://localhost:3000' },
      });
      const res = middleware(req);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    });

    it('不允许的来源对 API 路由返回 403', async () => {
      const req = createRequest({
        url: 'http://localhost:3000/api/analyze',
        headers: { origin: 'https://evil.com' },
      });
      const res = middleware(req);
      expect(res.status).toBe(403);
      expect(res.headers.get('Content-Type')).toBe('application/json');
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('非 API 路由对不允许的来源不返回 403（只设置 CORS 头）', () => {
      const req = createRequest({
        url: 'http://localhost:3000/',
        headers: { origin: 'https://evil.com' },
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
      // 非 API 路由：isAllowedOrigin=false，使用 ALLOWED_ORIGINS[0]
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    });

    it('OPTIONS 预检请求返回 204', () => {
      const req = createRequest({
        url: 'http://localhost:3000/api/analyze',
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' },
      });
      const res = middleware(req);
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
      expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
      expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
    });

    it('无 origin 时设置 Access-Control-Allow-Origin 为第一个允许的来源', () => {
      const req = createRequest({
        url: 'http://localhost:3000/',
      });
      const res = middleware(req);
      // 无 origin 时，isAllowedOrigin=false，使用 ALLOWED_ORIGINS[0]
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    });
  });

  // ── 2. CSP 策略 ────────────────────────────────────────────

  describe('CSP / Security Headers', () => {
    it('设置 Content-Security-Policy', () => {
      const req = createRequest({ url: 'http://localhost:3000/' });
      const res = middleware(req);
      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-eval'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("img-src 'self' data: blob:");
      expect(csp).toContain("connect-src 'self' https://openrouter.ai");
      expect(csp).toContain("object-src 'none'");
    });

    it('设置其他安全头', () => {
      const req = createRequest({ url: 'http://localhost:3000/' });
      const res = middleware(req);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
    });
  });

  // ── 3. 请求体大小限制 ──────────────────────────────────────

  describe('请求体大小限制', () => {
    it('content-length 超过 10MB 返回 413', async () => {
      const req = createRequest({
        url: 'http://localhost:3000/api/analyze',
        headers: {
          origin: 'http://localhost:3000',
          'content-length': String(10 * 1024 * 1024 + 1),
        },
      });
      const res = middleware(req);
      expect(res.status).toBe(413);
      expect(res.headers.get('Content-Type')).toBe('application/json');
      const body = await res.json();
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('content-length 在限制内允许通过', () => {
      const req = createRequest({
        url: 'http://localhost:3000/api/analyze',
        headers: {
          origin: 'http://localhost:3000',
          'content-length': String(10 * 1024 * 1024),
        },
      });
      const res = middleware(req);
      expect(res.status).not.toBe(413);
    });

    it('无 content-length 时不限制', () => {
      const req = createRequest({
        url: 'http://localhost:3000/api/analyze',
        headers: { origin: 'http://localhost:3000' },
      });
      const res = middleware(req);
      expect(res.status).not.toBe(413);
    });

    it('content-length 为非法值时不限制', () => {
      const req = createRequest({
        url: 'http://localhost:3000/api/analyze',
        headers: {
          origin: 'http://localhost:3000',
          'content-length': 'not-a-number',
        },
      });
      const res = middleware(req);
      expect(res.status).not.toBe(413);
    });
  });

  // ── 4. 速率限制集成 ────────────────────────────────────────

  describe('速率限制', () => {
    it('API 路由添加速率限制头', () => {
      const req = createRequest({
        url: 'http://localhost:3000/api/analyze',
        headers: { origin: 'http://localhost:3000' },
        ip: '10.0.0.1',
      });
      const res = middleware(req);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
      expect(res.headers.get('X-RateLimit-Reset')).toBeDefined();
    });

    it('超过速率限制后返回 429', () => {
      const url = 'http://localhost:3000/api/analyze';
      const headers = { origin: 'http://localhost:3000' };
      const ip = '10.0.0.1';
      // 发送 11 次请求（限制为 10 次/分钟）
      for (let i = 0; i < 10; i++) {
        const req = createRequest({ url, headers, ip });
        const res = middleware(req);
        expect(res.status).not.toBe(429);
      }
      const req = createRequest({ url, headers, ip });
      const res = middleware(req);
      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBeDefined();
    });

    it('GET /api/result/[id] 使用独立宽松限制', () => {
      const url = 'http://localhost:3000/api/result/abc123';
      const headers = { origin: 'http://localhost:3000' };
      const ip = '10.0.0.1';
      // 发送 61 次请求（限制为 60 次/分钟）
      for (let i = 0; i < 60; i++) {
        const req = createRequest({ url, headers, ip, method: 'GET' });
        const res = middleware(req);
        expect(res.status).not.toBe(429);
      }
      const req = createRequest({ url, headers, ip, method: 'GET' });
      const res = middleware(req);
      expect(res.status).toBe(429);
    });

    it('OPTIONS 预检请求也带速率限制头', () => {
      const req = createRequest({
        url: 'http://localhost:3000/api/analyze',
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' },
        ip: '10.0.0.1',
      });
      const res = middleware(req);
      expect(res.status).toBe(204);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
    });

    it('不同 IP 独立计数', () => {
      const url = 'http://localhost:3000/api/analyze';
      const headers = { origin: 'http://localhost:3000' };
      // IP-A 用尽配额
      for (let i = 0; i < 10; i++) {
        middleware(createRequest({ url, headers, ip: '10.0.0.1' }));
      }
      expect(middleware(createRequest({ url, headers, ip: '10.0.0.1' })).status).toBe(429);
      // IP-B 仍可请求
      expect(middleware(createRequest({ url, headers, ip: '10.0.0.2' })).status).not.toBe(429);
    });

    it('非 API 路由不添加速率限制头', () => {
      const req = createRequest({
        url: 'http://localhost:3000/',
        headers: { origin: 'http://localhost:3000' },
        ip: '10.0.0.1',
      });
      const res = middleware(req);
      expect(res.headers.get('X-RateLimit-Limit')).toBeNull();
    });
  });

  // ── 5. 边界情况 ────────────────────────────────────────────

  describe('边界情况', () => {
    it('matcher 配置匹配 API 路由', () => {
      const req = createRequest({
        url: 'http://localhost:3000/api/any-path',
        headers: { origin: 'http://localhost:3000' },
      });
      const res = middleware(req);
      // 只要进入 API 逻辑就会带 CORS 和限流头
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    });

    it('https localhost 也是允许来源', () => {
      const req = createRequest({
        url: 'https://localhost:3000/api/analyze',
        headers: { origin: 'https://localhost:3000' },
      });
      const res = middleware(req);
      expect(res.status).not.toBe(403);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost:3000');
    });
  });
});
