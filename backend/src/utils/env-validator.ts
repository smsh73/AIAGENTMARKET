import dotenv from 'dotenv';
import { createLogger } from './logger.js';

dotenv.config();

const logger = createLogger({
  screenName: 'Config',
  callerFunction: 'EnvValidator',
});

interface EnvConfig {
  // 데이터베이스
  DATABASE_URL: string;
  
  // JWT
  JWT_SECRET: string;
  JWT_EXPIRES_IN?: string;
  
  // 암호화
  ENCRYPTION_MASTER_KEY: string;
  
  // Redis
  REDIS_URL?: string;
  
  // AWS S3
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  S3_BUCKET_NAME?: string;
  
  // SMTP
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
  ADMIN_EMAILS?: string;
  
  // Slack
  SLACK_WEBHOOK_URL?: string;
  
  // CORS
  ALLOWED_ORIGINS?: string;
  
  // 서버
  PORT?: string;
  NODE_ENV?: string;
  
  // Docker
  DOCKER_SOCKET_PATH?: string;
  
  // Luxia
  LUXIA_API_URL?: string;
}

const requiredEnvVars: (keyof EnvConfig)[] = [
  'DATABASE_URL',
  'JWT_SECRET',
  'ENCRYPTION_MASTER_KEY',
];

const optionalEnvVars: (keyof EnvConfig)[] = [
  'JWT_EXPIRES_IN',
  'REDIS_URL',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'S3_BUCKET_NAME',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
  'ADMIN_EMAILS',
  'SLACK_WEBHOOK_URL',
  'ALLOWED_ORIGINS',
  'PORT',
  'NODE_ENV',
  'DOCKER_SOCKET_PATH',
  'LUXIA_API_URL',
];

export function validateEnvironment(): EnvConfig {
  const missing: string[] = [];
  const warnings: string[] = [];

  // 필수 환경 변수 검증
  for (const key of requiredEnvVars) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const error = `필수 환경 변수가 누락되었습니다: ${missing.join(', ')}`;
    logger.error(error, {
      missing,
      logType: 'error',
    });
    throw new Error(error);
  }

  // 선택적 환경 변수 경고
  for (const key of optionalEnvVars) {
    if (!process.env[key] && isRecommended(key)) {
      warnings.push(key);
    }
  }

  if (warnings.length > 0) {
    logger.warning('권장 환경 변수가 설정되지 않았습니다', {
      warnings,
      logType: 'warning',
    });
  }

  // 값 검증
  validateValues();

  logger.success('환경 변수 검증 완료', {
    logType: 'success',
  });

  return process.env as unknown as EnvConfig;
}

function isRecommended(key: string): boolean {
  const recommended = [
    'REDIS_URL',
    'AWS_ACCESS_KEY_ID',
    'SMTP_HOST',
    'SLACK_WEBHOOK_URL',
  ];
  return recommended.includes(key);
}

function validateValues(): void {
  // JWT_SECRET 길이 검증
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    logger.warning('JWT_SECRET이 너무 짧습니다 (최소 32자 권장)', {
      logType: 'warning',
    });
  }

  // ENCRYPTION_MASTER_KEY 길이 검증
  if (process.env.ENCRYPTION_MASTER_KEY) {
    const keyLength = process.env.ENCRYPTION_MASTER_KEY.length;
    if (keyLength !== 64) {
      logger.warning('ENCRYPTION_MASTER_KEY는 64자(32바이트 hex)여야 합니다', {
        currentLength: keyLength,
        logType: 'warning',
      });
    }
  }

  // DATABASE_URL 형식 검증
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgresql://')) {
    logger.warning('DATABASE_URL 형식이 올바르지 않을 수 있습니다', {
      logType: 'warning',
    });
  }

  // PORT 숫자 검증
  if (process.env.PORT && isNaN(parseInt(process.env.PORT))) {
    throw new Error('PORT는 숫자여야 합니다');
  }
}

// 환경 변수 검증 실행
let validatedConfig: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!validatedConfig) {
    validatedConfig = validateEnvironment();
  }
  return validatedConfig;
}

