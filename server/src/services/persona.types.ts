import { AnthropicMessagesRequest, AnthropicContentBlock } from '@gateway/shared';

/**
 * Enhanced Persona Types - Multi-persona support with context-aware switching
 */

export interface PersonaIdentity {
  name: string;
  creator: string;
  version?: string;
  description?: string;
  personalityTraits?: string[];
  communicationStyle?: 'formal' | 'casual' | 'technical' | 'friendly' | 'professional';
}

export interface ResponseFilters {
  removeModelNames: string[];
  replaceWith: Record<string, string>;
  blockPatterns: RegExp[];
  // Enhanced: Context-aware replacements
  contextAwareReplacements?: Array<{
    context: string; // regex or keyword to detect context
    replacements: Record<string, string>;
  }>;
  // Enhanced: Semantic similarity blocking
  semanticBlockThreshold?: number; // 0-1, for embedding-based blocking
}

export interface BehaviorEnforcement {
  enforceFirstPerson: boolean;
  enforceKnowledgeCutoff: string;
  enforceCapabilities: string[];
  // Enhanced: Reasoning enforcement
  enforceReasoningStyle?: 'step-by-step' | 'concise' | 'detailed' | 'socratic';
  enforceReasoningFormat?: 'xml' | 'markdown' | 'plain';
  // Enhanced: Refusal style
  refusalStyle?: 'direct' | 'apologetic' | 'educational' | 'redirect';
  // Enhanced: Uncertainty expression
  uncertaintyExpression?: 'explicit' | 'hedged' | 'confident';
  // Enhanced: Tool use personality
  toolUsePersonality?: 'cautious' | 'confident' | 'exploratory';
}

export interface ReasoningEnforcement {
  enabled: boolean;
  // Chain-of-thought enforcement
  enforceCotFormat?: 'xml' | 'markdown' | 'hidden' | 'none';
  // Hide reasoning from user but enforce internally
  hideReasoningFromUser?: boolean;
  // Enforce specific reasoning patterns
  requiredReasoningSteps?: string[];
  // Block certain reasoning patterns
  blockedReasoningPatterns?: RegExp[];
  // Minimum reasoning depth
  minReasoningDepth?: number;
}

export interface ToolUseEnforcement {
  enabled: boolean;
  // Persona for tool selection
  toolSelectionPersonality?: 'cautious' | 'confident' | 'exploratory';
  // Enforce tool use patterns
  requiredToolConfirmation?: boolean;
  // Tool result persona
  toolResultPersona?: 'analytical' | 'conversational' | 'technical';
  // Block certain tools based on persona
  blockedTools?: string[];
  // Custom tool use instructions
  customToolInstructions?: string;
}

export interface MultilingualSupport {
  enabled: boolean;
  supportedLanguages: string[];
  // Per-language persona overrides
  languageOverrides?: Record<string, Partial<PersonaConfig>>;
  // Auto-detect language
  autoDetectLanguage?: boolean;
  // Enforce language consistency
  enforceLanguageConsistency?: boolean;
}

export interface PersonaConfig {
  // Metadata
  id: string;
  name: string;
  version: string;
  description?: string;
  tags?: string[];
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  
  // Core identity
  identity: PersonaIdentity;
  
  // System prompt to inject
  systemPrompt: string;
  
  // Response filters to apply
  responseFilters: ResponseFilters;
  
  // Model-specific overrides
  modelOverrides?: Record<string, Partial<PersonaConfig>>;
  
  // Behavior enforcement
  behavior: BehaviorEnforcement;
  
  // Enhanced: Reasoning enforcement
  reasoning?: ReasoningEnforcement;
  
  // Enhanced: Tool use enforcement
  toolUse?: ToolUseEnforcement;
  
  // Enhanced: Multilingual support
  multilingual?: MultilingualSupport;
  
  // Provider-specific overrides
  providerOverrides?: Record<string, Partial<PersonaConfig>>;
  
  // Context-aware switching
  contextSwitching?: {
    enabled: boolean;
    rules: ContextSwitchRule[];
  };
}

export interface ContextSwitchRule {
  id: string;
  name: string;
  description?: string;
  priority: number;
  conditions: {
    // User-based conditions
    userIds?: string[];
    userRoles?: string[];
    // Request-based conditions
    modelIds?: string[];
    providers?: string[];
    keywords?: string[];
    languages?: string[];
    // Context-based conditions
    conversationLength?: { min?: number; max?: number };
    hasTools?: boolean;
    hasReasoning?: boolean;
    // Time-based conditions
    timeRanges?: Array<{ start: string; end: string; timezone?: string }>;
  };
  targetPersonaId: string;
  // Transition settings
  transition?: {
    type: 'immediate' | 'gradual' | 'next-turn';
    blendMessages?: number; // Number of messages to blend during transition
  };
}

