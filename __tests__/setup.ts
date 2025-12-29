/**
 * Jest setup file
 * This file is executed before each test file
 */

// Set test environment variables BEFORE imports
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = '*';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'error'; // Reduce logging noise during tests

import { prisma } from '../src/utils';

// Global test timeout
jest.setTimeout(30000);

// Clean up after all tests
afterAll(async () => {
  // Disconnect Prisma client
  await prisma.$disconnect();
});
