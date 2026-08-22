import * as vscode from 'vscode';
import { GatewayClient } from './client';

export class GatewayTreeProvider implements vscode.TreeDataProvider<GatewayTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<GatewayTreeItem | undefined | null | void> = new vscode.EventEmitter<GatewayTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<GatewayTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
  
  private client: GatewayClient;
  private config: any;
  private items: GatewayTreeItem[] = [];

  constructor(client: GatewayClient, config: any) {
    this.client = client;
    this.config = config;
  }

  updateClient(client: GatewayClient) {
    this.client = client;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: GatewayTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GatewayTreeItem): Promise<GatewayTreeItem[]> {
    if (!element) {
      // Root level
      return this.getRootItems();
    }
    
    // Child items based on parent
    return this.getChildItems(element);
  }

  private async getRootItems(): Promise<GatewayTreeItem[]> {
    this.items = [];
    
    // Gateway Status
    const isRunning = await this.checkGatewayRunning();
    this.items.push(new GatewayTreeItem(
      isRunning ? '$(play) Gateway Running' : '$(circle-slash) Gateway Stopped',
      vscode.TreeItemCollapsibleState.None,
      'status',
      isRunning ? 'gateway.running' : 'gateway.stopped'
    ));
    
    // Quick Actions
    this.items.push(new GatewayTreeItem(
      '$(gear) Configuration',
      vscode.TreeItemCollapsibleState.None,
      'config',
      'gateway.config'
    ));
    
    // Endpoints
    this.items.push(new GatewayTreeItem(
      '$(server) Endpoints',
      vscode.TreeItemCollapsibleState.Collapsed,
      'endpoints',
      'gateway.endpoints'
    ));
    
    // Model Mappings
    this.items.push(new GatewayTreeItem(
      '$(symbol-method) Model Mappings',
      vscode.TreeItemCollapsibleState.Collapsed,
      'mappings',
      'gateway.mappings'
    ));
    
    // API Keys
    this.items.push(new GatewayTreeItem(
      '$(key) API Keys',
      vscode.TreeItemCollapsibleState.Collapsed,
      'keys',
      'gateway.keys'
    ));
    
    // Analytics
    this.items.push(new GatewayTreeItem(
      '$(graph) Analytics',
      vscode.TreeItemCollapsibleState.Collapsed,
      'analytics',
      'gateway.analytics'
    ));
    
    // Actions
    this.items.push(new GatewayTreeItem(
      '$(play) Start Gateway',
      vscode.TreeItemCollapsibleState.None,
      'start',
      'gateway.start'
    ));
    
    this.items.push(new GatewayTreeItem(
      '$(debug-stop) Stop Gateway',
      vscode.TreeItemCollapsibleState.None,
      'stop',
      'gateway.stop'
    ));
    
    this.items.push(new GatewayTreeItem(
      '$(globe) Open Dashboard',
      vscode.TreeItemCollapsibleState.None,
      'dashboard',
      'gateway.dashboard'
    ));
    
    return this.items;
  }

  private async getChildItems(element: GatewayTreeItem): Promise<GatewayTreeItem[]> {
    const children: GatewayTreeItem[] = [];
    
    switch (element.contextValue) {
      case 'endpoints':
        try {
          const endpoints = await this.client.getEndpoints();
          for (const endpoint of endpoints) {
            children.push(new GatewayTreeItem(
              `${endpoint.isActive ? '$(check)' : '$(circle-slash)'} ${endpoint.name} (${endpoint.provider})`,
              vscode.TreeItemCollapsibleState.None,
              'endpoint',
              `gateway.endpoint.${endpoint.id}`,
              {
                command: 'gateway.testEndpoint',
                title: 'Test Endpoint',
                arguments: [endpoint.id],
              }
            ));
          }
        } catch {
          children.push(new GatewayTreeItem(
            '$(error) Failed to load endpoints',
            vscode.TreeItemCollapsibleState.None,
            'error',
            ''
          ));
        }
        break;
        
      case 'mappings':
        try {
          const mappings = await this.client.getMappings();
          for (const mapping of mappings) {
            children.push(new GatewayTreeItem(
              `${mapping.isDefault ? '$(star-full)' : '$(star)'} ${mapping.name} ${mapping.isActive ? '' : '$(circle-slash)'}`,
              vscode.TreeItemCollapsibleState.None,
              'mapping',
              `gateway.mapping.${mapping.id}`,
              {
                command: 'gateway.testMapping',
                title: 'Test Mapping',
                arguments: [mapping.id],
              }
            ));
          }
        } catch {
          children.push(new GatewayTreeItem(
            '$(error) Failed to load mappings',
            vscode.TreeItemCollapsibleState.None,
            'error',
            ''
          ));
        }
        break;
        
      case 'keys':
        try {
          const keys = await this.client.getKeys();
          for (const key of keys) {
            children.push(new GatewayTreeItem(
              `${key.isActive ? '$(key)' : '$(lock)'} ${key.name} (${key.provider}) - ${key.keyHash}`,
              vscode.TreeItemCollapsibleState.None,
              'key',
              `gateway.key.${key.id}`,
            ));
          }
        } catch {
          children.push(new GatewayTreeItem(
            '$(error) Failed to load keys',
            vscode.TreeItemCollapsibleState.None,
            'error',
            ''
          ));
        }
        break;
        
      case 'analytics':
        children.push(new GatewayTreeItem(
          '$(graph) View Metrics',
          vscode.TreeItemCollapsibleState.None,
          'analytics',
          'gateway.metrics',
          {
            command: 'gateway.showMetrics',
            title: 'Show Metrics',
          }
        ));
        children.push(new GatewayTreeItem(
          '$(output) View Logs',
          vscode.TreeItemCollapsibleState.None,
          'logs',
          'gateway.logs',
          {
            command: 'gateway.showLogs',
            title: 'Show Logs',
          }
        ));
        break;
    }
    
    return children;
  }

  private async checkGatewayRunning(): Promise<boolean> {
    try {
      await this.client.healthCheck();
      return true;
    } catch {
      return false;
    }
  }
}

export class GatewayTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly id: string,
    public readonly command?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
    this.id = id;
    this.command = command;
    
    // Set icon based on context
    if (contextValue === 'status') {
      this.iconPath = new vscode.ThemeIcon(this.label.includes('Running') ? 'check' : 'circle-slash');
    } else if (contextValue === 'endpoint') {
      this.iconPath = new vscode.ThemeIcon('server');
    } else if (contextValue === 'mapping') {
      this.iconPath = new vscode.ThemeIcon('symbol-method');
    } else if (contextValue === 'key') {
      this.iconPath = new vscode.ThemeIcon('key');
    }
    
    // Add tooltip
    this.tooltip = label;
  }
}