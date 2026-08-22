import * as vscode from 'vscode';
import { GatewayClient } from './client';
import { GatewayTreeProvider } from './treeProvider';
import { LogsProvider } from './logsProvider';
import { ConfigurationManager } from './config';

let gatewayClient: GatewayClient;
let treeProvider: GatewayTreeProvider;
let logsProvider: LogsProvider;
let configManager: ConfigurationManager;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let isGatewayRunning = false;
let gatewayProcess: any = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('Model Translation Gateway extension activated');
  
  // Initialize services
  configManager = new ConfigurationManager(context);
  gatewayClient = new GatewayClient(configManager.getServerUrl());
  treeProvider = new GatewayTreeProvider(gatewayClient, configManager);
  logsProvider = new LogsProvider(gatewayClient);
  outputChannel = vscode.window.createOutputChannel('Model Translation Gateway');
  
  // Register tree views
  vscode.window.registerTreeDataProvider('gateway.status', treeProvider);
  vscode.window.registerTreeDataProvider('gateway.endpoints', treeProvider);
  vscode.window.registerTreeDataProvider('gateway.mappings', treeProvider);
  vscode.window.registerTreeDataProvider('gateway.logs', logsProvider);
  
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'gateway.openDashboard';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('gateway.start', startGateway),
    vscode.commands.registerCommand('gateway.stop', stopGateway),
    vscode.commands.registerCommand('gateway.restart', restartGateway),
    vscode.commands.registerCommand('gateway.configure', configureGateway),
    vscode.commands.registerCommand('gateway.openDashboard', openDashboard),
    vscode.commands.registerCommand('gateway.test', testGateway),
    vscode.commands.registerCommand('gateway.showLogs', showLogs),
    vscode.commands.registerCommand('gateway.showMetrics', showMetrics)
  );
  
  // Auto-start if configured
  if (configManager.getAutoStart()) {
    startGateway();
  }
  
  // Register configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('gateway.serverUrl')) {
        gatewayClient = new GatewayClient(configManager.getServerUrl());
        treeProvider.updateClient(gatewayClient);
        logsProvider.updateClient(gatewayClient);
      }
      if (e.affectsConfiguration('gateway.autoStart')) {
        // Auto-start will apply on next restart
      }
    })
  );
  
  // Periodic status check
  const statusCheckInterval = setInterval(async () => {
    if (isGatewayRunning) {
      try {
        await gatewayClient.healthCheck();
        updateStatusBar(true);
      } catch {
        updateStatusBar(false);
        isGatewayRunning = false;
        treeProvider.refresh();
      }
    }
  }, 30000);
  
  context.subscriptions.push({ dispose: () => clearInterval(statusCheckInterval) });
  
  // Auto-configure Claude Code if enabled
  if (configManager.getClaudeCodeIntegration()) {
    configureClaudeCode();
  }
}

export function deactivate() {
  if (gatewayProcess) {
    gatewayProcess.kill();
  }
  if (statusBarItem) {
    statusBarItem.dispose();
  }
  if (outputChannel) {
    outputChannel.dispose();
  }
}

async function startGateway(): Promise<void> {
  if (isGatewayRunning) {
    vscode.window.showInformationMessage('Gateway is already running');
    return;
  }
  
  try {
    outputChannel.appendLine('Starting Model Translation Gateway...');
    
    // Start gateway using npm script
    const terminal = vscode.window.createTerminal({
      name: 'Model Translation Gateway',
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    });
    
    terminal.show();
    terminal.sendText('npm run cli -- start');
    
    // Wait a bit and check health
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      await gatewayClient.healthCheck();
      isGatewayRunning = true;
      updateStatusBar(true);
      treeProvider.refresh();
      logsProvider.refresh();
      
      vscode.window.showInformationMessage('Gateway started successfully!');
      
      // Configure Claude Code if enabled
      if (configManager.getClaudeCodeIntegration()) {
        await configureClaudeCode();
      }
    } catch {
      vscode.window.showErrorMessage('Gateway started but health check failed. Check terminal for errors.');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to start gateway: ${error}`);
  }
}

async function stopGateway(): Promise<void> {
  if (!isGatewayRunning) {
    vscode.window.showInformationMessage('Gateway is not running');
    return;
  }
  
  try {
    outputChannel.appendLine('Stopping Model Translation Gateway...');
    
    // Try graceful shutdown via API
    try {
      await gatewayClient.stop();
    } catch {
      // Ignore API errors
    }
    
    // Kill terminal if exists
    // Note: VS Code doesn't provide direct terminal killing, user needs to close manually
    
    isGatewayRunning = false;
    updateStatusBar(false);
    treeProvider.refresh();
    
    vscode.window.showInformationMessage('Gateway stopped');
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to stop gateway: ${error}`);
  }
}

