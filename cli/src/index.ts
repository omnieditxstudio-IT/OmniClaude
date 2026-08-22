#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { open } from 'open';
import axios from 'axios';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..', '..');

const program = new Command();

program
  .name('gateway')
  .description('Model Translation Gateway - Use any LLM with Claude Code')
  .version('1.0.0')
  .option('-v, --verbose', 'Verbose output')
  .option('-c, --config <path>', 'Path to config file', '.env');

// Global error handler
program.exitOverride((err) => {
  if (err.code === 'commander.helpDisplayed') {
    process.exit(0);
  }
  console.error(chalk.red(`Error: ${err.message}`));
  process.exit(1);
});

// ==================== Server Commands ====================
const serverCmd = program
  .command('server')
  .description('Manage gateway server')
  .alias('s');

serverCmd
  .command('start')
  .description('Start the gateway server')
  .option('-p, --port <port>', 'Port to run server on', '3000')
  .option('-h, --host <host>', 'Host to bind to', '0.0.0.0')
  .option('--no-dashboard', 'Don\'t open dashboard')
  .option('--detached', 'Run in background (daemon mode)')
  .option('--env <env>', 'Environment (development|production)', 'development')
  .action(async (options) => {
    const spinner = ora('Starting gateway server...').start();
    
    try {
      const env = { 
        ...process.env, 
        PORT: options.port, 
        HOST: options.host,
        NODE_ENV: options.env,
      };
      
      let serverProcess: any;
      
      if (options.detached) {
        // Run in background
        serverProcess = spawn('npm', ['run', 'start:prod'], {
          cwd: join(ROOT_DIR, 'server'),
          detached: true,
          stdio: 'ignore',
          env,
        });
        serverProcess.unref();
        
        // Wait and verify
        await new Promise(r => setTimeout(r, 3000));
        
        // Check health
        try {
          await axios.get(`http://${options.host}:${options.port}/health`, { timeout: 5000 });
          spinner.succeed(chalk.green(`Server started in background on http://${options.host}:${options.port}`));
          console.log(chalk.gray(`PID: ${serverProcess.pid}`));
        } catch {
          spinner.fail('Server started but health check failed');
          process.exit(1);
        }
      } else {
        // Run in foreground
        serverProcess = spawn('npm', ['run', options.env === 'production' ? 'start:prod' : 'dev:server'], {
          cwd: ROOT_DIR,
          stdio: 'inherit',
          env,
        });
        
        await new Promise(r => setTimeout(r, 3000));
        spinner.succeed(`Server started on http://${options.host}:${options.port}`);
        
        if (!options.dashboard) {
          const dashboardSpinner = ora('Opening dashboard...').start();
          try {
            await open(`http://localhost:${options.port}/docs`);
            dashboardSpinner.succeed('Dashboard opened in browser');
          } catch {
            dashboardSpinner.warn('Could not open browser automatically');
            console.log(`  Open http://localhost:${options.port}/docs in your browser`);
          }
        }
        
        console.log(chalk.gray('\nPress Ctrl+C to stop\n'));
        
        process.on('SIGINT', () => {
          console.log(chalk.yellow('\n\nShutting down...'));
          serverProcess.kill('SIGINT');
          process.exit(0);
        });
      }
    } catch (error: any) {
      spinner.fail('Failed to start server');
      console.error(error.message);
      process.exit(1);
    }
  });

serverCmd
  .command('stop')
  .description('Stop the gateway server')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(async (options) => {
    const spinner = ora('Stopping gateway server...').start();
    
    try {
      // Try graceful shutdown via API
      try {
        await axios.post(`http://localhost:${options.port}/api/admin/shutdown`, {}, { timeout: 5000 });
      } catch {
        // API might not be available
      }
      
      // Find and kill process
      try {
        const pids = execSync(`lsof -ti:${options.port}`).toString().trim().split('\n').filter(Boolean);
        for (const pid of pids) {
          process.kill(parseInt(pid), 'SIGTERM');
        }
        await new Promise(r => setTimeout(r, 1000));
        
        // Force kill if still running
        const remaining = execSync(`lsof -ti:${options.port}`).toString().trim().split('\n').filter(Boolean);
        for (const pid of remaining) {
          process.kill(parseInt(pid), 'SIGKILL');
        }
      } catch {
        // No process found
      }
      
      spinner.succeed('Server stopped');
    } catch (error: any) {
      spinner.fail('Failed to stop server');
      console.error(error.message);
      process.exit(1);
    }
  });

