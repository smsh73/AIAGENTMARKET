// Jest 테스트 설정
import dotenv from 'dotenv';

// 테스트 환경 변수 로드
dotenv.config({ path: '.env.test' });

// 전역 테스트 타임아웃 설정
jest.setTimeout(30000);

// 모킹 설정
jest.mock('../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
  logger: {
    info: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

