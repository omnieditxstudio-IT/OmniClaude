import mongoose, { Document, Schema } from 'mongoose';

// User model (extends Better-Auth user)
export interface IUser extends Document {
  _id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: 'google' | 'github';
  providerId: string;
  organizationId?: string;
  teamIds?: string[];
  role?: 'owner' | 'admin' | 'member';
  settings: {
    theme: 'light' | 'dark' | 'system';
    defaultProvider?: string;
    requestTimeout: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  avatar: { type: String },
  provider: { type: String, enum: ['google', 'github'], required: true },
  providerId: { type: String, required: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
  teamIds: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  settings: {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    defaultProvider: { type: String },
    requestTimeout: { type: Number, default: 60000 },
  },
}, {
  timestamps: true,
  collection: 'users',
});

UserSchema.index({ provider: 1, providerId: 1 }, { unique: true });
UserSchema.index({ organizationId: 1 });

export const User = mongoose.model<IUser>('User', UserSchema);

// Organization model
export interface IOrganization extends Document {
  _id: string;
  name: string;
  slug: string;
  ownerId: string;
  avatar?: string;
  billingEmail?: string;
  settings: {
    allowPublicSignUp: boolean;
    defaultTeamId?: string;
    usageLimits?: {
      monthlyRequests?: number;
      monthlyTokens?: number;
      monthlyCostUsd?: number;
    };
    retentionDays?: number;
  };
  subscription?: {
    plan: 'free' | 'pro' | 'enterprise';
    status: 'active' | 'canceled' | 'past_due';
    currentPeriodEnd?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>({
  name: { type: String, required: true, maxlength: 100 },
  slug: { type: String, required: true, unique: true, lowercase: true, match: /^[a-z0-9-]+$/ },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  avatar: { type: String },
  billingEmail: { type: String },
  settings: {
    allowPublicSignUp: { type: Boolean, default: false },
    defaultTeamId: { type: Schema.Types.ObjectId, ref: 'Team' },
    usageLimits: {
      monthlyRequests: { type: Number },
      monthlyTokens: { type: Number },
      monthlyCostUsd: { type: Number },
    },
    retentionDays: { type: Number, default: 90 },
  },
  subscription: {
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    status: { type: String, enum: ['active', 'canceled', 'past_due'], default: 'active' },
    currentPeriodEnd: { type: Date },
  },
}, {
  timestamps: true,
  collection: 'organizations',
});

OrganizationSchema.index({ ownerId: 1 });
OrganizationSchema.index({ slug: 1 }, { unique: true });

export const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);

// Team model
export interface ITeam extends Document {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  members: ITeamMember[];
  settings: {
    isPrivate: boolean;
    allowedModels?: string[];
    allowedEndpoints?: string[];
    budgetLimit?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ITeamMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
}

const TeamMemberSchema = new Schema<ITeamMember>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const TeamSchema = new Schema<ITeam>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 500 },
  members: [TeamMemberSchema],
  settings: {
    isPrivate: { type: Boolean, default: true },
    allowedModels: [{ type: String }],
    allowedEndpoints: [{ type: String }],
    budgetLimit: { type: Number },
  },
}, {
  timestamps: true,
  collection: 'teams',
});

TeamSchema.index({ organizationId: 1, name: 1 }, { unique: true });
TeamSchema.index({ 'members.userId': 1 });

export const Team = mongoose.model<ITeam>('Team', TeamSchema);

// API Key model (encrypted at rest)
export interface IApiKey extends Document {
  _id: string;
  userId?: string;
  organizationId?: string;
  teamId?: string;
  name: string;
  provider: 'openrouter' | 'vertex' | 'ollama' | 'custom' | 'anthropic';
  keyEncrypted: string;
  keyHash: string;
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', index: true },
  name: { type: String, required: true, maxlength: 100 },
  provider: { 
    type: String, 
    enum: ['openrouter', 'vertex', 'ollama', 'custom', 'anthropic'], 
    required: true 
  },
  keyEncrypted: { type: String, required: true },
  keyHash: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  lastUsedAt: { type: Date },
}, {
  timestamps: true,
  collection: 'api_keys',
});

ApiKeySchema.index({ userId: 1, provider: 1 });
ApiKeySchema.index({ organizationId: 1, provider: 1 });
ApiKeySchema.index({ teamId: 1, provider: 1 });

export const ApiKey = mongoose.model<IApiKey>('ApiKey', ApiKeySchema);

