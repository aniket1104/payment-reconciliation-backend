import { Request, Response, NextFunction } from 'express';

// Environment configuration type
export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  HOST: string;
  API_PREFIX: string;
  CORS_ORIGIN: string[];
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  LOG_LEVEL: string;
  DATABASE_URL: string;
  // Redis (OPTIONAL - app works without Redis)
  REDIS_HOST: string;
  REDIS_PORT: number;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Error types
export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
}

// Express extended types
export type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

// Health check response
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
}
