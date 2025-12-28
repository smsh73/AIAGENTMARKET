import type { PrismaClient as PrismaClientType } from '@prisma/client';

let prismaInstance: PrismaClientType | null = null;
let initPromise: Promise<PrismaClientType> | null = null;
let isReconnecting = false;
let lastConnectionCheck = 0;
const CONNECTION_CHECK_INTERVAL = 15000;
let connectionCheckTimer: NodeJS.Timeout | null = null;

async function initializePrisma(): Promise<PrismaClientType> {
  if (prismaInstance) return prismaInstance;
  
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    const { PrismaClient } = await import('@prisma/client');
    
    const dbUrl = process.env.DATABASE_URL || '';
    
    const urlObj = new URL(dbUrl);
    urlObj.searchParams.set('connection_limit', '3');
    urlObj.searchParams.set('pool_timeout', '10');
    urlObj.searchParams.set('connect_timeout', '10');
    
    const connectionUrl = urlObj.toString();

    const client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['error', 'warn']
        : ['error'],
      datasources: {
        db: {
          url: connectionUrl,
        },
      },
    });

    console.log('[Database] Prisma client initialized');

    startConnectionKeepAlive(client);

    const cleanup = async () => {
      if (connectionCheckTimer) {
        clearInterval(connectionCheckTimer);
        connectionCheckTimer = null;
      }
      try {
        await client.$disconnect();
        console.log('[Database] Prisma client disconnected');
      } catch {}
    };

    process.on('beforeExit', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);

    prismaInstance = client;
    return client;
  })();
  
  return initPromise;
}

function startConnectionKeepAlive(client: PrismaClientType) {
  if (connectionCheckTimer) {
    clearInterval(connectionCheckTimer);
  }
  
  connectionCheckTimer = setInterval(async () => {
    try {
      await client.$queryRaw`SELECT 1`;
      lastConnectionCheck = Date.now();
    } catch (error) {
      console.warn('[Database] Keep-alive ping failed, will reconnect on next request');
    }
  }, CONNECTION_CHECK_INTERVAL);
  
  if (connectionCheckTimer.unref) {
    connectionCheckTimer.unref();
  }
}

type PrismaClientProxy = PrismaClientType & { _initialized: boolean };

function createLazyProxy(): PrismaClientProxy {
  const handler: ProxyHandler<object> = {
    get(target, prop) {
      if (prop === '_initialized') {
        return prismaInstance !== null;
      }
      
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return undefined;
      }
      
      if (!prismaInstance) {
        throw new Error(`Prisma not initialized. Accessing '${String(prop)}' before database is ready. Use getPrismaClientAsync() for async operations.`);
      }
      
      return (prismaInstance as any)[prop];
    }
  };
  
  return new Proxy({} as object, handler) as PrismaClientProxy;
}

const lazyPrisma = createLazyProxy();

export function getPrismaClient(): PrismaClientType {
  if (!prismaInstance) {
    initializePrisma().catch(err => {
      console.error('[Database] Failed to initialize:', err);
    });
  }
  return lazyPrisma;
}

export async function getPrismaClientAsync(): Promise<PrismaClientType> {
  return initializePrisma();
}

export function hasPrismaClient(): boolean {
  return prismaInstance !== null;
}

export async function reconnectPrisma(): Promise<PrismaClientType> {
  if (isReconnecting) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return getPrismaClientAsync();
  }

  isReconnecting = true;
  
  try {
    if (prismaInstance) {
      try {
        await prismaInstance.$disconnect();
      } catch {
      }
    }
    
    prismaInstance = null;
    initPromise = null;
    
    const client = await initializePrisma();
    await client.$connect();
    console.log('[Database] Prisma client reconnected successfully');
    
    return client;
  } catch (error) {
    console.error('[Database] Reconnection failed:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  } finally {
    isReconnecting = false;
  }
}

export async function withRetry<T>(
  operation: (prisma: PrismaClientType) => Promise<T>,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prisma = await getPrismaClientAsync();
      return await operation(prisma);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      const isConnectionError = 
        lastError.message.includes('Server has closed the connection') ||
        lastError.message.includes('terminating connection') ||
        lastError.message.includes('Connection refused') ||
        lastError.message.includes('57P01') ||
        lastError.message.includes('Connection pool timeout') ||
        lastError.message.includes('kind: Closed');
      
      if (isConnectionError && attempt < maxRetries) {
        console.log(`[Database] Connection error, attempting reconnect (attempt ${attempt}/${maxRetries})`);
        
        try {
          await reconnectPrisma();
        } catch {
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        continue;
      }
      
      throw lastError;
    }
  }
  
  throw lastError || new Error('Operation failed after retries');
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const prisma = await getPrismaClientAsync();
    await prisma.$queryRaw`SELECT 1`;
    lastConnectionCheck = Date.now();
    return true;
  } catch (error) {
    console.error('[Database] Connection check failed:', error instanceof Error ? error.message : 'Unknown error');
    
    try {
      await reconnectPrisma();
      return true;
    } catch {
      return false;
    }
  }
}

export async function ensureConnection(): Promise<PrismaClientType> {
  const now = Date.now();
  
  if (now - lastConnectionCheck > CONNECTION_CHECK_INTERVAL) {
    const isConnected = await checkDatabaseConnection();
    if (!isConnected) {
      throw new Error('Database connection unavailable');
    }
  }
  
  return getPrismaClientAsync();
}

export async function getConnectionStats() {
  try {
    const prisma = await getPrismaClientAsync();
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const queryTime = Date.now() - startTime;

    return {
      connected: true,
      queryTime,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}
