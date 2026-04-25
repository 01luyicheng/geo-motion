import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getClientIp,
  matchRouteConfig,
  checkRateLimit,
  createRateLimitResponse,
  addRateLimitHeaders,
  cleanupExpiredEntries,
  getStoreStats,
  resetStore,
  ROUTE_LIMITS,
  DEFAULT_LIMIT,
} from './ratelimit';
import { NextRequest, NextResponse } from 'next/server';

describe('getClientIp', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('edge 模式（默认）：优先使用 request.ip，忽略 x-forwarded-for', () => {
    const req = {
      headers: new Map([['x-forwarded-for', '1.2.3.4, 5.6.7.8']]),
      ip: '10.0.0.1',
    } as unknown as NextRequest;
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  it('edge 模式（默认）：无 request.ip 时返回 unknown，忽略 header', () => {
    const req = {
      headers: new Map([['x-forwarded-for', '1.2.3.4']]),
    } as unknown as NextRequest;
    expect(getClientIp(req)).toBe('unknown');
  });

  it('dev 模式：从 x-forwarded-for 获取第一个 IP', () => {
    process.env.RATELIMIT_TRUST_LEVEL = 'dev';
    const req = {
      headers: new Map([['x-forwarded-for', '1.2.3.4, 5.6.7.8']]),
    } as unknown as NextRequest;
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('dev 模式：从 x-real-ip 获取 IP', () => {
    process.env.RATELIMIT_TRUST_LEVEL = 'dev';
    const req = {
      headers: new Map([['x-real-ip', '9.8.7.6']]),
    } as unknown as NextRequest;
    expect(getClientIp(req)).toBe('9.8.7.6');
  });

  it('proxy 模式：优先 request.ip，其次 x-forwarded-for', () => {
    process.env.RATELIMIT_TRUST_LEVEL = 'proxy';
    const reqWithIp = {
      headers: new Map([['x-forwarded-for', '1.2.3.4']]),
      ip: '10.0.0.1',
    } as unknown as NextRequest;
    expect(getClientIp(reqWithIp)).toBe('10.0.0.1');

    const reqWithoutIp = {
      headers: new Map([['x-forwarded-for', '1.2.3.4']]),
    } as unknown as NextRequest;
    expect(getClientIp(reqWithoutIp)).toBe('1.2.3.4');
  });

  it('无 IP 时返回 unknown', () => {
    const req = {
      headers: new Map(),
    } as unknown as NextRequest;
    expect(getClientIp(req)).toBe('unknown');
  });
});

describe('matchRouteConfig', () => {
  it('精确匹配路由', () => {
    expect(matchRouteConfig('/api/analyze')).toEqual(ROUTE_LIMITS['/api/analyze']);
    expect(matchRouteConfig('/api/save-result')).toEqual(ROUTE_LIMITS['/api/save-result']);
  });

  it('前缀匹配子路径', () => {
    expect(matchRouteConfig('/api/analyze/sub')).toEqual(ROUTE_LIMITS['/api/analyze']);
    expect(matchRouteConfig('/api/save-result/123')).toEqual(ROUTE_LIMITS['/api/save-result']);
  });

  it('未配置路由返回 undefined', () => {
    expect(matchRouteConfig('/api/unknown')).toBeUndefined();
    expect(matchRouteConfig('/some/other/path')).toBeUndefined();
  });

  it('选择最长前缀匹配', () => {
    // 假设有更具体的路由配置时应该匹配更长的
    // 当前配置下 /api/analyze/xxx 应该匹配 /api/analyze
    expect(matchRouteConfig('/api/analyze/v2')).toEqual(ROUTE_LIMITS['/api/analyze']);
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('首次请求允许通过', () => {
    const result = checkRateLimit('1.2.3.4', '/api/analyze', { windowMs: 60000, maxRequests: 5 });
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
    expect(result.resetTime).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('在限制内允许多次请求', () => {
    const config = { windowMs: 60000, maxRequests: 3 };
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit('1.2.3.4', '/api/test', config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3 - i - 1);
    }
  });

  it('超过限制后拒绝请求', () => {
    const config = { windowMs: 60000, maxRequests: 2 };
    checkRateLimit('1.2.3.4', '/api/test', config);
    checkRateLimit('1.2.3.4', '/api/test', config);
    const result = checkRateLimit('1.2.3.4', '/api/test', config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('不同 IP 独立计数', () => {
    const config = { windowMs: 60000, maxRequests: 1 };
    const result1 = checkRateLimit('1.2.3.4', '/api/test', config);
    const result2 = checkRateLimit('5.6.7.8', '/api/test', config);
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
  });

  it('不同路由独立计数', () => {
    const config = { windowMs: 60000, maxRequests: 1 };
    checkRateLimit('1.2.3.4', '/api/route-a', config);
    const result = checkRateLimit('1.2.3.4', '/api/route-b', config);
    expect(result.allowed).toBe(true);
  });

  it('窗口过期后重置计数', () => {
    const config = { windowMs: 1000, maxRequests: 1 };
    checkRateLimit('1.2.3.4', '/api/test', config);
    vi.advanceTimersByTime(1001);
    const result = checkRateLimit('1.2.3.4', '/api/test', config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('触发自动清理', () => {
    const config = { windowMs: 100, maxRequests: 1 };
    checkRateLimit('1.2.3.4', '/api/test', config);
    vi.advanceTimersByTime(6 * 60 * 1000); // 超过 5 分钟清理间隔
    checkRateLimit('5.6.7.8', '/api/test', config);
    const stats = getStoreStats();
    // 旧条目应该被清理
    expect(stats.ipCount).toBe(1);
  });
});

describe('createRateLimitResponse', () => {
  it('返回 429 响应并包含标准头', () => {
    const result = {
      allowed: false,
      limit: 5,
      remaining: 0,
      resetTime: Math.ceil(Date.now() / 1000) + 60,
    };
    const response = createRateLimitResponse(result);
    expect(response.status).toBe(429);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('X-RateLimit-Reset')).toBe(String(result.resetTime));
    expect(response.headers.get('Retry-After')).toBeDefined();
  });

  it('响应体包含错误信息', async () => {
    const result = {
      allowed: false,
      limit: 5,
      remaining: 0,
      resetTime: Math.ceil(Date.now() / 1000) + 60,
    };
    const response = createRateLimitResponse(result);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.error.message).toBe('请求过于频繁，请稍后再试');
  });
});

describe('addRateLimitHeaders', () => {
  it('为现有响应添加速率限制头', () => {
    const response = NextResponse.json({ success: true });
    const result = {
      allowed: true,
      limit: 10,
      remaining: 8,
      resetTime: Math.ceil(Date.now() / 1000) + 60,
    };
    const modified = addRateLimitHeaders(response, result);
    expect(modified.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(modified.headers.get('X-RateLimit-Remaining')).toBe('8');
    expect(modified.headers.get('X-RateLimit-Reset')).toBe(String(result.resetTime));
  });
});

describe('cleanupExpiredEntries', () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('清理过期条目', () => {
    const config = { windowMs: 1000, maxRequests: 5 };
    checkRateLimit('1.2.3.4', '/api/test', config);
    vi.advanceTimersByTime(2000);
    cleanupExpiredEntries();
    const stats = getStoreStats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.ipCount).toBe(0);
  });

  it('保留未过期条目', () => {
    const config = { windowMs: 60000, maxRequests: 5 };
    checkRateLimit('1.2.3.4', '/api/test', config);
    cleanupExpiredEntries();
    const stats = getStoreStats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.ipCount).toBe(1);
  });
});

describe('ROUTE_LIMITS 配置', () => {
  it('/api/analyze 限制为 10次/分钟', () => {
    expect(ROUTE_LIMITS['/api/analyze']).toEqual({ windowMs: 60 * 1000, maxRequests: 10 });
  });

  it('/api/generate-graphic 限制为 10次/分钟', () => {
    expect(ROUTE_LIMITS['/api/generate-graphic']).toEqual({ windowMs: 60 * 1000, maxRequests: 10 });
  });

  it('/api/fix-commands 限制为 15次/分钟', () => {
    expect(ROUTE_LIMITS['/api/fix-commands']).toEqual({ windowMs: 60 * 1000, maxRequests: 15 });
  });

  it('/api/save-result 限制为 20次/分钟', () => {
    expect(ROUTE_LIMITS['/api/save-result']).toEqual({ windowMs: 60 * 1000, maxRequests: 20 });
  });
});

describe('DEFAULT_LIMIT', () => {
  it('默认限制为 30次/分钟', () => {
    expect(DEFAULT_LIMIT).toEqual({ windowMs: 60 * 1000, maxRequests: 30 });
  });
});
