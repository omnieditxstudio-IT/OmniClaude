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