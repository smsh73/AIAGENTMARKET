import { Request, Response, NextFunction } from 'express';
import { usageService } from '../services/usage/usageService.js';
import { subscriptionService, SUBSCRIPTION_PLANS } from '../services/toss/subscriptionService.js';
import { createLogger } from '../utils/logger.js';
import { getPrismaClient } from '../utils/database.js';
import jwt from 'jsonwebtoken';

const prisma = getPrismaClient();

export interface UsageLimitedRequest extends Request {
  userId?: number;
  user?: {
    id: number;
    email: string;
    name: string;
    role: string;
    subscriptionPlan?: string;
  };
  usageStatus?: {
    canUseService: boolean;
    requiresPayment: boolean;
    paymentAmount: number | null;
    isAnonymous: boolean;
    ipAddress: string;
  };
}

export async function usageLimiter(
  req: UsageLimitedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const logger = createLogger({
    screenName: 'UsageLimiter',
    callerFunction: 'usageLimiter',
  });

  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
      || req.socket.remoteAddress 
      || '0.0.0.0';

    if (token) {
      try {
        const secret = process.env.JWT_SECRET;
        if (secret) {
          const decoded = jwt.verify(token, secret) as { userId: number };
          
          const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              subscriptionPlan: true,
              isActive: true,
            },
          });

          if (user && user.isActive) {
            req.userId = user.id;
            req.user = user;

            const usage = await usageService.checkUserUsage(user.id);
            
            req.usageStatus = {
              canUseService: usage.canUseService,
              requiresPayment: usage.requiresPayment,
              paymentAmount: usage.paymentAmount,
              isAnonymous: false,
              ipAddress,
            };

            if (!usage.canUseService && !usage.requiresPayment) {
              res.status(429).json({
                error: 'Usage limit exceeded',
                message: usage.message,
                upgradeRequired: true,
              });
              return;
            }

            next();
            return;
          }
        }
      } catch {
      }
    }

    const usage = await usageService.checkAnonymousUsage(ipAddress);
    
    req.usageStatus = {
      canUseService: usage.canUseService,
      requiresPayment: false,
      paymentAmount: null,
      isAnonymous: true,
      ipAddress,
    };

    if (!usage.canUseService) {
      res.status(429).json({
        error: 'Usage limit exceeded',
        message: usage.message,
        signupRequired: true,
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Usage limiter error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      logType: 'error',
    });
    
    next();
  }
}

export async function recordUsageAfterResponse(
  req: UsageLimitedRequest,
  requestType: string,
  toolMode?: string
): Promise<void> {
  const logger = createLogger({
    screenName: 'UsageLimiter',
    callerFunction: 'recordUsage',
  });

  try {
    const userId = req.userId || null;
    const ipAddress = req.usageStatus?.ipAddress || null;
    
    let isBilled = false;
    let billedAmount: number | undefined;

    if (req.usageStatus?.requiresPayment && req.usageStatus?.paymentAmount) {
      isBilled = true;
      billedAmount = req.usageStatus.paymentAmount;
      
      if (userId) {
        try {
          await subscriptionService.createPaygPayment(userId);
        } catch (error) {
          logger.error('PAYG billing failed', {
            userId,
            amount: billedAmount,
            error: error instanceof Error ? error.message : 'Unknown error',
            logType: 'error',
          });
        }
      }
    }

    await usageService.recordUsage(
      userId,
      ipAddress,
      requestType,
      toolMode,
      isBilled,
      billedAmount
    );
  } catch (error) {
    logger.error('Failed to record usage', {
      error: error instanceof Error ? error.message : 'Unknown error',
      logType: 'error',
    });
  }
}
