#!/usr/bin/env node

/**
 * MCP Test Server for Teach Niche V2
 * 
 * Provides testing capabilities through MCP interface:
 * - Run test suites with real services
 * - Execute specific tests
 * - Generate coverage reports
 * - Manage test database
 */

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

class TeachNicheTestServer {
  constructor() {
    this.tools = {
      'run-tests': this.runTests.bind(this),
      'test-specific': this.testSpecific.bind(this),
      'test-coverage': this.testCoverage.bind(this),
      'setup-test-db': this.setupTestDatabase.bind(this),
      'teardown-test-db': this.teardownTestDatabase.bind(this),
      'test-api-health': this.testApiHealth.bind(this),
      'test-database-connection': this.testDatabaseConnection.bind(this),
      'lint-check': this.lintCheck.bind(this),
      'type-check': this.typeCheck.bind(this)
    };
  }

  async handleRequest(request) {
    const { method, params } = request;
    
    if (method === 'tools/list') {
      return {
        tools: Object.keys(this.tools).map(name => ({
          name,
          description: this.getToolDescription(name),
          inputSchema: this.getToolSchema(name)
        }))
      };
    }
    
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      
      if (this.tools[name]) {
        try {
          const result = await this.tools[name](args || {});
          return {
            content: [{
              type: 'text',
              text: result
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `Error: ${error.message}`
            }],
            isError: true
          };
        }
      }
    }
    