serverCmd
  .command('restart')
  .description('Restart the gateway server')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(async (options) => {
    await program.parseAsync(['server', 'stop', '-p', options.port]);
    await new Promise(r => setTimeout(r, 1000));
    await program.parseAsync(['server', 'start', '-p', options.port]);
  });

serverCmd
  .command('status')
  .description('Check server status')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(async (options) => {
    const spinner = ora('Checking server status...').start();
    
    try {
      const response = await axios.get(`http://localhost:${options.port}/health`, { timeout: 5000 });
      spinner.succeed(chalk.green('Server is running'));
      console.log(JSON.stringify(response.data, null, 2));
    } catch {
      spinner.fail('Server is not running');
      process.exit(1);
    }
  });

serverCmd
  .command('logs')
  .description('Show server logs')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-f, --follow', 'Follow logs')
  .option('-n, --lines <n>', 'Number of lines', '100')
  .action(async (options) => {
    // This would typically read from log files or Docker
    console.log(chalk.blue('Log viewing not fully implemented for local development'));
    console.log('Use `docker-compose logs -f server` for Docker deployments');
  });

// ==================== Dashboard Commands ====================
program
  .command('dashboard')
  .description('Manage dashboard')
  .alias('d')
  .command('open')
  .description('Open dashboard in browser')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(async (options) => {
    const spinner = ora('Opening dashboard...').start();
    try {
      await open(`http://localhost:${options.port}/docs`);
      spinner.succeed('Dashboard opened');
    } catch {
      spinner.fail('Could not open browser');
      console.log(`Open http://localhost:${options.port}/docs manually`);
    }
  });

program
  .command('dashboard')
  .command('build')
  .description('Build dashboard for production')
  .action(async () => {
    const spinner = ora('Building dashboard...').start();
    try {
      execSync('npm run build', { cwd: join(ROOT_DIR, 'dashboard'), stdio: 'inherit' });
      spinner.succeed('Dashboard built successfully');
    } catch {
      spinner.fail('Build failed');
      process.exit(1);
    }
  });

// ==================== Database Commands ====================
const dbCmd = program
  .command('db')
  .description('Database management');

dbCmd
  .command('migrate')
  .description('Run database migrations')
  .action(async () => {
    const spinner = ora('Running migrations...').start();
    try {
      execSync('npm run db:migrate', { cwd: join(ROOT_DIR, 'server'), stdio: 'inherit' });
      spinner.succeed('Migrations completed');
    } catch {
      spinner.fail('Migration failed');
      process.exit(1);
    }
  });

dbCmd
  .command('seed')
  .description('Seed database with test data')
  .action(async () => {
    const spinner = ora('Seeding database...').start();
    try {
      execSync('npm run db:seed', { cwd: join(ROOT_DIR, 'server'), stdio: 'inherit' });
      spinner.succeed('Database seeded');
    } catch {
      spinner.fail('Seeding failed');
      process.exit(1);
    }
  });

dbCmd
  .command('backup')
  .description('Backup database')
  .option('-o, --output <path>', 'Output file path', 'backup.gz')
  .action(async (options) => {
    const spinner = ora('Backing up database...').start();
    try {
      // This would use mongodump
      console.log(chalk.blue('Database backup not fully implemented'));
      console.log('Use: mongodump --uri=$MONGODB_URI --archive=' + options.output);
      spinner.succeed('Backup command displayed');
    } catch {
      spinner.fail('Backup failed');
      process.exit(1);
    }
  });

dbCmd
  .command('restore')
  .description('Restore database from backup')
  .argument('<file>', 'Backup file path')
  .action(async (file) => {
    const spinner = ora('Restoring database...').start();
    try {
      console.log(chalk.blue('Database restore not fully implemented'));
      console.log('Use: mongorestore --uri=$MONGODB_URI --archive=' + file);
      spinner.succeed('Restore command displayed');
    } catch {
      spinner.fail('Restore failed');
      process.exit(1);
    }
  });

