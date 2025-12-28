import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createMainApp(server: http.Server) {
  const app = express();
  
  const { initSocketIO } = await import('./utils/socket.js');
  const io = initSocketIO(server);
  console.log('[App] Socket.io initialized');
  
  const { configureCORS, securityHeaders } = await import('./middleware/security.js');
  const { createRateLimiter } = await import('./middleware/rateLimiter.js');

  app.use(securityHeaders);
  app.use(configureCORS());


  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use('/api/', createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 500 }));
  app.use('/api/ai/', createRateLimiter({ windowMs: 60 * 1000, maxRequests: 100 }));

  const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
  app.use('/uploads', express.static(path.resolve(UPLOAD_DIR)));

  app.get('/health/detailed', async (req, res) => {
    try {
      const { checkDatabaseConnection } = await import('./utils/database.js');
      const dbConnected = await checkDatabaseConnection();
      res.json({
        status: dbConnected ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        database: dbConnected ? 'connected' : 'disconnected',
        websocket: 'ready',
        uptime: process.uptime(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // 라우트를 Promise.all로 import하되, 에러 발생 시 어떤 라우트인지 확인
  console.log('[Init] Importing routes...');
  let routeImports;
  try {
    routeImports = await Promise.all([
      import('./routes/auth.js').catch(err => { console.error('[Init] Failed to import auth.js:', err.message); throw err; }),
      import('./routes/oauth.js').catch(err => { console.error('[Init] Failed to import oauth.js:', err.message); throw err; }),
      import('./routes/subscription.js').catch(err => { console.error('[Init] Failed to import subscription.js:', err.message); throw err; }),
      import('./routes/ai.js').catch(err => { console.error('[Init] Failed to import ai.js:', err.message); throw err; }),
      import('./routes/ai-stream.js').catch(err => { console.error('[Init] Failed to import ai-stream.js:', err.message); throw err; }),
      import('./routes/ai-websocket.js').catch(err => { console.error('[Init] Failed to import ai-websocket.js:', err.message); throw err; }),
      import('./routes/documents.js').catch(err => { console.error('[Init] Failed to import documents.js:', err.message); throw err; }),
      import('./routes/code.js').catch(err => { console.error('[Init] Failed to import code.js:', err.message); throw err; }),
      import('./routes/workflows.js').catch(err => { console.error('[Init] Failed to import workflows.js:', err.message); throw err; }),
      import('./routes/mcp.js').catch(err => { console.error('[Init] Failed to import mcp.js:', err.message); throw err; }),
      import('./routes/conversations.js').catch(err => { console.error('[Init] Failed to import conversations.js:', err.message); throw err; }),
      import('./routes/logs.js').catch(err => { console.error('[Init] Failed to import logs.js:', err.message); throw err; }),
      import('./routes/admin/index.js').catch(err => { console.error('[Init] Failed to import admin/index.js:', err.message); throw err; }),
      import('./routes/multimodal.js').catch(err => { console.error('[Init] Failed to import multimodal.js:', err.message); throw err; }),
      import('./routes/metrics.js').catch(err => { console.error('[Init] Failed to import metrics.js:', err.message); throw err; }),
      import('./routes/opendart.js').catch(err => { console.error('[Init] Failed to import opendart.js:', err.message); throw err; }),
      import('./routes/slides.js').catch(err => { console.error('[Init] Failed to import slides.js:', err.message); throw err; }),
      import('./routes/export.js').catch(err => { console.error('[Init] Failed to import export.js:', err.message); throw err; }),
      import('./routes/agents.js').catch(err => { console.error('[Init] Failed to import agents.js:', err.message); throw err; }),
      import('./routes/business-assistant.js').catch(err => { console.error('[Init] Failed to import business-assistant.js:', err.message); throw err; }),
    ]);
    console.log('[Init] All routes imported successfully');
  } catch (err) {
    console.error('[Init] ========== CRITICAL ERROR ==========');
    console.error('[Init] Failed to import routes');
    if (err instanceof Error) {
      console.error('[Init] Error name:', err.name);
      console.error('[Init] Error message:', err.message);
      console.error('[Init] Error stack:', err.stack);
    } else {
      console.error('[Init] Unknown error:', JSON.stringify(err, null, 2));
    }
    console.error('[Init] ====================================');
    throw err;
  }

  const [
    { default: authRoutes },
    { default: oauthRoutes },
    { default: subscriptionRoutes },
    { default: aiRoutes },
    { default: aiStreamRoutes },
    { default: aiWebsocketRoutes },
    { default: documentRoutes },
    { default: codeRoutes },
    { default: workflowRoutes },
    { default: mcpRoutes },
    { default: conversationRoutes },
    { default: logRoutes },
    { default: adminRoutes },
    { default: multimodalRoutes },
    { default: metricsRoutes },
    { default: opendartRoutes },
    { default: slidesRoutes },
    { default: exportRoutes },
    { default: agentRoutes },
    { default: businessAssistantRoutes },
  ] = routeImports;

  app.use('/api/auth', authRoutes);
  app.use('/api/oauth', oauthRoutes);
  app.use('/api/subscription', subscriptionRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/ai', aiStreamRoutes);
  app.use('/api/ai', aiWebsocketRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/code', codeRoutes);
  app.use('/api/workflows', workflowRoutes);
  app.use('/api/mcp', mcpRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/logs', logRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/multimodal', multimodalRoutes);
  app.use('/api/opendart', opendartRoutes);
  app.use('/api/slides', slidesRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/business-assistant', businessAssistantRoutes);
  app.use('/metrics', metricsRoutes);

  const swaggerUi = (await import('swagger-ui-express')).default;
  const { swaggerSpec } = await import('./utils/swagger.js');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  if (process.env.NODE_ENV === 'production') {
    const possiblePaths = [
      path.join(__dirname, '../../frontend/dist'),
      path.join(process.cwd(), 'frontend/dist'),
      path.resolve('frontend/dist'),
    ];
    
    let frontendBuildPath = possiblePaths[0];
    let indexHtmlPath = path.join(frontendBuildPath, 'index.html');
    let frontendExists = false;
    
    for (const p of possiblePaths) {
      const indexPath = path.join(p, 'index.html');
      if (fs.existsSync(indexPath)) {
        frontendBuildPath = p;
        indexHtmlPath = indexPath;
        frontendExists = true;
        console.log('[Static] Found frontend at:', p);
        break;
      }
    }
    
    if (frontendExists) {
      app.use(express.static(frontendBuildPath, { index: false }));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/metrics') || req.path.startsWith('/api-docs') || req.path === '/health' || req.path === '/healthz') {
          next();
        } else {
          res.sendFile(indexHtmlPath);
        }
      });
      console.log('[Static] Frontend assets loaded from', frontendBuildPath);
    } else {
      console.warn('[Static] Frontend build not found at', frontendBuildPath);
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/metrics') || req.path.startsWith('/api-docs') || req.path === '/health' || req.path === '/healthz') {
          next();
        } else {
          res.status(200).send('AIONIS API - Frontend not available');
        }
      });
    }
  }

  const { errorHandler, notFoundHandler } = await import('./middleware/errorHandler.js');
  if (process.env.NODE_ENV !== 'production') {
    app.use(notFoundHandler);
  }
  app.use(errorHandler);

  console.log('[App] Routes loaded');

  setImmediate(() => {
    initBackgroundServices();
  });

  return app;
}

async function initBackgroundServices() {
  try {
    const { logger, enableDatabaseLogging } = await import('./utils/logger.js');
    const { validateEnvironment } = await import('./utils/env-validator.js');
    
    try {
      validateEnvironment();
    } catch (error) {
      console.warn('Environment validation warning:', error);
    }

    enableDatabaseLogging();
    
    const { checkDatabaseConnection } = await import('./utils/database.js');
    const dbConnected = await checkDatabaseConnection();
    if (dbConnected) {
      console.log('[Background] Database connection verified');
      
      // 자동 시드 데이터 실행 (데이터가 없을 때만)
      if (process.env.AUTO_SEED !== 'false') {
        try {
          const { getPrismaClientAsync } = await import('./utils/database.js');
          const prisma = await getPrismaClientAsync();
          
          // 사용자 데이터 확인
          const userCount = await prisma.user.count();
          if (userCount === 0) {
            console.log('[Background] No users found, running seed data...');
            const { hashPassword } = await import('./utils/password.js');
            const adminPassword = await hashPassword('admin123');
                await prisma.user.upsert({
                  where: { email: 'admin@aionis.world' },
                  update: {},
                  create: {
                    email: 'admin@aionis.world',
                passwordHash: adminPassword,
                name: '시스템 관리자',
                role: 'admin',
                isActive: true,
              },
            });
            console.log('[Background] Admin user created');
          }
          
          // 카테고리 데이터 확인 및 생성
          const { withRetry } = await import('./utils/database.js');
          const categoryCount = await withRetry(async (prismaClient) => {
            return await prismaClient.agentCategory.count();
          }, 3, 1000);
          
          if (categoryCount === 0) {
            console.log('[Background] No categories found, creating seed categories...');
            const categories = [
              { slug: 'healthcare', name: 'Healthcare', nameKo: '의료/헬스케어', iconName: 'heart', color: '#E53E3E', sortOrder: 1 },
              { slug: 'legal', name: 'Legal', nameKo: '법률/행정', iconName: 'scale', color: '#805AD5', sortOrder: 2 },
              { slug: 'finance', name: 'Finance', nameKo: '금융/세무/회계', iconName: 'dollar-sign', color: '#38A169', sortOrder: 3 },
              { slug: 'customer-service', name: 'Customer Service', nameKo: '고객센터', iconName: 'headphones', color: '#3182CE', sortOrder: 4 },
              { slug: 'government', name: 'Government', nameKo: '공공/민원', iconName: 'building', color: '#718096', sortOrder: 5 },
              { slug: 'research', name: 'Research', nameKo: '리서치/분석', iconName: 'search', color: '#00B5D8', sortOrder: 6 },
              { slug: 'business', name: 'Business', nameKo: '비즈니스', iconName: 'briefcase', color: '#DD6B20', sortOrder: 7 },
              { slug: 'investment', name: 'Investment', nameKo: '투자/증권', iconName: 'trending-up', color: '#9F7AEA', sortOrder: 8 },
            ];
            
            for (const cat of categories) {
              await withRetry(async (prismaClient) => {
                return await prismaClient.agentCategory.upsert({
                  where: { slug: cat.slug },
                  update: {},
                  create: { ...cat, isActive: true },
                });
              }, 3, 1000);
            }
            console.log('[Background] Categories created');
          }
          
          // AI 에이전트 데이터 확인
          const agentCount = await withRetry(async (prismaClient) => {
            return await prismaClient.aIAgent.count();
          }, 3, 1000);
          
          if (agentCount === 0) {
            console.log('[Background] No AI agents found, creating seed data...');
            // 기본 AI 에이전트 생성 (간단한 버전)
            await withRetry(async (prismaClient) => {
              return await prismaClient.aIAgent.create({
                data: {
                  slug: 'doctor-ai',
                  name: '닥터 AI',
                  tagline: '의사선생님 AI 도우미',
                  description: '건강 상담, 증상 분석, 의료 정보 안내를 도와드리는 AI 의료 어시스턴트입니다.',
                  category: 'healthcare',
                  primaryColor: '#E53E3E',
                  accentColor: '#FC8181',
                  aiProvider: 'openai',
                  modelName: 'gpt-4o',
                  systemPrompt: '당신은 친절하고 전문적인 의료 AI 어시스턴트 "닥터 AI"입니다.',
                  temperature: 0.3,
                  maxTokens: 8192,
                  features: JSON.stringify(['건강 상담', '증상 분석', '의료 정보 안내']),
                  isFeatured: true,
                  isPublished: true,
                  sortOrder: 1,
                },
              });
            }, 3, 1000);
            console.log('[Background] AI agents created');
          }
        } catch (seedError) {
          console.warn('[Background] Seed warning:', seedError instanceof Error ? seedError.message : 'Unknown error');
        }
      }
      
      logger.info('Server started successfully', {
        screenName: 'Server',
        callerFunction: 'server.listen',
        logType: 'success',
      });
      
      const { seedSubscriptionPlans } = await import('./services/toss/subscriptionService.js');
      seedSubscriptionPlans().catch(err => {
        console.warn('[Subscription] Seed warning:', err.message);
      });
      
      initTossPayments().catch(err => {
        console.warn('[TossPayments] Init warning:', err.message);
      });
    } else {
      console.warn('[Background] Database connection not available');
    }
  } catch (error) {
    console.warn('[Background] Services error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function initTossPayments() {
  try {
    const { getTossCredentials } = await import('./services/toss/tossClient.js');
    
    console.log('[TossPayments] Checking configuration...');
    await getTossCredentials();
    console.log('[TossPayments] Ready');
  } catch (error) {
    console.warn('[TossPayments] Warning:', error instanceof Error ? error.message : 'Unknown error');
  }
}