export interface PersonaMetrics {
  // Enforcement statistics
  totalRequests: number;
  enforcedRequests: number;
  blockedResponses: number;
  replacedTerms: number;
  blockedPatterns: number;
  streamingChunksFiltered: number;
  
  // Per-persona stats
  personaUsage: Record<string, {
    requests: number;
    avgLatencyMs: number;
    enforcementRate: number;
  }>;
  
  // Quality metrics
  falsePositives: number;
  falseNegatives: number;
  userFeedbackScore?: number;
  
  // Performance
  avgEnforcementLatencyMs: number;
  maxEnforcementLatencyMs: number;
  
  // Errors
  enforcementErrors: number;
  lastError?: string;
  lastErrorAt?: Date;
}

export interface PersonaAuditLog {
  id: string;
  timestamp: Date;
  personaId: string;
  action: 'created' | 'updated' | 'deleted' | 'activated' | 'deactivated' | 'switched' | 'tested';
  performedBy: string;
  details: Record<string, any>;
  previousState?: Partial<PersonaConfig>;
  newState?: Partial<PersonaConfig>;
  ipAddress?: string;
  userAgent?: string;
}

export interface PersonaTestCase {
  id: string;
  personaId: string;
  name: string;
  description?: string;
  input: {
    request: Partial<AnthropicMessagesRequest>;
    provider: string;
    modelId: string;
  };
  expectedOutput: {
    shouldContain?: string[];
    shouldNotContain?: string[];
    shouldMatchPattern?: RegExp;
    shouldEnforceIdentity?: boolean;
    shouldEnforceFirstPerson?: boolean;
    shouldEnforceKnowledgeCutoff?: string;
  };
  tags?: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  isAdversarial: boolean;
}

export interface AdversarialTestCase extends PersonaTestCase {
  attackType: 'identity_probe' | 'roleplay' | 'hypothetical' | 'authority_impersonation' | 'emotional_manipulation' | 'continuation_attack' | 'encoding_bypass' | 'context_injection';
  expectedBehavior: 'refuse' | 'redirect' | 'maintain_persona' | 'partial_compliance';
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface PersonaTestResult {
  testCaseId: string;
  personaId: string;
  passed: boolean;
  actualOutput: any;
  violations: PersonaViolation[];
  latencyMs: number;
  timestamp: Date;
}

export interface PersonaViolation {
  type: 'identity_leak' | 'wrong_persona' | 'knowledge_cutoff' | 'first_person' | 'reasoning_format' | 'tool_use' | 'language' | 'blocked_pattern';
  severity: 'critical' | 'high' | 'medium' | 'low';
  location: 'system_prompt' | 'response_text' | 'reasoning' | 'tool_call' | 'tool_result';
  expected: string;
  actual: string;
  context?: string;
}

export interface PersonaTemplate {
  id: string;
  name: string;
  description: string;
  category: 'coding' | 'analysis' | 'writing' | 'reasoning' | 'creative' | 'technical' | 'customer_support' | 'educational' | 'custom';
  tags: string[];
  basePersonaId: string;
  variables: TemplateVariable[];
  template: PersonaConfig;
  examples?: TemplateExample[];
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  defaultValue?: any;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    enum?: string[];
  };
}

export interface TemplateExample {
  name: string;
  variableValues: Record<string, any>;
  expectedOutput?: string;
}

export interface PersonaSwitchRequest {
  fromPersonaId?: string;
  toPersonaId: string;
  context?: {
    conversationId?: string;
    userId?: string;
    messageCount?: number;
  };
  transition?: 'immediate' | 'gradual' | 'next-turn';
  blendMessages?: number;
}

export interface PersonaSwitchResponse {
  success: boolean;
  fromPersonaId?: string;
  toPersonaId: string;
  transitionType: string;
  estimatedTransitionMessages: number;
  warnings?: string[];
}

// Re-export base types
export { AnthropicMessagesRequest, AnthropicContentBlock } from '@gateway/shared';

// Type guards
export function isPersonaConfig(obj: any): obj is PersonaConfig {
  return obj && typeof obj.id === 'string' && typeof obj.name === 'string' && typeof obj.systemPrompt === 'string';
}

export function isContextSwitchRule(obj: any): obj is ContextSwitchRule {
  return obj && typeof obj.id === 'string' && typeof obj.targetPersonaId === 'string' && typeof obj.conditions === 'object';
}

export function isPersonaTestCase(obj: any): obj is PersonaTestCase {
  return obj && typeof obj.id === 'string' && typeof obj.personaId === 'string' && typeof obj.input === 'object';
}