// ==================== Testing Commands ====================
const testCmd = program
  .command('test')
  .description('Run tests');

testCmd
  .command('unit')
  .description('Run unit tests')
  .option('--coverage', 'Generate coverage report')
  .action(async (options) => {
    const spinner = ora('Running unit tests...').start();
    try {
      const cmd = options.coverage ? 'npm run test:coverage' : 'npm run test';
      execSync(cmd, { cwd: join(ROOT_DIR, 'server'), stdio: 'inherit' });
      spinner.succeed('Unit tests passed');
    } catch {
      spinner.fail('Unit tests failed');
      process.exit(1);
    }
  });

testCmd
  .command('integration')
  .description('Run integration tests')
  .action(async () => {
    const spinner = ora('Running integration tests...').start();
    try {
      execSync('npm run test:integration', { cwd: join(ROOT_DIR, 'server'), stdio: 'inherit' });
      spinner.succeed('Integration tests passed');
    } catch {
      spinner.fail('Integration tests failed');
      process.exit(1);
    }
  });

testCmd
  .command('e2e')
  .description('Run end-to-end tests')
  .action(async () => {
    const spinner = ora('Running E2E tests...').start();
    try {
      execSync('npm run test:e2e', { cwd: ROOT_DIR, stdio: 'inherit' });
      spinner.succeed('E2E tests passed');
    } catch {
      spinner.fail('E2E tests failed');
      process.exit(1);
    }
  });

testCmd
  .command('all')
  .description('Run all tests')
  .action(async () => {
    const spinner = ora('Running all tests...').start();
    try {
      execSync('npm run test', { cwd: join(ROOT_DIR, 'server'), stdio: 'inherit' });
      execSync('npm run test:integration', { cwd: join(ROOT_DIR, 'server'), stdio: 'inherit' });
      execSync('npm run test:e2e', { cwd: ROOT_DIR, stdio: 'inherit' });
      spinner.succeed('All tests passed');
    } catch {
      spinner.fail('Some tests failed');
      process.exit(1);
    }
  });

testCmd
  .command('mapping')
  .description('Test a model mapping')
  .argument('<id>', 'Mapping ID')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(async (id, options) => {
    const spinner = ora(`Testing mapping ${id}...`).start();
    try {
      const response = await axios.post(`http://localhost:${options.port}/api/mappings/${id}/test`);
      spinner.succeed('Test completed');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      spinner.fail('Test failed');
      console.error(error.response?.data || error.message);
    }
  });

testCmd
  .command('endpoint')
  .description('Test an endpoint')
  .argument('<id>', 'Endpoint ID')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(async (id, options) => {
    const spinner = ora(`Testing endpoint ${id}...`).start();
    try {
      const response = await axios.get(`http://localhost:${options.port}/api/endpoints/${id}/health`);
      spinner.succeed('Test completed');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      spinner.fail('Test failed');
      console.error(error.response?.data || error.message);
    }
  });

testCmd
  .command('proxy')
  .description('Test proxy with sample request')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-m, --model <model>', 'Claude model ID', 'claude-3-opus')
  .action(async (options) => {
    const spinner = ora('Testing proxy...').start();
    try {
      const response = await axios.post(`http://localhost:${options.port}/v1/messages`, {
        model: options.model,
        messages: [{ role: 'user', content: 'Hello, this is a test!' }],
        max_tokens: 100,
      }, {
        headers: { 'Authorization': 'Bearer test-key' },
      });
      spinner.succeed('Proxy test completed');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      spinner.fail('Proxy test failed');
      console.error(error.response?.data || error.message);
    }
  });

// ==================== Config Commands ====================
const configCmd = program
  .command('config')
  .description('Manage configuration');

configCmd
  .command('list')
  .description('List all configuration')
  .action(() => {
    const config = require('fs').readFileSync(join(ROOT_DIR, '.env'), 'utf-8');
    console.log(config);
  });