// Endpoint model
export interface IEndpointModel {
  id: string;
  name: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
  pricing?: {
    inputPer1k: number;
    outputPer1k: number;
    currency: 'USD';
  };
}

export interface IEndpointConfig {
  timeout: number;
  maxRetries: number;
  headers?: Record<string, string>;
  ollamaOptions?: {
    numCtx?: number;
    temperature?: number;
  };
}

export interface IEndpoint extends Document {
  _id: string;
  userId?: string;
  organizationId?: string;
  teamId?: string;
  name: string;
  provider: 'openrouter' | 'vertex' | 'ollama' | 'custom' | 'anthropic';
  baseUrl: string;
  apiKeyId: string;
  models: IEndpointModel[];
  config: IEndpointConfig;
  isActive: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

const EndpointModelSchema = new Schema<IEndpointModel>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  contextWindow: { type: Number, required: true },
  supportsTools: { type: Boolean, default: false },
  supportsVision: { type: Boolean, default: false },
  pricing: {
    inputPer1k: { type: Number },
    outputPer1k: { type: Number },
    currency: { type: String, default: 'USD' },
  },
}, { _id: false });

const EndpointConfigSchema = new Schema<IEndpointConfig>({
  timeout: { type: Number, default: 60000, min: 1000, max: 300000 },
  maxRetries: { type: Number, default: 3, min: 0, max: 10 },
  headers: { type: Schema.Types.Mixed },
  ollamaOptions: {
    numCtx: { type: Number },
    temperature: { type: Number },
  },
}, { _id: false });

const EndpointSchema = new Schema<IEndpoint>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', index: true },
  name: { type: String, required: true, maxlength: 100 },
  provider: { 
    type: String, 
    enum: ['openrouter', 'vertex', 'ollama', 'custom', 'anthropic'], 
    required: true 
  },
  baseUrl: { type: String, required: true },
  apiKeyId: { type: Schema.Types.ObjectId, ref: 'ApiKey', required: true },
  models: [EndpointModelSchema],
  config: { type: EndpointConfigSchema, default: {} },
  isActive: { type: Boolean, default: true },
  priority: { type: Number, default: 0 },
}, {
  timestamps: true,
  collection: 'endpoints',
});

EndpointSchema.index({ userId: 1, isActive: 1 });
EndpointSchema.index({ organizationId: 1, isActive: 1 });
EndpointSchema.index({ teamId: 1, isActive: 1 });

export const Endpoint = mongoose.model<IEndpoint>('Endpoint', EndpointSchema);

// Model Mapping model
export interface IFallbackEntry {
  endpointId: string;
  providerModelId: string;
  priority: number;
}

export interface IMappingOverride {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
}

export interface IModelMappingEntry {
  claudeModelId: string;
  endpointId: string;
  providerModelId: string;
  overrides?: IMappingOverride;
  fallbacks?: IFallbackEntry[];
}

export interface IModelMapping extends Document {
  _id: string;
  userId?: string;
  organizationId?: string;
  teamId?: string;
  name: string;
  description?: string;
  mappings: IModelMappingEntry[];
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FallbackEntrySchema = new Schema<IFallbackEntry>({
  endpointId: { type: String, required: true },
  providerModelId: { type: String, required: true },
  priority: { type: Number, required: true, min: 0 },
}, { _id: false });

const MappingOverrideSchema = new Schema<IMappingOverride>({
  temperature: { type: Number, min: 0, max: 2 },
  maxTokens: { type: Number, min: 1, max: 100000 },
  systemPrompt: { type: String },
  tools: [{
    type: { type: String, enum: ['function'] },
    function: {
      name: { type: String, required: true },
      description: { type: String },
      parameters: { type: Schema.Types.Mixed },
    },
  }],
}, { _id: false });

const ModelMappingEntrySchema = new Schema<IModelMappingEntry>({
  claudeModelId: { type: String, required: true },
  endpointId: { type: String, required: true },
  providerModelId: { type: String, required: true },
  overrides: { type: MappingOverrideSchema },
  fallbacks: [FallbackEntrySchema],
}, { _id: false });

const ModelMappingSchema = new Schema<IModelMapping>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', index: true },
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 500 },
  mappings: { type: [ModelMappingEntrySchema], required: true, validate: v => v.length > 0 },
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
}, {
  timestamps: true,
  collection: 'model_mappings',
});

ModelMappingSchema.index({ userId: 1, isDefault: 1 });
ModelMappingSchema.index({ organizationId: 1, isDefault: 1 });
ModelMappingSchema.index({ teamId: 1, isDefault: 1 });

