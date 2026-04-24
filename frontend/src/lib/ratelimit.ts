import { NextRequest, NextResponse } from 'next/server';

export interface RateLimitConfig {
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 窗口内最大请求数 */
  maxRequests: number;
}

export interface RateLimitResult {
  /** 是否允许请求 */
  allowed: boolean;
  /** 限制总数 */
  limit: number;
  /** 剩余请求数 */
  remaining: number;
  /** 窗口重置时间（Unix 时间戳，秒） */
  resetTime: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/** 路由速率限制配置 */
export const ROUTE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/analyze': { windowMs: 60 * 1000, maxRequests: 5 },
  '/api/generate-graphic': { windowMs: 60 * 1000, maxRequests: 5 },
  '/api/fix-commands': { windowMs: 60 * 1000, maxRequests: 10 },
  '/api/save-result': { windowMs: 60 * 1000, maxRequests: 20 },
};

/** 默认速率限制（未配置路由） */
export const DEFAULT_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 30,
};

/** 内存存储：IP -> 路径 -> 条目 */
const store = new Map<string, Map<string, RateLimitEntry>>();

/** 上次清理时间 */
let lastCleanup = Date.now();

/** 清理间隔（毫秒） */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟

/**
 * 获取客户端真实 IP
 * 优先从 x-forwarded-for 获取，其次 x-real-ip，最后使用 socket IP
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for 可能包含多个 IP，取第一个
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  // NextRequest 的 ip 属性（Edge Runtime）
  return (request as unknown as Record<string, string>).ip ?? 'unknown';
}

/**
 * 查找匹配的路由配置
 * 支持前缀匹配，例如 /api/analyze 匹配 /api/analyze/xxx
 */
export function matchRouteConfig(pathname: string): RateLimitConfig | undefined {
  // 精确匹配
  if (ROUTE_LIMITS[pathname]) {
    return ROUTE_LIMITS[pathname];
  }

  // 前缀匹配：找到最长匹配的前缀
  let matched: RateLimitConfig | undefined;
  let matchedLength = 0;

  for (const [route, config] of Object.entries(ROUTE_LIMITS)) {
    if (pathname.startsWith(route + '/') && route.length > matchedLength) {
      matched = config;
      matchedLength = route.length;
    }
  }

  return matched;
}

/**
 * 执行内存清理，删除过期条目
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  let cleanedIps = 0;
  let cleanedRoutes = 0;

  for (const [ip, routes] of store) {
    for (const [route, entry] of routes) {
      if (entry.resetTime <= now) {
        routes.delete(route);
        cleanedRoutes++;
      }
    }

    if (routes.size === 0) {
      store.delete(ip);
      cleanedIps++;
    }
  }

  lastCleanup = now;

  if (cleanedRoutes > 0 || cleanedIps > 0) {
    console.log(
      `[ratelimit] 清理完成: ${cleanedRoutes} 条过期路由记录, ${cleanedIps} 个空 IP 条目, 剩余 ${store.size} 个 IP`
    );
  }
}

/**
 * 检查并更新速率限制
 * @param ip 客户端 IP
 * @param route 请求路径
 * @param config 速率限制配置
 */
export function checkRateLimit(
  ip: string,
  route: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();

  // 触发清理（间隔到达时）
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    cleanupExpiredEntries();
  }

  // 获取或创建该 IP 的路由映射
  let routes = store.get(ip);
  if (!routes) {
    routes = new Map<string, RateLimitEntry>();
    store.set(ip, routes);
  }

  // 获取或创建该路由的条目
  let entry = routes.get(route);
  if (!entry || entry.resetTime <= now) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
    };
    routes.set(route, entry);
  }

  // 检查是否超过限制
  const allowed = entry.count < config.maxRequests;

  if (allowed) {
    entry.count++;
  }

  const remaining = Math.max(0, config.maxRequests - entry.count);

  return {
    allowed,
    limit: config.maxRequests,
    remaining,
    resetTime: Math.ceil(entry.resetTime / 1000),
  };
}

/**
 * 创建速率限制响应
 */
export function createRateLimitResponse(
  result: RateLimitResult
): NextResponse {
  const body = {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '请求过于频繁，请稍后再试',
    },
  };

  return new NextResponse(JSON.stringify(body), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(result.resetTime),
      'Retry-After': String(Math.max(1, result.resetTime - Math.ceil(Date.now() / 1000))),
    },
  });
}

/**
 * 为响应添加速率限制头
 */
export function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(result.resetTime));
  return response;
}

/**
 * 获取当前存储统计（用于监控/调试）
 */
export function getStoreStats(): {
  ipCount: number;
  totalEntries: number;
  lastCleanup: number;
} {
  let totalEntries = 0;
  for (const routes of store.values()) {
    totalEntries += routes.size;
  }

  return {
    ipCount: store.size,
    totalEntries,
    lastCleanup,
  };
}

/**
 * 重置存储（仅用于测试）
 */
export function resetStore(): void {
  store.clear();
  lastCleanup = Date.now();
}