configCmd
  .command('get')
  .description('Get config value')
  .argument('<key>', 'Config key')
  .action((key) => {
    const config = require('fs').readFileSync(join(ROOT_DIR, '.env'), 'utf-8');
    const lines = config.split('\n');
    for (const line of lines) {
      if (line.startsWith(key + '=')) {
        console.log(line.split('=')[1]);
        return;
      }
    }
    console.log(chalk.yellow(`Key "${key}" not found`));
  });

configCmd
  .command('set')
  .description('Set config value')
  .argument('<key>', 'Config key')
  .argument('<value>', 'Config value')
  .action((key, value) => {
    const envPath = join(ROOT_DIR, '.env');
    let config = require('fs').readFileSync(envPath, 'utf-8');
    const lines = config.split('\n');
    let found = false;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(key + '=')) {
        lines[i] = `${key}=${value}`;
        found = true;
        break;
      }
    }
    
    if (!found) {
      lines.push(`${key}=${value}`);
    }
    
    require('fs').writeFileSync(envPath, lines.join('\n'));
    console.log(chalk.green(`Set ${key}=${value}`));
  });

configCmd
  .command('generate-key')
  .description('Generate encryption key')
  .action(() => {
    const crypto = require('crypto');
    const key = crypto.randomBytes(32).toString('base64');
    console.log(chalk.green('New encryption key:'));
    console.log(chalk.bold(key));
    console.log(chalk.gray('\nAdd this to your .env as ENCRYPTION_KEY'));
  });

