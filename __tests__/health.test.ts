import request from 'supertest';
import { createApp } from '../src/app';
import { Application } from 'express';

describe('Health Endpoints', () => {
  let app: Application;

  beforeAll(() => {
    app = createApp();
  });

  describe('GET /api/v1/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('status', 'healthy');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('uptime');
      expect(response.body.data).toHaveProperty('environment');
      expect(response.body.data).toHaveProperty('version');
    });

    it('should return correct content type', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('should return readiness status', async () => {
      const response = await request(app).get('/api/v1/health/ready');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('ready', true);
      expect(response.body.data).toHaveProperty('checks');
    });

    it('should include all dependency checks', async () => {
      const response = await request(app).get('/api/v1/health/ready');

      expect(response.body.data.checks).toHaveProperty('server', true);
    });
  });

  describe('GET /api/v1/health/live', () => {
    it('should return liveness status', async () => {
      const response = await request(app).get('/api/v1/health/live');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('alive', true);
    });
  });
});

