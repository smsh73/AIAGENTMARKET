import { z } from 'zod';
import { createLogger } from './logger.js';

const logger = createLogger({
  screenName: 'Validation',
  callerFunction: 'ValidationSchemas',
});

// 공통 검증 스키마
export const commonSchemas = {
  email: z.string().email('유효한 이메일 주소를 입력하세요'),
  password: z.string().min(6, '비밀번호는 최소 6자 이상이어야 합니다'),
  id: z.number().int().positive('ID는 양수여야 합니다'),
  uuid: z.string().uuid('유효한 UUID 형식이 아닙니다'),
};

// 인증 관련 스키마
export const authSchemas = {
  register: z.object({
    email: commonSchemas.email,
    password: commonSchemas.password,
    name: z.string().min(1, '이름을 입력하세요').max(100, '이름은 100자 이하여야 합니다'),
  }),
  login: z.object({
    email: commonSchemas.email,
    password: z.string().min(1, '비밀번호를 입력하세요'),
  }),
};

// AI 관련 스키마
export const aiSchemas = {
  chat: z.object({
    message: z.string().min(1, '메시지를 입력하세요').max(50000, '메시지는 50000자 이하여야 합니다'),
    conversationId: z.number().int().positive().optional().nullable(),
    provider: z.enum(['openai', 'claude', 'gemini', 'perplexity', 'luxia']).optional().nullable(),
    mixOfAgents: z.boolean().optional().default(false),
  }),
  promptSuggestions: z.object({
    words: z.array(z.string()).min(1, '단어 배열이 필요합니다'),
  }),
};

// 문서 관련 스키마
export const documentSchemas = {
  upload: z.object({
    conversationId: z.number().int().positive().optional(),
  }),
  summarize: z.object({
    maxLength: z.number().int().positive().max(5000).optional(),
  }),
  generate: z.object({
    instruction: z.string().min(1, '지시사항을 입력하세요').max(1000, '지시사항은 1000자 이하여야 합니다'),
  }),
};

// 코드 관련 스키마
export const codeSchemas = {
  generate: z.object({
    requirement: z.string().min(1, '요구사항을 입력하세요').max(5000, '요구사항은 5000자 이하여야 합니다'),
    context: z.string().max(10000).optional(),
    type: z.enum(['python', 'notebook']).default('python'),
  }),
  execute: z.object({
    code: z.string().min(1, '코드를 입력하세요').max(50000, '코드는 50000자 이하여야 합니다'),
    type: z.enum(['python', 'notebook']).default('python'),
    timeout: z.number().int().positive().max(300000).optional(), // 최대 5분
  }),
};

// 워크플로우 관련 스키마
export const workflowSchemas = {
  create: z.object({
    goal: z.string().min(1, '목표를 입력하세요').max(1000, '목표는 1000자 이하여야 합니다'),
    context: z.string().max(5000).optional(),
    conversationId: z.number().int().positive().optional(),
  }),
};

// 관리자 관련 스키마
export const adminSchemas = {
  apiKey: z.object({
    provider: z.enum(['openai', 'claude', 'gemini', 'perplexity', 'luxia']),
    apiKey: z.string().min(1, 'API 키를 입력하세요'),
    weight: z.number().min(0.1).max(10).default(1.0),
    isActive: z.boolean().default(true),
  }),
  user: z.object({
    email: commonSchemas.email,
    password: commonSchemas.password.optional(),
    name: z.string().min(1).max(100),
    role: z.enum(['user', 'admin']).default('user'),
    isActive: z.boolean().default(true),
  }),
  guardrail: z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).optional(),
    pattern: z.string().min(1, '패턴을 입력하세요'),
    action: z.enum(['block', 'warn', 'modify']).default('block'),
    isActive: z.boolean().default(true),
  }),
};

// 검증 헬퍼 함수
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warning('Validation failed', {
        errors: error.errors,
        logType: 'warning',
      });
      throw new Error(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
}

