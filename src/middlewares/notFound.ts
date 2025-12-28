import { Request, Response } from 'express';

/**
 * Handle 404 - Route not found
 */
export const notFound = (_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    timestamp: new Date().toISOString(),
  });
};

export default notFound;

