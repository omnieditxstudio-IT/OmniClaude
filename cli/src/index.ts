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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..', '..');

const program = new Command();

program
  .name('gateway')
  .description('Model Translation Gateway - Use any LLM with Claude Code')
  .version('1.0.0');

program
  .command('start')
  .description('Start the gateway server')
  .option('-p, --port <port>', 'Port to run server on', '3000')
  .option('--no-dashboard', 'Don\'t open dashboard')
  .option('--host <host>', 'Host to bind to', '0.0.0.0')
  .action(async (options) => {
    const spinner = ora('Starting gateway server...').start();
    
    try {
      // Start server process
      const serverProcess = spawn('npm', ['run', 'dev:server'], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        env: { ...process.env, PORT: options.port, HOST: options.host },
      });
      
      // Wait a bit for server to start
      await new Promise(r => setTimeout(r, 3000));
      
      spinner.succeed(`Server started on http://${options.host}:${options.port}`);
      
      if (options.dashboard) {
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
      
      // Handle shutdown
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\nShutting down...'));
        serverProcess.kill('SIGINT');
        process.exit(0);
      });
      
    } catch (error) {
      spinner.fail('Failed to start server');
      console.error(error);
      process.exit(1);
    }
  });

program
  .command('dashboard')
  .description('Open the dashboard in browser')
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
  .command('config')
  .description('Manage configuration')
  .argument('<action>', 'Action: get, set, list')
  .argument('[key]', 'Config key')
  .argument('[value]', 'Config value')
  .action(async (action, key, value) => {
    // Simple config management - could be expanded
    console.log(chalk.blue('Config management not fully implemented yet'));
    console.log('Edit .env file directly for now');
  });

program
  .command('db')
  .description('Database management')
  .argument('<action>', 'Action: migrate, seed, backup')
  .action(async (action) => {
    const spinner = ora(`Running db:${action}...`).start();
    
    try {
      const child = spawn('npm', ['run', `db:${action}`], {
        cwd: join(ROOT_DIR, 'server'),
        stdio: 'inherit',
      });
      
      await new Promise((resolve, reject) => {
        child.on('close', (code) => code === 0 ? resolve(code) : reject(new Error(`Exit code ${code}`)));
      });
      
      spinner.succeed(`db:${action} completed`);
    } catch (error) {
      spinner.fail(`db:${action} failed`);
      console.error(error);
      process.exit(1);
    }
  });

program
  .command('user')
  .description('User management')
  .argument('<action>', 'Action: create, list')
  .option('-e, --email <email>', 'User email')
  .option('-n, --name <name>', 'User name')
  .action(async (action, options) => {
    console.log(chalk.blue('User management via CLI not implemented yet'));
    console.log('Use the dashboard or MongoDB directly');
  });

program
  .command('test')
  .description('Test gateway functionality')
  .argument('<type>', 'Type: mapping, endpoint')
  .argument('<id>', 'Resource ID')
  .action(async (type, id) => {
    const spinner = ora(`Testing ${type} ${id}...`).start();
    
    try {
      const response = await axios.post(`http://localhost:3000/api/${type}s/${id}/test`);
      spinner.succeed('Test completed');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      spinner.fail('Test failed');
      console.error(error.response?.data || error.message);
    }
  });

program
  .command('generate-key')
  .description('Generate a new encryption key')
  .action(() => {
    const crypto = await import('crypto');
    const key = crypto.randomBytes(32).toString('base64');
    console.log(chalk.green('New encryption key:'));
    console.log(chalk.bold(key));
    console.log(chalk.gray('\nAdd this to your .env as ENCRYPTION_KEY'));
  });

program.parse();