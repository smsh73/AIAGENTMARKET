import swaggerJsdoc from 'swagger-jsdoc';
import { SwaggerDefinition } from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AI Assistant API',
      version: '1.0.0',
      description: '솔트룩스 AI 어시스턴트 통합 그룹웨어 API 문서',
      contact: {
        name: 'Saltlux',
        url: 'https://www.saltlux.com',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:5000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    tags: [
      { name: 'Auth', description: '인증 관련 API' },
      { name: 'AI', description: 'AI 오케스트레이션 API' },
      { name: 'Documents', description: '문서 처리 API' },
      { name: 'Code', description: '코드 생성 및 실행 API' },
      { name: 'Workflows', description: '워크플로우 관리 API' },
      { name: 'Conversations', description: '대화 이력 API' },
      { name: 'Admin', description: '관리자 API' },
      { name: 'Multimodal', description: '멀티모달 처리 API' },
      { name: 'Metrics', description: '메트릭 조회 API' },
    ],
  },
  apis: ['./src/routes/**/*.ts', './src/index.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);