async function restartGateway(): Promise<void> {
  await stopGateway();
  await new Promise(resolve => setTimeout(resolve, 1000));
  await startGateway();
}

async function configureGateway(): Promise<void> {
  const serverUrl = await vscode.window.showInputBox({
    prompt: 'Enter Gateway Server URL',
    value: configManager.getServerUrl(),
    placeHolder: 'http://localhost:3000',
  });
  
  if (serverUrl) {
    await configManager.setServerUrl(serverUrl);
    gatewayClient = new GatewayClient(serverUrl);
    treeProvider.updateClient(gatewayClient);
    logsProvider.updateClient(gatewayClient);
    vscode.window.showInformationMessage('Gateway URL updated');
  }
  
  // Show configuration options
  const options = [
    { label: 'Auto-start on VS Code launch', value: 'autoStart' },
    { label: 'Claude Code integration', value: 'claudeCodeIntegration' },
    { label: 'Show notifications', value: 'showNotifications' },
  ];
  
  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: 'Select configuration to toggle',
    canPickMany: true,
  });
  
  if (selected) {
    for (const option of selected) {
      const current = configManager.getConfiguration(option.value);
      await configManager.setConfiguration(option.value, !current);
    }
    vscode.window.showInformationMessage('Configuration updated');
  }
}

async function openDashboard(): Promise<void> {
  const url = `${configManager.getServerUrl()}/docs`;
  vscode.env.openExternal(vscode.Uri.parse(url));
}

async function testGateway(): Promise<void> {
  try {
    outputChannel.appendLine('Testing gateway connection...');
    const health = await gatewayClient.healthCheck();
    
    if (health.status === 'ok') {
      vscode.window.showInformationMessage('Gateway is healthy! ✓');
      outputChannel.appendLine('Gateway health check passed');
    } else {
      vscode.window.showWarningMessage('Gateway responded but status is not OK');
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Gateway test failed: ${error}`);
    outputChannel.appendLine(`Test failed: ${error}`);
  }
}

async function showLogs(): Promise<void> {
  try {
    const logs = await gatewayClient.getLogs({ limit: 50 });
    logsProvider.setLogs(logs);
    logsProvider.refresh();
    
    // Show logs in output channel
    outputChannel.clear();
    outputChannel.appendLine('=== Recent Requests ===');
    for (const log of logs) {
      outputChannel.appendLine(
        `[${new Date(log.createdAt).toLocaleTimeString()}] ${log.claudeModelId} -> ${log.providerModelId} | ${log.latencyMs}ms | ${log.statusCode}`
      );
    }
    outputChannel.show();
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to fetch logs: ${error}`);
  }
}

async function showMetrics(): Promise<void> {
  try {
    const metrics = await gatewayClient.getAnalytics();
    
    const message = `
Gateway Metrics:
- Total Requests: ${metrics.totalRequests}
- Input Tokens: ${metrics.totalInputTokens.toLocaleString()}
- Output Tokens: ${metrics.totalOutputTokens.toLocaleString()}
- Avg Latency: ${metrics.avgLatencyMs}ms
- Success Rate: ${metrics.successRate.toFixed(1)}%
    `.trim();
    
    vscode.window.showInformationMessage(message, { modal: true });
    outputChannel.appendLine(message);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to fetch metrics: ${error}`);
  }
}

async function configureClaudeCode(): Promise<void> {
  const claudeCodeConfig = vscode.workspace.getConfiguration('claude-code');
  const gatewayUrl = configManager.getServerUrl();
  
  // Update Claude Code settings
  await claudeCodeConfig.update('apiBaseUrl', gatewayUrl, vscode.ConfigurationTarget.Global);
  await claudeCodeConfig.update('apiKey', 'gateway-user-key', vscode.ConfigurationTarget.Global);
  
  outputChannel.appendLine('Configured Claude Code to use gateway');
  vscode.window.showInformationMessage('Claude Code configured to use Model Translation Gateway');
}

function updateStatusBar(running: boolean): void {
  if (running) {
    statusBarItem.text = '$(play) Gateway Running';
    statusBarItem.tooltip = 'Model Translation Gateway is running. Click to open dashboard.';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
  } else {
    statusBarItem.text = '$(circle-slash) Gateway Stopped';
    statusBarItem.tooltip = 'Model Translation Gateway is stopped. Click to start.';
    statusBarItem.backgroundColor = undefined;
  }
}