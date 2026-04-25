import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  getClientIp,
  matchRouteConfig,
  checkRateLimit,
  createRateLimitResponse,
  addRateLimitHeaders,
  DEFAULT_LIMIT,
  type RateLimitConfig,
} from '@/lib/ratelimit';

// 请求体大小限制：10MB
const MAX_BODY_SIZE_BYTES = 10 * 1024 * 1024;

// 允许的源（生产环境应配置为实际域名）
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://localhost:3000',
];

// GET /api/result/[id] 使用更宽松的速率限制（读取分享结果）
const RESULT_GET_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 60,
};

/**
 * Next.js Middleware
 * 统一处理 CORS、CSP、请求体大小限制等安全头
 */
export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin') ?? '';
  const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin);

  // ── 1. 请求体大小限制 ───────────────────────────────────────
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const length = parseInt(contentLength, 10);
    if (!isNaN(length) && length > MAX_BODY_SIZE_BYTES) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `请求体大小超过 ${MAX_BODY_SIZE_BYTES / 1024 / 1024}MB 限制`,
          },
        }),
        {
          status: 413,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
  }

  // ── 2. API 路由安全校验 ────────────────────────────────────
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // 拒绝非允许来源的请求（防范 CSRF）
    if (!isAllowedOrigin && origin) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '来源不被允许',
          },
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const ip = getClientIp(request);
    const route = request.nextUrl.pathname;

    // GET /api/result/[id] 使用独立配置
    let config: RateLimitConfig;
    if (request.method === 'GET' && route.startsWith('/api/result/')) {
      config = RESULT_GET_LIMIT;
    } else {
      config = matchRouteConfig(route) ?? DEFAULT_LIMIT;
    }

    const result = checkRateLimit(ip, route, config);

    if (!result.allowed) {
      return createRateLimitResponse(result);
    }

    // 预检请求直接返回（带速率限制头）
    if (request.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      setCorsHeaders(response, isAllowedOrigin ? origin : ALLOWED_ORIGINS[0]);
      addRateLimitHeaders(response, result);
      return response;
    }

    // ── 3. 正常请求：添加安全头和速率限制头 ───────────────────
    const response = NextResponse.next();

    setCorsHeaders(response, isAllowedOrigin ? origin : ALLOWED_ORIGINS[0]);
    setSecurityHeaders(response);
    addRateLimitHeaders(response, result);

    return response;
  }

  // ── 4. 预检请求处理（CORS Preflight）────────────────────────
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    setCorsHeaders(response, isAllowedOrigin ? origin : ALLOWED_ORIGINS[0]);
    return response;
  }

  // ── 5. 正常请求：添加安全头 ─────────────────────────────────
  const response = NextResponse.next();

  setCorsHeaders(response, isAllowedOrigin ? origin : ALLOWED_ORIGINS[0]);
  setSecurityHeaders(response);

  return response;
}

/**
 * 设置 CORS 头
 */
function setCorsHeaders(response: NextResponse, origin: string) {
  // 空 origin 时不设置通配符，保持当前域
  response.headers.set('Access-Control-Allow-Origin', origin || 'null');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Max-Age', '86400');
}

/**
 * 设置安全头（CSP 等）
 */
function setSecurityHeaders(response: NextResponse) {
  // Content-Security-Policy
  // 注意：移除 'unsafe-inline'，保留 'unsafe-eval'（GeoGebra 需要）
  // Next.js 会自动为内联脚本添加 nonce，这里配合 Next.js Script 组件使用
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval'", // GeoGebra 需要 eval；unsafe-inline 已移除
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://openrouter.ai",
    "font-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  // 其他安全头
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

/**
 * 匹配所有 API 路由和页面路由
 */
export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|_next/data|favicon.ico).*)'],
};