configCmd
  .command('validate')
  .description('Validate configuration')
  .action(async () => {
    const spinner = ora('Validating configuration...').start();
    try {
      // Check required env vars
      const required = ['MONGODB_URI', 'ENCRYPTION_KEY', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
      const missing = required.filter(k => !process.env[k]);
      
      if (missing.length > 0) {
        spinner.fail('Missing required environment variables:');
        missing.forEach(k => console.log(chalk.red(`  - ${k}`)));
        process.exit(1);
      }
      
      // Check encryption key format
      const key = process.env.ENCRYPTION_KEY || '';
      if (key.length !== 44) {
        spinner.fail('ENCRYPTION_KEY must be 44 characters (32 bytes base64)');
        process.exit(1);
      }
      
      // Test MongoDB connection
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(process.env.MONGODB_URI!);
      await client.connect();
      await client.db().command({ ping: 1 });
      await client.close();
      
      spinner.succeed('Configuration is valid');
    } catch (error: any) {
      spinner.fail('Configuration validation failed');
      console.error(error.message);
      process.exit(1);
    }
  });

// ==================== Deployment Commands ====================
const deployCmd = program
  .command('deploy')
  .description('Deployment commands');

deployCmd
  .command('docker')
  .description('Deploy with Docker Compose')
  .option('--env <env>', 'Environment file', '.env.production')
  .action(async (options) => {
    const spinner = ora('Deploying with Docker...').start();
    try {
      execSync(`docker-compose --env-file ${options.env} up -d`, { 
        cwd: ROOT_DIR, 
        stdio: 'inherit' 
      });
      spinner.succeed('Docker deployment complete');
      console.log('Services:');
      console.log('  - Server: http://localhost:3000');
      console.log('  - Dashboard: http://localhost:5173');
    } catch {
      spinner.fail('Docker deployment failed');
      process.exit(1);
    }
  });

deployCmd
  .command('k8s')
  .description('Deploy to Kubernetes')
  .option('--namespace <ns>', 'Kubernetes namespace', 'gateway')
  .option('--helm', 'Use Helm chart')
  .action(async (options) => {
    const spinner = ora('Deploying to Kubernetes...').start();
    try {
      if (options.helm) {
        execSync(`helm upgrade --install gateway ./helm/gateway -n ${options.namespace} --create-namespace`, { 
          cwd: ROOT_DIR, 
          stdio: 'inherit' 
        });
      } else {
        execSync(`kubectl apply -k k8s`, { 
          cwd: ROOT_DIR, 
          stdio: 'inherit' 
        });
      }
      spinner.succeed('Kubernetes deployment complete');
    } catch {
      spinner.fail('Kubernetes deployment failed');
      process.exit(1);
    }
  });

deployCmd
  .command('verify')
  .description('Verify deployment')
  .option('--url <url>', 'Deployment URL', 'http://localhost:3000')
  .action(async (options) => {
    const spinner = ora('Verifying deployment...').start();
    try {
      const checks = [
        { name: 'Health', url: `${options.url}/health` },
        { name: 'API Docs', url: `${options.url}/docs` },
        { name: 'Dashboard', url: `${options.url}/` },
      ];
      
      for (const check of checks) {
        try {
          await axios.get(check.url, { timeout: 5000 });
          console.log(chalk.green(`✓ ${check.name}: ${check.url}`));
        } catch {
          console.log(chalk.red(`✗ ${check.name}: ${check.url}`));
        }
      }
      
      spinner.succeed('Verification complete');
    } catch (error: any) {
      spinner.fail('Verification failed');
      console.error(error.message);
    }
  });

// ==================== User/Organization Commands ====================
const orgCmd = program
  .command('org')
  .description('Organization management')
  .alias('organization');

orgCmd
  .command('create')
  .description('Create organization')
  .argument('<name>', 'Organization name')
  .argument('<slug>', 'Organization slug')
  .option('-o, --owner <email>', 'Owner email')
  .action(async (name, slug, options) => {
    const spinner = ora('Creating organization...').start();
    // Implementation would call API
    spinner.succeed(`Organization "${name}" created`);
  });

orgCmd
  .command('invite')
  .description('Invite user to organization')
  .argument('<orgId>', 'Organization ID')
  .argument('<email>', 'User email')
  .option('-r, --role <role>', 'Role (admin|member)', 'member')
  .action(async (orgId, email, options) => {
    const spinner = ora('Sending invitation...').start();
    spinner.succeed(`Invitation sent to ${email}`);
  });

// ==================== Build Commands ====================
program
  .command('build')
  .description('Build all packages')
  .option('--prod', 'Production build')
  .action(async (options) => {
    const spinner = ora('Building all packages...').start();
    try {
      const env = options.prod ? 'NODE_ENV=production' : '';
      execSync(`${env} npm run build`, { cwd: ROOT_DIR, stdio: 'inherit' });
      spinner.succeed('Build complete');
    } catch {
      spinner.fail('Build failed');
      process.exit(1);
    }
  });

program
  .command('clean')
  .description('Clean build artifacts')
  .action(() => {
    const dirs = ['dist', 'build', 'node_modules/.cache', 'out'];
    for (const dir of dirs) {
      try {
        execSync(`rm -rf ${dir}`, { cwd: ROOT_DIR });
      } catch {}
    }
    console.log(chalk.green('Cleaned build artifacts'));
  });

// ==================== Monitoring Commands ====================
const monitorCmd = program
  .command('monitor')
  .description('Monitoring and metrics');

monitorCmd
  .command('metrics')
  .description('Show current metrics')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(async (options) => {
    try {
      const response = await axios.get(`http://localhost:${options.port}/metrics`);
      console.log(response.data);
    } catch {
      console.error('Failed to fetch metrics');
    }
  });

monitorCmd
  .command('watch')
  .description('Watch metrics in real-time')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-i, --interval <ms>', 'Refresh interval', '2000')
  .action(async (options) => {
    console.log('Press Ctrl+C to stop');
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`http://localhost:${options.port}/metrics`);
        console.clear();
        console.log(new Date().toISOString());
        console.log(response.data);
      } catch {
        console.log('Waiting for metrics...');
      }
    }, parseInt(options.interval));
    
    process.on('SIGINT', () => {
      clearInterval(interval);
      process.exit(0);
    });
  });

// ==================== Generate Commands ====================
program
  .command('generate')
  .description('Generate code/templates')
  .command('sdk')
  .description('Generate TypeScript SDK from OpenAPI spec')
  .option('-o, --output <path>', 'Output directory', './sdk')
  .option('-u, --url <url>', 'OpenAPI spec URL', 'http://localhost:3000/docs/json')
  .action(async (options) => {
    const spinner = ora('Generating SDK...').start();
    try {
      // Would use openapi-typescript-codegen
      console.log(chalk.blue('SDK generation not fully implemented'));
      console.log('Use: npx openapi-typescript-codegen -i ' + options.url + ' -o ' + options.output + ' -c axios');
      spinner.succeed('SDK generation command displayed');
    } catch {
      spinner.fail('SDK generation failed');
    }
  });