export const ModelMapping = mongoose.model<IModelMapping>('ModelMapping', ModelMappingSchema);

// Request Log model (for analytics)
export interface IRequestLog extends Document {
  _id: string;
  userId: string;
  organizationId?: string;
  teamId?: string;
  mappingId?: string;
  claudeModelId: string;
  providerModelId: string;
  endpointId: string;
  requestType: 'messages' | 'completions' | 'embeddings';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  statusCode: number;
  error?: string;
  createdAt: Date;
}

const RequestLogSchema = new Schema<IRequestLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', index: true },
  mappingId: { type: Schema.Types.ObjectId, ref: 'ModelMapping', index: true },
  claudeModelId: { type: String, required: true, index: true },
  providerModelId: { type: String, required: true },
  endpointId: { type: String, required: true },
  requestType: { type: String, enum: ['messages', 'completions', 'embeddings'], required: true },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  latencyMs: { type: Number, required: true },
  statusCode: { type: Number, required: true },
  error: { type: String },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'request_logs',
});

RequestLogSchema.index({ userId: 1, createdAt: -1 });
RequestLogSchema.index({ organizationId: 1, createdAt: -1 });
RequestLogSchema.index({ teamId: 1, createdAt: -1 });
RequestLogSchema.index({ createdAt: -1 });
RequestLogSchema.index({ statusCode: 1 });

export const RequestLog = mongoose.model<IRequestLog>('RequestLog', RequestLogSchema);

// Webhook model
export type WebhookEventType = 
  | 'request.completed'
  | 'request.failed'
  | 'request.fallback_activated'
  | 'endpoint.health_changed'
  | 'mapping.created'
  | 'mapping.updated'
  | 'mapping.deleted'
  | 'api_key.created'
  | 'api_key.updated'
  | 'api_key.deleted'
  | 'usage.threshold_exceeded'
  | 'error.rate_exceeded';

export interface IRetryPolicy {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface IWebhook extends Document {
  _id: string;
  userId?: string;
  organizationId?: string;
  teamId?: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  active: boolean;
  retryPolicy: IRetryPolicy;
  createdAt: Date;
  updatedAt: Date;
}

const RetryPolicySchema = new Schema<IRetryPolicy>({
  maxRetries: { type: Number, default: 3, min: 0, max: 10 },
  initialDelay: { type: Number, default: 1000, min: 100 },
  maxDelay: { type: Number, default: 30000, min: 1000 },
  backoffMultiplier: { type: Number, default: 2, min: 1, max: 5 },
}, { _id: false });

const WebhookSchema = new Schema<IWebhook>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', index: true },
  url: { type: String, required: true },
  secret: { type: String, required: true },
  events: [{ type: String, enum: [
    'request.completed', 'request.failed', 'request.fallback_activated',
    'endpoint.health_changed', 'mapping.created', 'mapping.updated', 'mapping.deleted',
    'api_key.created', 'api_key.updated', 'api_key.deleted',
    'usage.threshold_exceeded', 'error.rate_exceeded'
  ] }],
  active: { type: Boolean, default: true },
  retryPolicy: { type: RetryPolicySchema, default: () => ({}) },
}, {
  timestamps: true,
  collection: 'webhooks',
});

WebhookSchema.index({ userId: 1, active: 1 });
WebhookSchema.index({ organizationId: 1, active: 1 });
WebhookSchema.index({ teamId: 1, active: 1 });

export const Webhook = mongoose.model<IWebhook>('Webhook', WebhookSchema);

// Webhook Delivery model
export interface IWebhookDelivery extends Document {
  _id: string;
  webhookId: string;
  deliveryId: string;
  event: string;
  payload: Record<string, any>;
  status: 'pending' | 'success' | 'failed';
  attempt: number;
  responseStatus?: number;
  responseBody?: any;
  error?: string;
  latencyMs?: number;
  completedAt?: Date;
  createdAt: Date;
}

const WebhookDeliverySchema = new Schema<IWebhookDelivery>({
  webhookId: { type: Schema.Types.ObjectId, ref: 'Webhook', required: true, index: true },
  deliveryId: { type: String, required: true, unique: true },
  event: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
  attempt: { type: Number, default: 0 },
  responseStatus: { type: Number },
  responseBody: { type: Schema.Types.Mixed },
  error: { type: String },
  latencyMs: { type: Number },
  completedAt: { type: Date },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'webhook_deliveries',
});

WebhookDeliverySchema.index({ webhookId: 1, createdAt: -1 });
WebhookDeliverySchema.index({ deliveryId: 1 }, { unique: true });

