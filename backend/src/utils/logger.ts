import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

interface LogData {
  userId?: number;
  screenName?: string;
  screenUrl?: string;
  callerFunction?: string;
  buttonId?: string;
  calledApi?: string;
  backendApiUrl?: string;
  logType: 'info' | 'success' | 'error' | 'warning' | 'debug';
  message?: string;
  errorCode?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

let dbLoggingEnabled = false;
let dbLoggingRetryCount = 0;
let dbLoggingPaused = false;
let dbLoggingPauseUntil = 0;
const MAX_DB_LOGGING_RETRIES = 3;
const DB_LOGGING_PAUSE_DURATION = 30000;

export function enableDatabaseLogging() {
  dbLoggingEnabled = true;
  dbLoggingRetryCount = 0;
  dbLoggingPaused = false;
}

function isConnectionError(error: Error): boolean {
  const message = error.message || '';
  return (
    message.includes('Server has closed the connection') ||
    message.includes('terminating connection') ||
    message.includes('Connection refused') ||
    message.includes('57P01') ||
    message.includes('Connection pool timeout') ||
    message.includes('kind: Closed') ||
    message.includes('ConnectorError')
  );
}

export async function logToDatabase(data: LogData): Promise<void> {
  if (!dbLoggingEnabled) {
    return;
  }
  
  if (dbLoggingPaused && Date.now() < dbLoggingPauseUntil) {
    return;
  } else if (dbLoggingPaused) {
    dbLoggingPaused = false;
    dbLoggingRetryCount = 0;
  }

  if (dbLoggingRetryCount >= MAX_DB_LOGGING_RETRIES) {
    dbLoggingPaused = true;
    dbLoggingPauseUntil = Date.now() + DB_LOGGING_PAUSE_DURATION;
    return;
  }

  setImmediate(async () => {
    try {
      const { withRetry, getPrismaClient } = await import('./database.js');
      
      let validUserId = null;
      if (data.userId) {
        const prisma = getPrismaClient();
        const user = await prisma.user.findUnique({
          where: { id: data.userId },
          select: { id: true },
        });
        if (user) {
          validUserId = user.id;
        }
      }
      
      await withRetry(async (prisma) => {
        await prisma.log.create({
          data: {
            userId: validUserId,
            screenName: data.screenName,
            screenUrl: data.screenUrl,
            callerFunction: data.callerFunction,
            buttonId: data.buttonId,
            calledApi: data.calledApi,
            backendApiUrl: data.backendApiUrl,
            logType: data.logType,
            message: data.message?.substring(0, 5000),
            errorCode: data.errorCode,
            metadata: data.metadata || {},
          },
        });
      }, 2, 500);
      dbLoggingRetryCount = 0;
    } catch (dbError) {
      const error = dbError instanceof Error ? dbError : new Error('Unknown');
      if (isConnectionError(error)) {
        dbLoggingRetryCount++;
        if (dbLoggingRetryCount >= MAX_DB_LOGGING_RETRIES) {
          dbLoggingPaused = true;
          dbLoggingPauseUntil = Date.now() + DB_LOGGING_PAUSE_DURATION;
        }
      }
    }
  });
}

export function createLogger(context: {
  screenName?: string;
  screenUrl?: string;
  callerFunction?: string;
}) {
  return {
    info: (message: string, data?: Partial<LogData>) => {
      const logData = {
        ...context,
        ...data,
        logType: 'info' as const,
        message,
      };
      logger.info(message, logData);
      logToDatabase(logData);
    },
    success: (message: string, data?: Partial<LogData>) => {
      const logData = {
        ...context,
        ...data,
        logType: 'success' as const,
        message,
      };
      logger.info(message, logData);
      logToDatabase(logData);
    },
    error: (message: string, data?: Partial<LogData>) => {
      const logData = {
        ...context,
        ...data,
        logType: 'error' as const,
        message,
      };
      logger.error(message, logData);
      logToDatabase(logData);
    },
    warning: (message: string, data?: Partial<LogData>) => {
      const logData = {
        ...context,
        ...data,
        logType: 'warning' as const,
        message,
      };
      logger.warn(message, logData);
      logToDatabase(logData);
    },
    debug: (message: string, data?: Partial<LogData>) => {
      const logData = {
        ...context,
        ...data,
        logType: 'debug' as const,
        message,
      };
      logger.debug(message, logData);
      logToDatabase(logData);
    },
  };
}
