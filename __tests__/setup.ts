/**
 * Jest setup file
 * This file is executed before each test file
 */

import { prisma } from '../src/utils';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'error'; // Reduce logging noise during tests

// Global test timeout
jest.setTimeout(30000);

// Clean up after all tests
afterAll(async () => {
  // Disconnect Prisma client
  await prisma.$disconnect();
});