export const WebhookDelivery = mongoose.model<IWebhookDelivery>('WebhookDelivery', WebhookDeliverySchema);

// Invitation model
export interface IInvitation extends Document {
  _id: string;
  organizationId: string;
  teamId?: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  invitedBy: string;
  token: string;
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
}

const InvitationSchema = new Schema<IInvitation>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', index: true },
  email: { type: String, required: true, lowercase: true },
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date },
}, {
  timestamps: true,
  collection: 'invitations',
});

InvitationSchema.index({ email: 1, organizationId: 1 });
InvitationSchema.index({ token: 1 }, { unique: true });

export const Invitation = mongoose.model<IInvitation>('Invitation', InvitationSchema);

// Budget model
export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type BudgetScope = 'user' | 'team' | 'organization';
export type BudgetAlertChannel = 'email' | 'webhook' | 'slack' | 'in_app';
export type BudgetAlertStatus = 'pending' | 'triggered' | 'acknowledged' | 'resolved';
export type BudgetActionTrigger = 'warning' | 'critical' | 'exceeded';
export type BudgetActionType = 'notify' | 'throttle' | 'block' | 'switch_cheaper_model';

export interface IBudgetLimit {
  maxRequests?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxTotalTokens?: number;
  maxCostUsd?: number;
}

export interface IBudgetAlertConfig {
  threshold: number; // percentage
  channels: BudgetAlertChannel[];
  webhookUrl?: string;
}

export interface IBudgetAction {
  trigger: BudgetActionTrigger;
  action: BudgetActionType;
  config?: Record<string, any>;
}

export interface IBudgetUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface IBudget extends Document {
  _id: string;
  name: string;
  scope: BudgetScope;
  scopeId: string;
  period: BudgetPeriod;
  limits: IBudgetLimit;
  alerts: IBudgetAlertConfig[];
  actions: IBudgetAction[];
  isActive: boolean;
  currentUsage: IBudgetUsage;
  createdBy: string;
  startDate?: Date;
  endDate?: Date;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

const BudgetLimitSchema = new Schema<IBudgetLimit>({
  maxRequests: { type: Number, min: 1 },
  maxInputTokens: { type: Number, min: 1 },
  maxOutputTokens: { type: Number, min: 1 },
  maxTotalTokens: { type: Number, min: 1 },
  maxCostUsd: { type: Number, min: 0.01 },
}, { _id: false });

const BudgetAlertConfigSchema = new Schema<IBudgetAlertConfig>({
  threshold: { type: Number, required: true, min: 0, max: 100 },
  channels: [{ type: String, enum: ['email', 'webhook', 'slack', 'in_app'], required: true }],
  webhookUrl: { type: String },
}, { _id: false });

const BudgetActionSchema = new Schema<IBudgetAction>({
  trigger: { type: String, enum: ['warning', 'critical', 'exceeded'], required: true },
  action: { type: String, enum: ['notify', 'throttle', 'block', 'switch_cheaper_model'], required: true },
  config: { type: Schema.Types.Mixed },
}, { _id: false });

const BudgetUsageSchema = new Schema<IBudgetUsage>({
  requests: { type: Number, default: 0 },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  costUsd: { type: Number, default: 0 },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
}, { _id: false });

const BudgetSchema = new Schema<IBudget>({
  name: { type: String, required: true, maxlength: 100 },
  scope: { type: String, enum: ['user', 'team', 'organization'], required: true },
  scopeId: { type: Schema.Types.ObjectId, required: true, index: true },
  period: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], required: true },
  limits: { type: BudgetLimitSchema, required: true },
  alerts: [BudgetAlertConfigSchema],
  actions: [BudgetActionSchema],
  isActive: { type: Boolean, default: true },
  currentUsage: { type: BudgetUsageSchema, default: () => ({}) },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  startDate: { type: Date },
  endDate: { type: Date },
  timezone: { type: String, default: 'UTC' },
}, {
  timestamps: true,
  collection: 'budgets',
});

BudgetSchema.index({ scope: 1, scopeId: 1, isActive: 1 });
BudgetSchema.index({ createdBy: 1, isActive: 1 });

export const Budget = mongoose.model<IBudget>('Budget', BudgetSchema);

// Budget Alert model
export interface IBudgetAlert extends Document {
  _id: string;
  budgetId: string;
  type: 'warning' | 'critical' | 'exceeded';
  metric: 'requests' | 'inputTokens' | 'outputTokens' | 'totalTokens' | 'costUsd';
  currentValue: number;
  limitValue: number;
  thresholdPercent: number;
  status: BudgetAlertStatus;
  message: string;
  channels: BudgetAlertChannel[];
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  createdAt: Date;
}

