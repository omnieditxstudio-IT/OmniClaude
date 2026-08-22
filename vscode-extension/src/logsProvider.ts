import * as vscode from 'vscode';
import { GatewayClient } from './client';

export class LogsProvider implements vscode.TreeDataProvider<LogTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<LogTreeItem | undefined | null | void> = new vscode.EventEmitter<LogTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<LogTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
  
  private client: GatewayClient;
  private logs: any[] = [];

  constructor(client: GatewayClient) {
    this.client = client;
  }

  updateClient(client: GatewayClient) {
    this.client = client;
  }

  setLogs(logs: any[]) {
    this.logs = logs;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: LogTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: LogTreeItem): Promise<LogTreeItem[]> {
    if (!element) {
      return this.logs.map(log => new LogTreeItem(log));
    }
    return [];
  }

  async loadLogs(params: { limit?: number } = {}) {
    try {
      this.logs = await this.client.getLogs({ limit: params.limit || 50 });
      this.refresh();
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  }
}

export class LogTreeItem extends vscode.TreeItem {
  constructor(public readonly log: any) {
    super(
      `${log.claudeModelId} → ${log.providerModelId} | ${log.latencyMs}ms | ${log.statusCode}`,
      vscode.TreeItemCollapsibleState.None
    );
    
    this.contextValue = 'log';
    this.id = log._id || log.id;
    this.tooltip = `
Model: ${log.claudeModelId} → ${log.providerModelId}
Tokens: ${log.inputTokens} in / ${log.outputTokens} out
Latency: ${log.latencyMs}ms
Status: ${log.statusCode}
Time: ${new Date(log.createdAt).toLocaleString()}
${log.error ? `Error: ${log.error}` : ''}
    `.trim();
    
    // Set icon based on status
    if (log.statusCode >= 400) {
      this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
    } else if (log.statusCode >= 300) {
      this.iconPath = new vscode.ThemeIcon('warning');
    } else {
      this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    }
    
    // Add command to view details
    this.command = {
      command: 'gateway.viewLogDetails',
      title: 'View Details',
      arguments: [this.log],
    };
  }
}