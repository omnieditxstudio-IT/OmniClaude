import * as vscode from 'vscode';

export class ConfigurationManager {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  getServerUrl(): string {
    return vscode.workspace.getConfiguration('gateway').get<string>('serverUrl') || 'http://localhost:3000';
  }

  async setServerUrl(url: string): Promise<void> {
    await vscode.workspace.getConfiguration('gateway').update('serverUrl', url, vscode.ConfigurationTarget.Global);
  }

  getAutoStart(): boolean {
    return vscode.workspace.getConfiguration('gateway').get<boolean>('autoStart') || false;
  }

  async setAutoStart(enabled: boolean): Promise<void> {
    await vscode.workspace.getConfiguration('gateway').update('autoStart', enabled, vscode.ConfigurationTarget.Global);
  }

  getClaudeCodeIntegration(): boolean {
    return vscode.workspace.getConfiguration('gateway').get<boolean>('claudeCodeIntegration') || true;
  }

  async setClaudeCodeIntegration(enabled: boolean): Promise<void> {
    await vscode.workspace.getConfiguration('gateway').update('claudeCodeIntegration', enabled, vscode.ConfigurationTarget.Global);
  }

  getShowNotifications(): boolean {
    return vscode.workspace.getConfiguration('gateway').get<boolean>('showNotifications') || true;
  }

  async setShowNotifications(enabled: boolean): Promise<void> {
    await vscode.workspace.getConfiguration('gateway').update('showNotifications', enabled, vscode.ConfigurationTarget.Global);
  }

  getDashboardPort(): number {
    return vscode.workspace.getConfiguration('gateway').get<number>('dashboardPort') || 5173;
  }

  async setDashboardPort(port: number): Promise<void> {
    await vscode.workspace.getConfiguration('gateway').update('dashboardPort', port, vscode.ConfigurationTarget.Global);
  }

  getConfiguration(key: string): any {
    return vscode.workspace.getConfiguration('gateway').get(key);
  }

  async setConfiguration(key: string, value: any): Promise<void> {
    await vscode.workspace.getConfiguration('gateway').update(key, value, vscode.ConfigurationTarget.Global);
  }

  getAuthToken(): string | undefined {
    return this.context.globalState.get<string>('gateway.authToken');
  }

  async setAuthToken(token: string): Promise<void> {
    await this.context.globalState.update('gateway.authToken', token);
  }

  async clearAuthToken(): Promise<void> {
    await this.context.globalState.update('gateway.authToken', undefined);
  }
}