    throw new Error(`Unknown method: ${method}`);
  }
  
  getToolDescription(name) {
    const descriptions = {
      'run-tests': 'Run the complete test suite with real services',
      'test-specific': 'Run a specific test file or pattern',
      'test-coverage': 'Generate and display test coverage report',
      'setup-test-db': 'Initialize test database with clean schema',
      'teardown-test-db': 'Clean up test database and connections',
      'test-api-health': 'Test all API health endpoints',
      'test-database-connection': 'Verify database connectivity',
      'lint-check': 'Run ESLint on all source files',
      'type-check': 'Run TypeScript type checking'
    };
    return descriptions[name] || '';
  }
  
  getToolSchema(name) {
    const schemas = {
      'run-tests': {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Test name pattern to filter' },
          verbose: { type: 'boolean', description: 'Verbose output' }
        }
      },
      'test-specific': {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Path to test file', required: true }
        },
        required: ['file']
      },
      'test-coverage': {
        type: 'object',
        properties: {
          threshold: { type: 'number', description: 'Coverage threshold (default: 90)' }
        }
      }
    };
    return schemas[name] || { type: 'object' };
  }

  async runTests(args) {
    const { pattern, verbose } = args;
    
    try {
      // Start test services
      await this.startTestServices();
      
      // Build test command
      let cmd = 'pnpm test';
      if (pattern) {
        cmd += ` -- --testNamePattern="${pattern}"`;
      }
      if (verbose) {
        cmd += ' --verbose';
      }
      
      const { stdout, stderr } = await execAsync(cmd);
      
      // Stop test services
      await this.stopTestServices();
      
      return `Test Results:\n${stdout}\n${stderr ? `Errors:\n${stderr}` : ''}`;
    } catch (error) {
      await this.stopTestServices();
      throw error;
    }
  }

  async testSpecific(args) {
    const { file } = args;
    
    if (!file) {
      throw new Error('File path is required');
    }
    
    try {
      await this.startTestServices();
      
      const { stdout, stderr } = await execAsync(`pnpm test "${file}"`);
      
      await this.stopTestServices();
      
      return `Test Results for ${file}:\n${stdout}\n${stderr ? `Errors:\n${stderr}` : ''}`;
    } catch (error) {
      await this.stopTestServices();
      throw error;
    }
  }

  async testCoverage(args) {
    const { threshold = 90 } = args;
    
    try {
      await this.startTestServices();
      
      const { stdout, stderr } = await execAsync('pnpm test:coverage');
      
      // Check coverage threshold
      const coverageMatch = stdout.match(/All files\s+\|\s+(\d+\.?\d*)/);
      const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : 0;
      
      await this.stopTestServices();
      
      let result = `Coverage Report:\n${stdout}`;
      
      if (coverage < threshold) {
        result += `\n❌ Coverage ${coverage}% is below threshold ${threshold}%`;
      } else {
        result += `\n✅ Coverage ${coverage}% meets threshold ${threshold}%`;
      }
      
      return result;
    } catch (error) {
      await this.stopTestServices();
      throw error;
    }
  }

  async setupTestDatabase() {
    try {
      // Start database service
      await execAsync('docker-compose -f docker-compose.test.yml up -d postgres-test');
      
      // Wait for database
      await this.waitForDatabase();
      
      // Run migrations
      await execAsync('pnpm turbo run db:push --filter=@teach-niche/database');
      
      return '✅ Test database setup complete';
    } catch (error) {
      throw new Error(`Failed to setup test database: ${error.message}`);
    }
  }

  async teardownTestDatabase() {
    try {
      await execAsync('docker-compose -f docker-compose.test.yml down');
      return '✅ Test database teardown complete';
    } catch (error) {
      throw new Error(`Failed to teardown test database: ${error.message}`);
    }
  }

  async testApiHealth() {
    try {
      // Start API in test mode
      const api = spawn('pnpm', ['run', 'dev:api'], {
        env: { ...process.env, NODE_ENV: 'test' },
        detached: false
      });
      
      // Wait for API to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Test health endpoints
      const { stdout } = await execAsync('curl -s http://localhost:8080/health || echo "Health check failed"');
      
      // Kill API process
      api.kill();
      
      return `API Health Check:\n${stdout}`;
    } catch (error) {
      throw new Error(`API health check failed: ${error.message}`);
    }
  }

  async testDatabaseConnection() {
    try {
      const { stdout } = await execAsync('pg_isready -h localhost -p 5433 -U testuser');
      return `✅ Database connection successful:\n${stdout}`;
    } catch (error) {
      return `❌ Database connection failed:\n${error.message}`;
    }
  }

  async lintCheck() {
    try {
      const { stdout, stderr } = await execAsync('pnpm turbo run lint');
      return `Lint Results:\n${stdout}\n${stderr || ''}`;
    } catch (error) {
      return `Lint failed:\n${error.message}`;
    }
  }

  async typeCheck() {
    try {
      const { stdout, stderr } = await execAsync('pnpm turbo run check-types');
      return `Type Check Results:\n${stdout}\n${stderr || ''}`;
    } catch (error) {
      return `Type check failed:\n${error.message}`;
    }
  }

  async startTestServices() {
    await execAsync('docker-compose -f docker-compose.test.yml up -d');
    await this.waitForDatabase();
    await this.waitForRedis();
  }

  async stopTestServices() {
    try {
      await execAsync('docker-compose -f docker-compose.test.yml down');
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  async waitForDatabase() {
    for (let i = 0; i < 30; i++) {
      try {
        await execAsync('pg_isready -h localhost -p 5433 -U testuser');
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Database failed to start');
  }

  async waitForRedis() {
    for (let i = 0; i < 30; i++) {
      try {
        await execAsync('redis-cli -p 6380 ping');
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Redis failed to start');
  }
}

// MCP Server Protocol
process.stdin.setEncoding('utf8');
process.stdout.setEncoding('utf8');

const server = new TeachNicheTestServer();

let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const request = JSON.parse(line);
        server.handleRequest(request)
          .then(response => {
            console.log(JSON.stringify(response));
          })
          .catch(error => {
            console.log(JSON.stringify({
              error: {
                code: -1,
                message: error.message
              }
            }));
          });
      } catch (error) {
        console.log(JSON.stringify({
          error: {
            code: -2,
            message: 'Invalid JSON'
          }
        }));
      }
    }
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});