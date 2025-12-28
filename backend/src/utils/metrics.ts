import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import { createLogger } from './logger.js';

const logger = createLogger({
  screenName: 'Metrics',
  callerFunction: 'MetricsService',
});

// Prometheus 레지스트리 생성
export const register = new Registry();

// 기본 메트릭 등록
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ register });

// 커스텀 메트릭 정의
export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const aiRequestCounter = new Counter({
  name: 'ai_requests_total',
  help: 'Total number of AI API requests',
  labelNames: ['provider', 'status'],
  registers: [register],
});

export const aiRequestDuration = new Histogram({
  name: 'ai_request_duration_seconds',
  help: 'Duration of AI API requests in seconds',
  labelNames: ['provider'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const codeExecutionCounter = new Counter({
  name: 'code_executions_total',
  help: 'Total number of code executions',
  labelNames: ['type', 'status'],
  registers: [register],
});

export const codeExecutionDuration = new Histogram({
  name: 'code_execution_duration_seconds',
  help: 'Duration of code executions in seconds',
  labelNames: ['type'],
  buckets: [1, 5, 10, 30, 60, 120],
  registers: [register],
});

export const workflowCounter = new Counter({
  name: 'workflows_total',
  help: 'Total number of workflows',
  labelNames: ['status'],
  registers: [register],
});

export const activeUsersGauge = new Gauge({
  name: 'active_users',
  help: 'Number of active users',
  registers: [register],
});

export const databaseConnectionsGauge = new Gauge({
  name: 'database_connections',
  help: 'Number of database connections',
  registers: [register],
});

export const cacheHitCounter = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['type'],
  registers: [register],
});

export const cacheMissCounter = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['type'],
  registers: [register],
});

export const circuitBreakerStateGauge = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['provider'],
  registers: [register],
});

// 모든 메트릭을 레지스트리에 등록
register.registerMetric(httpRequestCounter);
register.registerMetric(httpRequestDuration);
register.registerMetric(aiRequestCounter);
register.registerMetric(aiRequestDuration);
register.registerMetric(codeExecutionCounter);
register.registerMetric(codeExecutionDuration);
register.registerMetric(workflowCounter);
register.registerMetric(activeUsersGauge);
register.registerMetric(databaseConnectionsGauge);
register.registerMetric(cacheHitCounter);
register.registerMetric(cacheMissCounter);
register.registerMetric(circuitBreakerStateGauge);

logger.info('Prometheus metrics initialized', {
  logType: 'success',
});

// 메트릭 수집 헬퍼 함수
export function recordHttpRequest(
  method: string,
  route: string,
  status: number,
  duration: number
): void {
  httpRequestCounter.inc({ method, route, status });
  httpRequestDuration.observe({ method, route, status }, duration / 1000);
}

export function recordAIRequest(
  provider: string,
  status: 'success' | 'error',
  duration: number
): void {
  aiRequestCounter.inc({ provider, status });
  aiRequestDuration.observe({ provider }, duration / 1000);
}

export function recordCodeExecution(
  type: 'python' | 'notebook' | 'javascript' | 'bash',
  status: 'success' | 'error' | 'timeout',
  duration: number
): void {
  codeExecutionCounter.inc({ type, status });
  codeExecutionDuration.observe({ type }, duration / 1000);
}

export function recordWorkflow(status: 'completed' | 'failed' | 'cancelled'): void {
  workflowCounter.inc({ status });
}

export function updateActiveUsers(count: number): void {
  activeUsersGauge.set(count);
}

export function updateDatabaseConnections(count: number): void {
  databaseConnectionsGauge.set(count);
}

export function recordCacheHit(type: string): void {
  cacheHitCounter.inc({ type });
}

export function recordCacheMiss(type: string): void {
  cacheMissCounter.inc({ type });
}

export function updateCircuitBreakerState(provider: string, state: 'closed' | 'open' | 'half-open'): void {
  const stateValue = state === 'closed' ? 0 : state === 'open' ? 1 : 2;
  circuitBreakerStateGauge.set({ provider }, stateValue);
}