const BudgetAlertSchema = new Schema<IBudgetAlert>({
  budgetId: { type: Schema.Types.ObjectId, ref: 'Budget', required: true, index: true },
  type: { type: String, enum: ['warning', 'critical', 'exceeded'], required: true },
  metric: { type: String, enum: ['requests', 'inputTokens', 'outputTokens', 'totalTokens', 'costUsd'], required: true },
  currentValue: { type: Number, required: true },
  limitValue: { type: Number, required: true },
  thresholdPercent: { type: Number, required: true, min: 0, max: 100 },
  status: { type: String, enum: ['pending', 'triggered', 'acknowledged', 'resolved'], default: 'pending' },
  message: { type: String, required: true },
  channels: [{ type: String, enum: ['email', 'webhook', 'slack', 'in_app'] }],
  acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  acknowledgedAt: { type: Date },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'budget_alerts',
});

BudgetAlertSchema.index({ budgetId: 1, status: 1 });
BudgetAlertSchema.index({ createdAt: -1 });

export const BudgetAlert = mongoose.model<IBudgetAlert>('BudgetAlert', BudgetAlertSchema);

// A/B Test model
export type ABTestStatus = 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
export type ABTestTargetMetric = 'latency' | 'cost' | 'quality' | 'error_rate' | 'tokens_per_second';
export type ABTestTargetDirection = 'minimize' | 'maximize';

