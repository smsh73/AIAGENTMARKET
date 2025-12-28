import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger.js';
const logger = createLogger({
  screenName: 'RateLimiter',
  callerFunction: 'rateLimiter',
});

interface RateLimitConfig {
  windowMs: number; // 시간 윈도우 (밀리초)
  maxRequests: number; // 최대 요청 수
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

const defaultConfig: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15분
  maxRequests: 100,
};

// 사용자별 요청 카운터 (메모리 기반, 프로덕션에서는 Redis 사용 권장)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...defaultConfig, ...config };

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const identifier = getIdentifier(req);
      const now = Date.now();
      const record = requestCounts.get(identifier);

      // 레코드 초기화 또는 만료 확인
      if (!record || now > record.resetTime) {
        requestCounts.set(identifier, {
          count: 1,
          resetTime: now + finalConfig.windowMs,
        });
        return next();
      }

      // 요청 수 증가
      record.count++;

      // 제한 초과 확인
      if (record.count > finalConfig.maxRequests) {
        logger.warning('Rate limit exceeded', {
          identifier,
          count: record.count,
          maxRequests: finalConfig.maxRequests,
          backendApiUrl: req.originalUrl,
          logType: 'warning',
        });

        res.status(429).json({
          error: 'Too many requests',
          message: `최대 ${finalConfig.maxRequests}개의 요청을 ${finalConfig.windowMs / 1000}초 동안 허용합니다.`,
          retryAfter: Math.ceil((record.resetTime - now) / 1000),
        });
        return;
      }

      // Rate limit 헤더 추가
      res.setHeader('X-RateLimit-Limit', finalConfig.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (finalConfig.maxRequests - record.count).toString());
      res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

      next();
    } catch (error) {
      logger.error('Rate limiter error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        backendApiUrl: req.originalUrl,
        logType: 'error',
      });
      // 에러 발생 시 요청 허용 (안전 우선)
      next();
    }
  };
}

function getIdentifier(req: Request): string {
  // 사용자 ID가 있으면 사용, 없으면 IP 주소 사용
  const userId = (req as any).userId;
  if (userId) {
    return `user:${userId}`;
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

// 정기적으로 만료된 레코드 정리
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(key);
    }
  }
}, 60000); // 1분마다 정리

