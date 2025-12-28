import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createLogger } from '../utils/logger.js';
import { getPrismaClient } from '../utils/database.js';

const prisma = getPrismaClient();

export interface AuthRequest extends Request {
  userId?: number;
  user?: {
    id: number;
    email: string;
    name: string;
    role: string;
  };
}

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const logger = createLogger({
    screenName: 'Auth',
    callerFunction: 'authenticateToken',
  });

  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      logger.warning('Authentication failed: No token provided', {
        backendApiUrl: req.originalUrl,
        logType: 'warning',
      });
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error('JWT_SECRET not configured', {
        logType: 'error',
      });
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    const decoded = jwt.verify(token, secret) as { userId: number };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      logger.warning('Authentication failed: User not found or inactive', {
        userId: decoded.userId,
        backendApiUrl: req.originalUrl,
        logType: 'warning',
      });
      res.status(401).json({ error: 'Invalid or inactive user' });
      return;
    }

    req.userId = user.id;
    req.user = user;

    logger.debug('Authentication successful', {
      userId: user.id,
      backendApiUrl: req.originalUrl,
      logType: 'success',
    });

    next();
  } catch (error) {
    logger.error('Authentication error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      backendApiUrl: req.originalUrl,
      logType: 'error',
    });
    res.status(403).json({ error: 'Invalid token' });
  }
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== 'admin') {
    const logger = createLogger({
      screenName: 'Auth',
      callerFunction: 'requireAdmin',
    });
    logger.warning('Admin access required', {
      userId: req.userId,
      backendApiUrl: req.originalUrl,
      logType: 'warning',
    });
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export async function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      next();
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      next();
      return;
    }

    try {
      const decoded = jwt.verify(token, secret) as { userId: number };
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          subscriptionPlan: true,
        },
      });

      if (user && user.isActive) {
        req.userId = user.id;
        req.user = user;
      }
    } catch {
    }

    next();
  } catch (error) {
    next();
  }
}