export interface IABTestVariantConfig {
  modelMappingId?: string;
  endpointId?: string;
  providerModelId?: string;
  routingStrategy?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface IABTestVariant {
  _id: string;
  name: string;
  description?: string;
  weight: number;
  config: IABTestVariantConfig;
  isControl: boolean;
  index: number;
  stats?: {
    sampleCount: number;
    avgLatency: number;
    avgCost: number;
    avgQuality: number;
    errorRate: number;
    successRate: number;
  };
}

export interface IABTestTargeting {
  userIds?: string[];
  teamIds?: string[];
  organizationIds?: string[];
  modelIds?: string[];
  percentage: number;
  conditions?: Array<{
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'in' | 'not_in';
    value: any;
  }>;
}

export interface IABTestSchedule {
  startAt?: Date;
  endAt?: Date;
  timezone: string;
}

export interface IABTest extends Document {
  _id: string;
  name: string;
  description?: string;
  hypothesis: string;
  targetMetric: ABTestTargetMetric;
  targetDirection: ABTestTargetDirection;
  variants: IABTestVariant[];
  targeting?: IABTestTargeting;
  schedule?: IABTestSchedule;
  minimumSampleSize: number;
  significanceLevel: number;
  minimumDetectableEffect: number;
  status: ABTestStatus;
  createdBy: string;
  startedAt?: Date;
  completedAt?: Date;
  winningVariantId?: string;
  finalResults?: any;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ABTestVariantConfigSchema = new Schema<IABTestVariantConfig>({
  modelMappingId: { type: String },
  endpointId: { type: String },
  providerModelId: { type: String },
  routingStrategy: { type: String },
  temperature: { type: Number, min: 0, max: 2 },
  maxTokens: { type: Number, min: 1, max: 100000 },
  systemPrompt: { type: String },
}, { _id: false });

const ABTestVariantSchema = new Schema<IABTestVariant>({
  _id: { type: Schema.Types.ObjectId, default: () => new Types.ObjectId() },
  name: { type: String, required: true, maxlength: 50 },
  description: { type: String },
  weight: { type: Number, required: true, min: 0, max: 100 },
  config: { type: ABTestVariantConfigSchema, required: true },
  isControl: { type: Boolean, default: false },
  index: { type: Number, required: true },
  stats: {
    sampleCount: { type: Number, default: 0 },
    avgLatency: { type: Number, default: 0 },
    avgCost: { type: Number, default: 0 },
    avgQuality: { type: Number, default: 0 },
    errorRate: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
  },
}, { _id: false });

const ABTestTargetingSchema = new Schema<IABTestTargeting>({
  userIds: [{ type: String }],
  teamIds: [{ type: String }],
  organizationIds: [{ type: String }],
  modelIds: [{ type: String }],
  percentage: { type: Number, default: 100, min: 0, max: 100 },
  conditions: [{
    field: { type: String, required: true },
    operator: { type: String, enum: ['equals', 'not_equals', 'contains', 'gt', 'lt', 'in', 'not_in'], required: true },
    value: { type: Schema.Types.Mixed, required: true },
  }],
}, { _id: false });

const ABTestScheduleSchema = new Schema<IABTestSchedule>({
  startAt: { type: Date },
  endAt: { type: Date },
  timezone: { type: String, default: 'UTC' },
}, { _id: false });

const ABTestSchema = new Schema<IABTest>({
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 500 },
  hypothesis: { type: String, required: true, maxlength: 500 },
  targetMetric: { type: String, enum: ['latency', 'cost', 'quality', 'error_rate', 'tokens_per_second'], required: true },
  targetDirection: { type: String, enum: ['minimize', 'maximize'], required: true },
  variants: { type: [ABTestVariantSchema], required: true, validate: v => v.length >= 2 },
  targeting: { type: ABTestTargetingSchema },
  schedule: { type: ABTestScheduleSchema },
  minimumSampleSize: { type: Number, default: 100, min: 10 },
  significanceLevel: { type: Number, default: 0.05, min: 0.001, max: 0.1 },
  minimumDetectableEffect: { type: Number, default: 0.1, min: 0.01, max: 1 },
  status: { type: String, enum: ['draft', 'running', 'paused', 'completed', 'cancelled'], default: 'draft' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  startedAt: { type: Date },
  completedAt: { type: Date },
  winningVariantId: { type: String },
  finalResults: { type: Schema.Types.Mixed },
  notes: { type: String },
}, {
  timestamps: true,
  collection: 'ab_tests',
});

ABTestSchema.index({ createdBy: 1, status: 1 });
ABTestSchema.index({ status: 1 });

export const ABTest = mongoose.model<IABTest>('ABTest', ABTestSchema);

// A/B Test Result model
export interface IABTestResult extends Document {
  _id: string;
  testId: string;
  variantId: string;
  userId?: string;
  metrics: {
    latencyMs?: number;
    costUsd?: number;
    qualityScore?: number;
    errorRate?: number;
    tokensPerSecond?: number;
    success?: boolean;
  };
  metadata?: Record<string, any>;
  createdAt: Date;
}

const ABTestResultSchema = new Schema<IABTestResult>({
  testId: { type: Schema.Types.ObjectId, ref: 'ABTest', required: true, index: true },
  variantId: { type: Schema.Types.ObjectId, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  metrics: {
    latencyMs: { type: Number },
    costUsd: { type: Number },
    qualityScore: { type: Number },
    errorRate: { type: Number },
    tokensPerSecond: { type: Number },
    success: { type: Boolean },
  },
  metadata: { type: Schema.Types.Mixed },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'ab_test_results',
});

ABTestResultSchema.index({ testId: 1, variantId: 1 });
ABTestResultSchema.index({ testId: 1, createdAt: -1 });
ABTestResultSchema.index({ userId: 1, createdAt: -1 });

export const ABTestResult = mongoose.model<IABTestResult>('ABTestResult', ABTestResultSchema);

// Security Rule model
export type SecurityRuleType = 'rate_limit' | 'ip_filter' | 'request_validation' | 'response_filter' | 'anomaly_detection';
export type SecurityRuleAction = 'allow' | 'block' | 'throttle' | 'challenge' | 'log_only';
export type SecurityRuleScope = 'global' | 'organization' | 'team' | 'user' | 'endpoint';

export interface ISecurityRuleCondition {
  ipRanges?: string[];
  userAgents?: string[];
  paths?: string[];
  methods?: string[];
  headers?: Record<string, string>;
  geoCountries?: string[];
  asnNumbers?: string[];
  requestSize?: { min?: number; max?: number };
  timeWindow?: { start?: string; end?: string; timezone?: string };
}

export interface ISecurityRuleRateLimit {
  maxRequests: number;
  windowMs: number;
  keyGenerator: 'ip' | 'user_id' | 'api_key' | 'custom';
  customKey?: string;
}

export interface ISecurityRuleAnomalyDetection {
  enabled: boolean;
  threshold: number;
  metrics: string[];
  windowMs: number;
}

export interface ISecurityRule extends Document {
  _id: string;
  name: string;
  description?: string;
  type: SecurityRuleType;
  action: SecurityRuleAction;
  priority: number;
  conditions?: ISecurityRuleCondition;
  rateLimit?: ISecurityRuleRateLimit;
  anomalyDetection?: ISecurityRuleAnomalyDetection;
  isActive: boolean;
  scope: SecurityRuleScope;
  scopeId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const SecurityRuleConditionSchema = new Schema<ISecurityRuleCondition>({
  ipRanges: [{ type: String }],
  userAgents: [{ type: String }],
  paths: [{ type: String }],
  methods: [{ type: String }],
  headers: { type: Schema.Types.Mixed },
  geoCountries: [{ type: String }],
  asnNumbers: [{ type: String }],
  requestSize: {
    min: { type: Number },
    max: { type: Number },
  },
  timeWindow: {
    start: { type: String },
    end: { type: String },
    timezone: { type: String },
  },
}, { _id: false });

const SecurityRuleRateLimitSchema = new Schema<ISecurityRuleRateLimit>({
  maxRequests: { type: Number, required: true, min: 1 },
  windowMs: { type: Number, required: true, min: 1000 },
  keyGenerator: { type: String, enum: ['ip', 'user_id', 'api_key', 'custom'], default: 'ip' },
  customKey: { type: String },
}, { _id: false });

const SecurityRuleAnomalyDetectionSchema = new Schema<ISecurityRuleAnomalyDetection>({
  enabled: { type: Boolean, default: false },
  threshold: { type: Number, default: 95, min: 1, max: 100 },
  metrics: [{ type: String, enum: ['request_rate', 'error_rate', 'latency', 'token_usage', 'unique_ips'] }],
  windowMs: { type: Number, default: 300000, min: 60000 },
}, { _id: false });

const SecurityRuleSchema = new Schema<ISecurityRule>({
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 500 },
  type: { type: String, enum: ['rate_limit', 'ip_filter', 'request_validation', 'response_filter', 'anomaly_detection'], required: true },
  action: { type: String, enum: ['allow', 'block', 'throttle', 'challenge', 'log_only'], required: true },
  priority: { type: Number, default: 0, min: 0, max: 1000 },
  conditions: { type: SecurityRuleConditionSchema },
  rateLimit: { type: SecurityRuleRateLimitSchema },
  anomalyDetection: { type: SecurityRuleAnomalyDetectionSchema },
  isActive: { type: Boolean, default: true },
  scope: { type: String, enum: ['global', 'organization', 'team', 'user', 'endpoint'], default: 'global' },
  scopeId: { type: Schema.Types.ObjectId, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, {
  timestamps: true,
  collection: 'security_rules',
});

SecurityRuleSchema.index({ scope: 1, scopeId: 1, isActive: 1 });
SecurityRuleSchema.index({ priority: -1 });

export const SecurityRule = mongoose.model<ISecurityRule>('SecurityRule', SecurityRuleSchema);

// Security Event model
export type SecurityEventType = 
  | 'request_blocked' 
  | 'rate_limit_exceeded' 
  | 'ip_blocked' 
  | 'rule_matched' 
  | 'anomaly_detected' 
  | 'authentication_failed' 
  | 'authorization_failed';
export type SecurityEventSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ISecurityEvent extends Document {
  _id: string;
  ruleId?: string;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  action: SecurityRuleAction;
  clientIp: string;
  userId?: string;
  organizationId?: string;
  teamId?: string;
  endpointId?: string;
  message: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const SecurityEventSchema = new Schema<ISecurityEvent>({
  ruleId: { type: Schema.Types.ObjectId, ref: 'SecurityRule', index: true },
  eventType: { type: String, enum: [
    'request_blocked', 'rate_limit_exceeded', 'ip_blocked', 
    'rule_matched', 'anomaly_detected', 'authentication_failed', 'authorization_failed'
  ], required: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  action: { type: String, enum: ['allow', 'block', 'throttle', 'challenge', 'log_only'], required: true },
  clientIp: { type: String, required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', index: true },
  endpointId: { type: Schema.Types.ObjectId, ref: 'Endpoint', index: true },
  message: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'security_events',
});

SecurityEventSchema.index({ createdAt: -1 });
SecurityEventSchema.index({ ruleId: 1, createdAt: -1 });
SecurityEventSchema.index({ clientIp: 1, createdAt: -1 });
SecurityEventSchema.index({ eventType: 1, severity: 1 });

export const SecurityEvent = mongoose.model<ISecurityEvent>('SecurityEvent', SecurityEventSchema);

// Rate Limit Rule model
export type RateLimitKeyType = 'ip' | 'user_id' | 'api_key' | 'endpoint' | 'model';

export interface IRateLimitRule extends Document {
  _id: string;
  name: string;
  keyType: RateLimitKeyType;
  keyValue?: string;
  maxRequests: number;
  windowMs: number;
  action: 'block' | 'throttle' | 'queue';
  message?: string;
  scope: SecurityRuleScope;
  scopeId?: string;
  currentCount: number;
  blockedCount: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const RateLimitRuleSchema = new Schema<IRateLimitRule>({
  name: { type: String, required: true, maxlength: 100 },
  keyType: { type: String, enum: ['ip', 'user_id', 'api_key', 'endpoint', 'model'], required: true },
  keyValue: { type: String },
  maxRequests: { type: Number, required: true, min: 1 },
  windowMs: { type: Number, required: true, min: 1000 },
  action: { type: String, enum: ['block', 'throttle', 'queue'], default: 'block' },
  message: { type: String },
  scope: { type: String, enum: ['global', 'organization', 'team', 'user', 'endpoint'], default: 'global' },
  scopeId: { type: Schema.Types.ObjectId, index: true },
  currentCount: { type: Number, default: 0 },
  blockedCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, {
  timestamps: true,
  collection: 'rate_limit_rules',
});

RateLimitRuleSchema.index({ scope: 1, scopeId: 1, isActive: 1 });
RateLimitRuleSchema.index({ keyType: 1, keyValue: 1 });

export const RateLimitRule = mongoose.model<IRateLimitRule>('RateLimitRule', RateLimitRuleSchema);

// IP Filter model
export type IPFilterType = 'allow' | 'deny';

export interface IIPFilter extends Document {
  _id: string;
  type: IPFilterType;
  ip: string;
  cidr?: string;
  description?: string;
  expiresAt?: Date;
  scope: SecurityRuleScope;
  scopeId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const IPFilterSchema = new Schema<IIPFilter>({
  type: { type: String, enum: ['allow', 'deny'], required: true },
  ip: { type: String, required: true, index: true },
  cidr: { type: String },
  description: { type: String, maxlength: 500 },
  expiresAt: { type: Date },
  scope: { type: String, enum: ['global', 'organization', 'team', 'user', 'endpoint'], default: 'global' },
  scopeId: { type: Schema.Types.ObjectId, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, {
  timestamps: true,
  collection: 'ip_filters',
});

IPFilterSchema.index({ scope: 1, scopeId: 1, type: 1 });
IPFilterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IPFilter = mongoose.model<IIPFilter>('IPFilter', IPFilterSchema);

// Request Replay model
export interface IRequestReplay extends Document {
  _id: string;
  userId: string;
  originalLogId: string;
  requestBody: any;
  response: any;
  modifications?: any;
  createdAt: Date;
}

const RequestReplaySchema = new Schema<IRequestReplay>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  originalLogId: { type: Schema.Types.ObjectId, ref: 'RequestLog', required: true, index: true },
  requestBody: { type: Schema.Types.Mixed, required: true },
  response: { type: Schema.Types.Mixed },
  modifications: { type: Schema.Types.Mixed },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'request_replays',
});

RequestReplaySchema.index({ userId: 1, createdAt: -1 });
RequestReplaySchema.index({ originalLogId: 1 });

export const RequestReplay = mongoose.model<IRequestReplay>('RequestReplay', RequestReplaySchema);

// Dead Letter Queue model
export type DeadLetterStatus = 'failed' | 'retried' | 'resolved' | 'ignored';

export interface IDeadLetterQueue extends Document {
  _id: string;
  userId: string;
  requestBody: any;
  error: string;
  errorStack?: string;
  context: Record<string, any>;
  status: DeadLetterStatus;
  retryCount: number;
  lastError?: string;
  retryResult?: any;
  retriedAt?: Date;
  createdAt: Date;
}

const DeadLetterQueueSchema = new Schema<IDeadLetterQueue>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requestBody: { type: Schema.Types.Mixed, required: true },
  error: { type: String, required: true },
  errorStack: { type: String },
  context: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['failed', 'retried', 'resolved', 'ignored'], default: 'failed' },
  retryCount: { type: Number, default: 0 },
  lastError: { type: String },
  retryResult: { type: Schema.Types.Mixed },
  retriedAt: { type: Date },
}, {
  timestamps: { createdAt: true, updatedAt: true },
  collection: 'dead_letter_queue',
});

DeadLetterQueueSchema.index({ userId: 1, status: 1 });
DeadLetterQueueSchema.index({ createdAt: -1 });
DeadLetterQueueSchema.index({ status: 1, createdAt: -1 });

export const DeadLetterQueue = mongoose.model<IDeadLetterQueue>('DeadLetterQueue', DeadLetterQueueSchema);