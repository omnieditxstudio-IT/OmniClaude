import mongoose, { Document, Schema } from 'mongoose';

// User model (extends Better-Auth user)
export interface IUser extends Document {
  _id: string;
  email: string;
  name: string;
  avatar?: string;
  provider: 'google' | 'github';
  providerId: string;
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

export const User = mongoose.model<IUser>('User', UserSchema);

// API Key model (encrypted at rest)
export interface IApiKey extends Document {
  _id: string;
  userId: string;
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
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, maxlength: 100 },
  provider: { 
    type: String, 
    enum: ['openrouter', 'vertex', 'ollama', 'custom', 'anthropic'], 
    required: true 
  },
  keyEncrypted: { type: String, required: true },
  keyHash: { type: String, required: true }, // Last 4 chars for display
  isActive: { type: Boolean, default: true },
  lastUsedAt: { type: Date },
}, {
  timestamps: true,
  collection: 'api_keys',
});

ApiKeySchema.index({ userId: 1, provider: 1 });

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
  userId: string;
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
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
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
  userId: string;
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
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
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

export const ModelMapping = mongoose.model<IModelMapping>('ModelMapping', ModelMappingSchema);

// Request Log model (for analytics)
export interface IRequestLog extends Document {
  _id: string;
  userId: string;
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
RequestLogSchema.index({ createdAt: -1 });
RequestLogSchema.index({ statusCode: 1 });

export const RequestLog = mongoose.model<IRequestLog>('RequestLog', RequestLogSchema);