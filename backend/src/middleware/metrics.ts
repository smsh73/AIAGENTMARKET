import { Request, Response, NextFunction } from 'express';
import { recordHttpRequest } from '../utils/metrics.js';

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  const route = req.route?.path || req.path;

  // 응답 종료 시 메트릭 기록
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const method = req.method;
    const status = res.statusCode;

    recordHttpRequest(method, route, status, duration);
  });

  next();
}

