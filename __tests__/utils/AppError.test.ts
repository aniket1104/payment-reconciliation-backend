import { AppError } from '../../src/utils/AppError';

describe('AppError', () => {
  describe('constructor', () => {
    it('should create an error with message and status code', () => {
      const error = new AppError('Test error', 400);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    it('should create a non-operational error', () => {
      const error = new AppError('Internal error', 500, false);

      expect(error.isOperational).toBe(false);
    });

    it('should be an instance of Error', () => {
      const error = new AppError('Test', 400);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test', 400);

      expect(error.stack).toBeDefined();
    });
  });

  describe('static methods', () => {
    it('should create bad request error', () => {
      const error = AppError.badRequest('Invalid input');

      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
    });

    it('should create unauthorized error', () => {
      const error = AppError.unauthorized();

      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Unauthorized');
    });

    it('should create unauthorized error with custom message', () => {
      const error = AppError.unauthorized('Invalid token');

      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Invalid token');
    });

    it('should create forbidden error', () => {
      const error = AppError.forbidden();

      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Forbidden');
    });

    it('should create not found error', () => {
      const error = AppError.notFound();

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Resource not found');
    });

    it('should create not found error with custom message', () => {
      const error = AppError.notFound('User not found');

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('User not found');
    });

    it('should create conflict error', () => {
      const error = AppError.conflict('Already exists');

      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Already exists');
    });

    it('should create too many requests error', () => {
      const error = AppError.tooManyRequests();

      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('Too many requests');
    });

    it('should create internal error as non-operational', () => {
      const error = AppError.internal();

      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });
  });
});

