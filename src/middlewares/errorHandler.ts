import { Request, Response, NextFunction } from 'express';
import { AppError, logger } from '../utils';
import { env } from '../config';

/**
 * Global error handling middleware
 */
export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Default error values
  let statusCode = 500;
  let message = 'Internal Server Error';
  let isOperational = false;

  // Check if it's our custom AppError
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  }

  // Log error
  if (!isOperational) {
    logger.error('Unhandled Error:', err);
  } else {
    logger.warn(`Operational Error: ${message}`);
  }

  // Send response
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(env.NODE_ENV === 'development' && {
      stack: err.stack,
    }),
    timestamp: new Date().toISOString(),
  });
};

export default errorHandler;
