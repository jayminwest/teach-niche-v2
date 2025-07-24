/**
 * Jest test setup configuration.
 * 
 * @description Global test setup for API integration tests.
 * Configures environment variables, database connections, and test utilities
 * following the project's real-data testing philosophy.
 */

import { config } from 'dotenv';
import path from 'path';

// Load environment variables from root .env file
config({ path: path.resolve(__dirname, '../../../../.env') });

// Ensure test environment
process.env.NODE_ENV = 'test';

// Set longer timeout for integration tests
jest.setTimeout(30000);

// Global test configuration
beforeAll(async () => {
  // Any global setup can go here
});

afterAll(async () => {
  // Any global cleanup can go here
});