import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger.js';
import { notificationManager } from '../services/notifications/manager.js';

const logger = createLogger({
  screenName: 'ErrorHandler',
  callerFunction: 'ErrorHandler',
});

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class CustomError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 전역 에러 핸들러
export function errorHandler(
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational !== false;

  // 에러 로깅
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    statusCode,
    method: req.method,
    url: req.originalUrl,
    userId: (req as any).userId,
    logType: 'error',
  });

  // 심각한 에러는 알림 전송
  if (statusCode >= 500 && isOperational) {
    notificationManager.sendError(error, {
      method: req.method,
      url: req.originalUrl,
      userId: (req as any).userId,
    }).catch((notifError) => {
      logger.error('Failed to send error notification', {
        error: notifError instanceof Error ? notifError.message : 'Unknown error',
        logType: 'error',
      });
    });
  }

  // 프로덕션에서는 상세 에러 정보 숨김
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(statusCode).json({
    error: isOperational ? error.message : 'Internal server error',
    ...(isDevelopment && {
      stack: error.stack,
      details: {
        method: req.method,
        url: req.originalUrl,
        timestamp: new Date().toISOString(),
      },
    }),
  });
}

// 404 핸들러
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const error = new CustomError(`Route not found: ${req.originalUrl}`, 404);
  next(error);
}

// 비동기 에러 래퍼
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

