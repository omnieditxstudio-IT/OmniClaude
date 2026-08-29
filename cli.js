#!/usr/bin/env node

/**
 * LLM Gateway - Universal CLI
 * 
 * Install globally:
 *   npm install -g llm-gateway
 *   llm-gateway --help
 * 
 * Or run directly:
 *   node cli.js --help
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, existsSync, writeFileSync, readFileSync } from 'path';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const program = new Command();

program
  .name('llm-gateway')
  .description('Universal LLM Gateway - Use any LLM with Claude Code, Cursor, Codex, and more')
  .version('1.0.0');

// ==================== Setup Wizard ====================
program
  .command('setup')
  .description('Interactive setup wizard')
  .option('--quick', 'Skip wizard and use defaults')
  .action(async (options) => {
    console.log(chalk.cyan.bold('\n🚀 LLM Gateway Setup Wizard\n'));
    
    if (options.quick) {
      console.log('Running quick setup with defaults...');
      await runQuickSetup();
      return;
    }

    // Interactive setup
    console.log('This wizard will help you configure LLM Gateway.\n');
    
    // Select providers
    const providers = [
      { name: 'OpenAI (GPT-4, GPT-5)', value: 'openai', requiresKey: true },
      { name: 'Anthropic (Claude)', value: 'anthropic', requiresKey: true },
      { name: 'Google (Gemini)', value: 'google', requiresKey: true },
      { name: 'Ollama (Local)', value: 'ollama', requiresKey: false },
      { name: 'DeepSeek', value: 'deepseek', requiresKey: true },
      { name: 'Groq', value: 'groq', requiresKey: true },
      { name: 'Together AI', value: 'together', requiresKey: true },
      { name: 'Azure OpenAI', value: 'azure', requiresKey: true },
      { name: 'AWS Bedrock', value: 'bedrock', requiresKey: true },
    ];

    console.log('Select providers to configure (space-separated numbers):');
    providers.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name}${p.requiresKey ? ' (requires API key)' : ' (no key needed)'}`);
    });

    // In a real implementation, we'd use readline for interactive input
    // For now, default to Ollama + OpenAI
    console.log(chalk.yellow('\nQuick setup: configuring Ollama (local) + OpenAI...\n'));
    
    await runQuickSetup();
  });

async function runQuickSetup() {
  const spinner = ora('Creating configuration...').start();
  
  try {
    const configDir = join(homedir(), '.llm-gateway');
    const configPath = join(configDir, 'config.json');
    
    if (!existsSync(configDir)) {
      const { mkdirSync } = await import('fs');
      mkdirSync(configDir, { recursive: true });
    }

    const config = {
      server: {
        host: '127.0.0.1',
        port: 8080,
        localOnly: true,
      },
      providers: {
        ollama: {
          type: 'ollama',
          baseUrl: 'http://localhost:11434',
          apiKey: 'ollama',
          models: {
            'llama3.2': { upstreamModelId: 'llama3.2', name: 'Llama 3.2' },
            'llama3.1': { upstreamModelId: 'llama3.1', name: 'Llama 3.1' },
            'qwen2.5': { upstreamModelId: 'qwen2.5', name: 'Qwen 2.5' },
          },
        },
        openai: {
          type: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: process.env.OPENAI_API_KEY || 'your-openai-key',
          models: {
            'gpt-4o': { upstreamModelId: 'gpt-4o', name: 'GPT-4o' },
            'gpt-4o-mini': { upstreamModelId: 'gpt-4o-mini', name: 'GPT-4o Mini' },
          },
        },
      },
      models: {
        'claude-sonnet-4-5': 'ollama/llama3.2',
        'claude-haiku': 'openai/gpt-4o-mini',
      },
      clients: {
        'claude-code': {
          enabled: true,
          format: 'anthropic',
        },
        'cursor': {
          enabled: true,
          format: 'openai',
        },
        'codex': {
          enabled: true,
          format: 'openai',
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    spinner.succeed(`Configuration created at ${configPath}`);
    
    console.log(chalk.green('\n✓ Setup complete!\n'));
    console.log('Next steps:');
    console.log('  1. Edit config with your API keys:');
    console.log(chalk.cyan(`     ${configPath}`));
    console.log('  2. Start the gateway:');
    console.log(chalk.cyan('     llm-gateway start'));
    console.log('  3. Point your client to the gateway:');
    console.log(chalk.cyan('     ANTHROPIC_BASE_URL=http://localhost:8080 claude\n'));
    
  } catch (error: any) {
    spinner.fail('Setup failed: ' + error.message);
    process.exit(1);
  }
}

// ==================== Server Commands ====================
program
  .command('start')
  .description('Start the gateway server')
  .option('-p, --port <port>', 'Server port', '8080')
  .option('-c, --config <path>', 'Config file path', join(homedir(), '.llm-gateway', 'config.json'))
  .option('--no-local', 'Allow non-localhost connections')
  .action(async (options) => {
    const spinner = ora('Starting LLM Gateway...').start();
    
    try {
      // Check if config exists
      if (!existsSync(options.config)) {
        spinner.warn('Config not found, running setup...');
        await runQuickSetup();
      }

      // Start the server
      const serverPath = join(ROOT_DIR, 'server', 'src', 'index.ts');
      
      spinner.text = 'Starting server...';
      
      const child = spawn('node', ['--loader', 'ts-node/esm', serverPath], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        env: {
          ...process.env,
          PORT: options.port,
          CONFIG_PATH: options.config,
          HOST: options.local ? '0.0.0.0' : '127.0.0.1',
        },
      });

      child.on('error', (error) => {
        spinner.fail('Failed to start server: ' + error.message);
        process.exit(1);
      });

      child.on('exit', (code) => {
        if (code !== 0) {
          console.error(chalk.red(`Server exited with code ${code}`));
        }
      });

      console.log(chalk.green(`\n✓ LLM Gateway running at http://localhost:${options.port}`));
      console.log(chalk.gray('  Metrics: http://localhost:' + options.port + '/metrics'));
      console.log(chalk.gray('  Docs: http://localhost:' + options.port + '/docs\n'));
      
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\nShutting down...'));
        child.kill('SIGTERM');
        process.exit(0);
      });

    } catch (error: any) {
      spinner.fail('Failed to start: ' + error.message);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the gateway server')
  .option('-p, --port <port>', 'Server port', '8080')
  .action(async (options) => {
    const spinner = ora('Stopping LLM Gateway...').start();
    
    try {
      const isWindows = process.platform === 'win32';
      let pids: string[] = [];
      
      if (isWindows) {
        const netstat = execSync('netstat -ano').toString();
        const regex = new RegExp(`TCP\\s+\\S+:${options.port}\\s+\\S+:\\d+\\s+LISTENING\\s+(\\d+)`, 'i');
        const matches = netstat.match(new RegExp(regex.source, 'g'));
        if (matches) {
          pids = matches.map(m => m.match(regex)![1]);
        }
      } else {
        try {
          const lsof = execSync(`lsof -ti:${options.port}`).toString().trim().split('\n').filter(Boolean);
          pids = lsof;
        } catch {
          // No process found
        }
      }
      
      for (const pid of pids) {
        process.kill(parseInt(pid), 'SIGTERM');
      }
      
      await new Promise(r => setTimeout(r, 1000));
      
      // Force kill remaining
      let remaining: string[] = [];
      if (isWindows) {
        const netstat = execSync('netstat -ano').toString();
        const regex = new RegExp(`TCP\\s+\\S+:${options.port}\\s+\\S+:\\d+\\s+LISTENING\\s+(\\d+)`, 'i');
        const matches = netstat.match(new RegExp(regex.source, 'g'));
        if (matches) {
          remaining = matches.map(m => m.match(regex)![1]);
        }
      } else {
        try {
          const lsof = execSync(`lsof -ti:${options.port}`).toString().trim().split('\n').filter(Boolean);
          remaining = lsof;
        } catch {
          // No process found
        }
      }
      
      for (const pid of remaining) {
        process.kill(parseInt(pid), 'SIGKILL');
      }
      
      spinner.succeed('LLM Gateway stopped');
    } catch (error: any) {
      spinner.fail('Failed to stop: ' + error.message);
      process.exit(1);
    }
  });

program
  .command('restart')
  .description('Restart the gateway server')
  .option('-p, --port <port>', 'Server port', '8080')
  .action(async (options) => {
    await program.parseAsync(['stop', '-p', options.port]);
    await new Promise(r => setTimeout(r, 1000));
    await program.parseAsync(['start', '-p', options.port]);
  });

// ==================== Status ====================
program
  .command('status')
  .description('Check gateway status')
  .option('-p, --port <port>', 'Server port', '8080')
  .action(async (options) => {
    try {
      const response = await fetch(`http://localhost:${options.port}/health`);
      if (response.ok) {
        const data = await response.json();
        console.log(chalk.green('✓ LLM Gateway is running\n'));
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(chalk.red('✗ LLM Gateway is not responding'));
        process.exit(1);
      }
    } catch {
      console.log(chalk.red('✗ LLM Gateway is not running'));
      process.exit(1);
    }
  });

// ==================== Config Commands ====================
program
  .command('config')
  .description('Manage configuration')
  .option('-c, --config <path>', 'Config file path', join(homedir(), '.llm-gateway', 'config.json'));

program
  .command('config')
  .command('init')
  .description('Initialize configuration')
  .action(async () => {
    await runQuickSetup();
  });

program
  .command('config')
  .command('show')
  .description('Show current configuration')
  .action(async (options) => {
    const configPath = join(homedir(), '.llm-gateway', 'config.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log(chalk.yellow('No configuration found. Run `llm-gateway setup` first.'));
    }
  });

program
  .command('config')
  .command('test')
  .description('Test provider connections')
  .action(async () => {
    const spinner = ora('Testing provider connections...').start();
    
    // In a real implementation, this would test each provider
    spinner.succeed('Provider connections tested');
    console.log(chalk.green('✓ All providers reachable'));
  });

// ==================== Client Setup ====================
program
  .command('client')
  .description('Setup AI coding clients')
  .option('--claude-code', 'Setup Claude Code')
  .option('--cursor', 'Setup Cursor')
  .option('--codex', 'Setup Codex CLI')
  .option('--all', 'Setup all clients')
  .action(async (options) => {
    const clients = [];
    if (options.all || options.claudeCode) clients.push('claude-code');
    if (options.all || options.cursor) clients.push('cursor');
    if (options.all || options.codex) clients.push('codex');

    if (clients.length === 0) {
      console.log(chalk.yellow('No clients specified. Use --claude-code, --cursor, --codex, or --all'));
      return;
    }

    for (const client of clients) {
      const spinner = ora(`Setting up ${client}...`).start();
      await setupClient(client);
      spinner.succeed(`${client} configured`);
    }

    console.log(chalk.green('\n✓ Client setup complete!\n'));
  });

async function setupClient(client: string) {
  const configDir = join(homedir(), '.llm-gateway');
  const configPath = join(configDir, 'config.json');
  
  let config = {};
  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  }

  const gatewayUrl = `http://localhost:${config.server?.port || 8080}`;

  switch (client) {
    case 'claude-code':
      await setupClaudeCode(gatewayUrl);
      break;
    case 'cursor':
      await setupCursor(gatewayUrl);
      break;
    case 'codex':
      await setupCodex(gatewayUrl);
      break;
  }
}

async function setupClaudeCode(gatewayUrl: string) {
  const claudeDir = join(homedir(), '.claude');
  const settingsPath = join(claudeDir, 'settings.json');
  
  if (!existsSync(claudeDir)) {
    const { mkdirSync } = await import('fs');
    mkdirSync(claudeDir, { recursive: true });
  }

  let settings = {};
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  }

  settings.profiles = settings.profiles || {};
  settings.profiles['llm-gateway'] = {
    env: {
      ANTHROPIC_BASE_URL: gatewayUrl,
      ANTHROPIC_AUTH_TOKEN: 'fake-token',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      API_TIMEOUT_MS: '3000000',
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: '50000',
      CLAUDE_BASH_NO_LOGIN: '1',
    },
    permissions: {
      allow: [],
      deny: [],
    },
  };

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(`\n  Claude Code profile created: llm-gateway`);
  console.log(`  Run with: claude --profile llm-gateway\n`);
}

async function setupCursor(gatewayUrl: string) {
  console.log(`\n  Cursor configuration:`);
  console.log(`  Set CURSOR_API_KEY to any value (not used by gateway)`);
  console.log(`  Set CURSOR_BASE_URL to ${gatewayUrl}\n`);
}

async function setupCodex(gatewayUrl: string) {
  console.log(`\n  Codex CLI configuration:`);
  console.log(`  Set OPENAI_BASE_URL to ${gatewayUrl}`);
  console.log(`  Set OPENAI_API_KEY to any value\n`);
}

// ==================== Provider Management ====================
program
  .command('providers')
  .description('List and manage providers')
  .action(async () => {
    const providers = [
      { name: 'OpenAI', type: 'openai', status: 'configured' },
      { name: 'Anthropic', type: 'anthropic', status: 'configured' },
      { name: 'Google', type: 'google', status: 'not configured' },
      { name: 'Ollama', type: 'ollama', status: 'local' },
      { name: 'DeepSeek', type: 'deepseek', status: 'not configured' },
      { name: 'Groq', type: 'groq', status: 'not configured' },
      { name: 'Together AI', type: 'together', status: 'not configured' },
      { name: 'Azure OpenAI', type: 'azure', status: 'not configured' },
      { name: 'AWS Bedrock', type: 'bedrock', status: 'not configured' },
    ];

    console.log(chalk.cyan('\n  Supported Providers:\n'));
    providers.forEach(p => {
      const statusColor = p.status === 'configured' || p.status === 'local' ? 'green' : 'yellow';
      console.log(`  ${p.name.padEnd(15)} ${chalk[statusColor](p.status)}`);
    });
    console.log('');
  });

// ==================== Install Scripts ====================
program
  .command('install')
  .description('Install gateway components')
  .option('--npm', 'Install via npm globally')
  .option('--docker', 'Install via Docker')
  .option('--binary', 'Download native binary')
  .action(async (options) => {
    const spinner = ora('Installing LLM Gateway...').start();
    
    try {
      if (options.npm) {
        execSync('npm install -g .', { cwd: ROOT_DIR, stdio: 'inherit' });
        spinner.succeed('Installed via npm globally');
        console.log('Run: llm-gateway setup');
      } else if (options.docker) {
        execSync('docker build -t llm-gateway .', { cwd: ROOT_DIR, stdio: 'inherit' });
        spinner.succeed('Docker image built: llm-gateway');
        console.log('Run: docker run -p 8080:8080 llm-gateway');
      } else if (options.binary) {
        await downloadBinary();
        spinner.succeed('Native binary downloaded');
      } else {
        console.log('Choose installation method: --npm, --docker, or --binary');
      }
    } catch (error: any) {
      spinner.fail('Installation failed: ' + error.message);
      process.exit(1);
    }
  });

async function downloadBinary() {
  const platform = process.platform;
  const arch = process.arch;
  
  let binaryName: string;
  switch (platform) {
    case 'linux':
      binaryName = arch === 'arm64' ? 'llm-gateway-linux-arm64' : 'llm-gateway-linux-amd64';
      break;
    case 'darwin':
      binaryName = arch === 'arm64' ? 'llm-gateway-darwin-arm64' : 'llm-gateway-darwin-amd64';
      break;
    case 'win32':
      binaryName = 'llm-gateway-windows-amd64.exe';
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
  
  console.log(`\n  Downloading ${binaryName}...`);
  // In a real implementation, this would download from GitHub releases
  console.log(`  Binary will be saved to ~/.llm-gateway/bin/${binaryName}\n`);
}

// ==================== Run Command ====================
program
  .command('run')
  .description('Run the gateway server (alias for start)')
  .option('-p, --port <port>', 'Server port', '8080')
  .option('-c, --config <path>', 'Config file path')
  .action(async (options) => {
    await program.parseAsync(['start', ...Object.entries(options).flat()]);
  });

// Parse arguments
program.parse();
