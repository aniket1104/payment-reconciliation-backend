import { Response } from 'express';
import { sendSuccess, sendError, sendPaginated } from '../../src/utils/response';

// Mock Express Response
const mockResponse = (): Response => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

describe('Response Utils', () => {
  describe('sendSuccess', () => {
    it('should send success response with data', () => {
      const res = mockResponse();
      const data = { id: 1, name: 'Test' };

      sendSuccess(res, data);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data,
          timestamp: expect.any(String),
        })
      );
    });

    it('should send success response with message', () => {
      const res = mockResponse();
      const data = { id: 1 };

      sendSuccess(res, data, 'Created successfully', 201);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data,
          message: 'Created successfully',
        })
      );
    });

    it('should use custom status code', () => {
      const res = mockResponse();

      sendSuccess(res, null, undefined, 204);

      expect(res.status).toHaveBeenCalledWith(204);
    });
  });

  describe('sendError', () => {
    it('should send error response', () => {
      const res = mockResponse();

      sendError(res, 'Something went wrong');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Something went wrong',
          timestamp: expect.any(String),
        })
      );
    });

    it('should send error with custom status code', () => {
      const res = mockResponse();

      sendError(res, 'Not found', 404);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should send error with message', () => {
      const res = mockResponse();

      sendError(res, 'Validation error', 400, 'Please check your input');

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Validation error',
          message: 'Please check your input',
        })
      );
    });
  });

  describe('sendPaginated', () => {
    it('should send paginated response', () => {
      const res = mockResponse();
      const data = [{ id: 1 }, { id: 2 }];

      sendPaginated(res, data, 1, 10, 25);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data,
          pagination: {
            page: 1,
            limit: 10,
            total: 25,
            totalPages: 3,
          },
        })
      );
    });

    it('should calculate total pages correctly', () => {
      const res = mockResponse();
      const data = [{ id: 1 }];

      sendPaginated(res, data, 2, 5, 23);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: expect.objectContaining({
            totalPages: 5, // Math.ceil(23/5) = 5
          }),
        })
      );
    });

    it('should include message if provided', () => {
      const res = mockResponse();

      sendPaginated(res, [], 1, 10, 0, 'No results found');

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No results found',
        })
      );
    });
  });
});