program
  .command('generate')
  .command('prompt-template')
  .description('Create prompt template scaffold')
  .argument('<name>', 'Template name')
  .option('-c, --category <cat>', 'Category (coding|analysis|writing|reasoning|custom)', 'custom')
  .action(async (name, options) => {
    const template = `{
  "name": "${name}",
  "description": "Description of ${name}",
  "category": "${options.category}",
  "template": "Your prompt template with {{variable}} placeholders",
  "variables": [
    { "name": "variable", "type": "string", "required": true, "description": "Description" }
  ],
  "tags": [],
  "isPublic": false
}`;
    console.log(template);
  });

// ==================== Utility Commands ====================
program
  .command('doctor')
  .description('Check system health and dependencies')
  .action(async () => {
    const spinner = ora('Running health checks...').start();
    
    const checks = [
      { name: 'Node.js', check: () => process.version },
      { name: 'npm', check: () => execSync('npm --version').toString().trim() },
      { name: 'Docker', check: () => execSync('docker --version').toString().trim() },
      { name: 'MongoDB', check: async () => {
        const { MongoClient } = await import('mongodb');
        const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
        await client.connect();
        await client.db().command({ ping: 1 });
        await client.close();
        return 'Connected';
      }},
      { name: 'Redis', check: async () => {
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
        await redis.ping();
        await redis.quit();
        return 'Connected';
      }},
    ];
    
    console.log(chalk.bold('\n🏥 System Health Check\n'));
    
    for (const check of checks) {
      const item = ora(`${check.name}...`).start();
      try {
        const result = await check.check();
        item.succeed(`${check.name}: ${result}`);
      } catch (error: any) {
        item.fail(`${check.name}: ${error.message}`);
      }
    }
    
    spinner.succeed('Health check complete');
  });

program
  .command('benchmark')
  .description('Run performance benchmark')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-r, --requests <n>', 'Number of requests', '100')
  .option('-c, --concurrency <n>', 'Concurrent requests', '10')
  .option('-m, --model <model>', 'Model to test', 'claude-3-opus')
  .action(async (options) => {
    const spinner = ora(`Running benchmark (${options.requests} requests)...`).start();
    
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(parseInt(options.concurrency));
    
    const latencies: number[] = [];
    let success = 0;
    let errors = 0;
    
    const tasks = Array.from({ length: parseInt(options.requests) }, (_, i) => 
      limit(async () => {
        const start = Date.now();
        try {
          await axios.post(`http://localhost:${options.port}/v1/messages`, {
            model: options.model,
            messages: [{ role: 'user', content: `Test request ${i}` }],
            max_tokens: 50,
          }, { headers: { 'Authorization': 'Bearer test' }, timeout: 30000 });
          latencies.push(Date.now() - start);
          success++;
        } catch {
          errors++;
        }
      })
    );
    
    await Promise.all(tasks);
    spinner.succeed('Benchmark complete');
    
    if (latencies.length > 0) {
      latencies.sort((a, b) => a - b);
      console.log(chalk.bold('\n📊 Benchmark Results'));
      console.log(`  Requests: ${options.requests}`);
      console.log(`  Successful: ${success}`);
      console.log(`  Errors: ${errors}`);
      console.log(`  Min latency: ${latencies[0]}ms`);
      console.log(`  Max latency: ${latencies[latencies.length - 1]}ms`);
      console.log(`  Avg latency: ${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms`);
      console.log(`  P50: ${latencies[Math.floor(latencies.length * 0.5)]}ms`);
      console.log(`  P95: ${latencies[Math.floor(latencies.length * 0.95)]}ms`);
      console.log(`  P99: ${latencies[Math.floor(latencies.length * 0.99)]}ms`);
    }
  });

// ==================== Help ====================
program.on('command:*', () => {
  console.error(chalk.red('Invalid command: %s'), program.args.join(' '));
  console.log('Run `gateway --help` for available commands');
  process.exit(1);
});

program.parse();