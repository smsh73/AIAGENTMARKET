import Redis from 'ioredis';
import { createLogger } from './logger.js';
import { recordCacheHit, recordCacheMiss } from './metrics.js';

const logger = createLogger({
  screenName: 'Cache',
  callerFunction: 'CacheService',
});

// Redis 클라이언트 싱글톤
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected', {
        logType: 'success',
      });
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error', {
        error: err.message,
        logType: 'error',
      });
    });

    redisClient.on('close', () => {
      logger.warning('Redis connection closed', {
        logType: 'warning',
      });
    });
  }

  return redisClient;
}

// 캐시 키 생성 헬퍼
function getCacheKey(prefix: string, key: string): string {
  return `${prefix}:${key}`;
}

// 캐시 인터페이스
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

// 캐시 저장
export async function setCache(
  key: string,
  value: any,
  options: CacheOptions = {}
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const cacheKey = options.prefix 
      ? getCacheKey(options.prefix, key)
      : key;
    
    const serialized = JSON.stringify(value);
    
    if (options.ttl) {
      await redis.setex(cacheKey, options.ttl, serialized);
    } else {
      await redis.set(cacheKey, serialized);
    }

    logger.debug('Cache set', {
      key: cacheKey,
      ttl: options.ttl,
      logType: 'success',
    });

    return true;
  } catch (error) {
    logger.error('Failed to set cache', {
      error: error instanceof Error ? error.message : 'Unknown error',
      key,
      logType: 'error',
    });
    return false;
  }
}

// 캐시 조회
export async function getCache<T>(
  key: string,
  options: CacheOptions = {}
): Promise<T | null> {
  try {
    const redis = getRedisClient();
    const cacheKey = options.prefix 
      ? getCacheKey(options.prefix, key)
      : key;
    
    const cached = await redis.get(cacheKey);
    
    if (!cached) {
      recordCacheMiss(options.prefix || 'default');
      return null;
    }

    const parsed = JSON.parse(cached) as T;

    recordCacheHit(options.prefix || 'default');
    
    logger.debug('Cache hit', {
      key: cacheKey,
      logType: 'success',
    });

    return parsed;
  } catch (error) {
    logger.error('Failed to get cache', {
      error: error instanceof Error ? error.message : 'Unknown error',
      key,
      logType: 'error',
    });
    return null;
  }
}

// 캐시 삭제
export async function deleteCache(
  key: string,
  options: CacheOptions = {}
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const cacheKey = options.prefix 
      ? getCacheKey(options.prefix, key)
      : key;
    
    await redis.del(cacheKey);

    logger.debug('Cache deleted', {
      key: cacheKey,
      logType: 'success',
    });

    return true;
  } catch (error) {
    logger.error('Failed to delete cache', {
      error: error instanceof Error ? error.message : 'Unknown error',
      key,
      logType: 'error',
    });
    return false;
  }
}

// 패턴으로 캐시 삭제
export async function deleteCachePattern(
  pattern: string,
  options: CacheOptions = {}
): Promise<number> {
  try {
    const redis = getRedisClient();
    const fullPattern = options.prefix 
      ? getCacheKey(options.prefix, pattern)
      : pattern;
    
    const keys = await redis.keys(fullPattern);
    
    if (keys.length === 0) {
      return 0;
    }

    const deleted = await redis.del(...keys);

    logger.debug('Cache pattern deleted', {
      pattern: fullPattern,
      deleted,
      logType: 'success',
    });

    return deleted;
  } catch (error) {
    logger.error('Failed to delete cache pattern', {
      error: error instanceof Error ? error.message : 'Unknown error',
      pattern,
      logType: 'error',
    });
    return 0;
  }
}

// 캐시 존재 확인
export async function existsCache(
  key: string,
  options: CacheOptions = {}
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const cacheKey = options.prefix 
      ? getCacheKey(options.prefix, key)
      : key;
    
    const exists = await redis.exists(cacheKey);
    return exists === 1;
  } catch (error) {
    logger.error('Failed to check cache existence', {
      error: error instanceof Error ? error.message : 'Unknown error',
      key,
      logType: 'error',
    });
    return false;
  }
}

// 캐시 TTL 조회
export async function getCacheTTL(
  key: string,
  options: CacheOptions = {}
): Promise<number> {
  try {
    const redis = getRedisClient();
    const cacheKey = options.prefix 
      ? getCacheKey(options.prefix, key)
      : key;
    
    return await redis.ttl(cacheKey);
  } catch (error) {
    logger.error('Failed to get cache TTL', {
      error: error instanceof Error ? error.message : 'Unknown error',
      key,
      logType: 'error',
    });
    return -1;
  }
}

// 캐시 프리픽스 상수
export const CACHE_PREFIXES = {
  USER: 'user',
  SESSION: 'session',
  API_RESPONSE: 'api:response',
  CONVERSATION: 'conversation',
  DOCUMENT: 'document',
  WORKFLOW: 'workflow',
} as const;

