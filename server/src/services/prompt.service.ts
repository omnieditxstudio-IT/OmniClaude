import { Schema, model, Document } from 'mongoose';

export interface IPromptTemplate extends Document {
  _id: string;
  organizationId?: string;
  teamId?: string;
  userId?: string;
  name: string;
  description?: string;
  category: 'coding' | 'analysis' | 'writing' | 'reasoning' | 'custom';
  template: string;
  variables: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required: boolean;
    default?: any;
    description?: string;
  }>;
  modelOverrides?: Record<string, {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    systemPrompt?: string;
  }>;
  tags: string[];
  isPublic: boolean;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const PromptVariableSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['string', 'number', 'boolean', 'array', 'object'], required: true },
  required: { type: Boolean, default: true },
  default: { type: Schema.Types.Mixed },
  description: { type: String },
}, { _id: false });

const PromptTemplateSchema = new Schema<IPromptTemplate>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 500 },
  category: { type: String, enum: ['coding', 'analysis', 'writing', 'reasoning', 'custom'], required: true },
  template: { type: String, required: true },
  variables: [PromptVariableSchema],
  modelOverrides: { type: Schema.Types.Mixed },
  tags: [{ type: String }],
  isPublic: { type: Boolean, default: false },
  version: { type: Number, default: 1 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, {
  timestamps: true,
  collection: 'prompt_templates',
});

PromptTemplateSchema.index({ organizationId: 1, category: 1 });
PromptTemplateSchema.index({ userId: 1 });
PromptTemplateSchema.index({ tags: 1 });
PromptTemplateSchema.index({ name: 'text', description: 'text' });

export const PromptTemplate = model<IPromptTemplate>('PromptTemplate', PromptTemplateSchema);

// ==================== Prompt Optimization ====================

export interface PromptOptimizationResult {
  originalPrompt: string;
  optimizedPrompt: string;
  changes: Array<{
    type: 'added' | 'removed' | 'modified' | 'reordered';
    section: string;
    before: string;
    after: string;
    reason: string;
  }>;
  estimatedTokenSavings: number;
  estimatedQualityImprovement: number; // 0-1
}

export interface OptimizationConfig {
  targetModel?: string;
  goals: Array<'reduce_tokens' | 'improve_quality' | 'add_structure' | 'add_examples' | 'reduce_ambiguity'>;
  preserveSections?: string[];
  maxTokens?: number;
}

export class PromptOptimizer {
  private optimizationRules: OptimizationRule[] = [
    {
      name: 'remove_redundancy',
      pattern: /\b(?:please|kindly|I would like you to|Can you)\b/gi,
      replacement: '',
      reason: 'Remove polite filler words',
    },
    {
      name: 'add_structure',
      condition: (prompt: string) => !prompt.includes('##') && prompt.length > 500,
      action: (prompt: string) => this.addMarkdownStructure(prompt),
      reason: 'Add markdown structure for readability',
    },
    {
      name: 'clarify_instructions',
      pattern: /\b(?:do|make|create|write)\b.*\b(?:it|this|that)\b/gi,
      replacement: (match: string) => match.replace(/\b(it|this|that)\b/gi, 'the code'),
      reason: 'Clarify ambiguous pronouns',
    },
  ];

  async optimize(prompt: string, config: OptimizationConfig): Promise<PromptOptimizationResult> {
    let optimized = prompt;
    const changes: PromptOptimizationResult['changes'] = [];

    for (const rule of this.optimizationRules) {
      if (rule.condition && !rule.condition(optimized)) continue;

      if (rule.pattern) {
        const matches = optimized.match(rule.pattern);
        if (matches) {
          const before = optimized;
          optimized = optimized.replace(rule.pattern, rule.replacement as string);
          if (before !== optimized) {
            changes.push({
              type: 'modified',
              section: 'text',
              before: matches[0],
              after: rule.replacement as string,
              reason: rule.reason,
            });
          }
        }
      } else if (rule.action) {
        const before = optimized;
        optimized = rule.action(optimized);
        if (before !== optimized) {
          changes.push({
            type: 'modified',
            section: 'structure',
            before: before.slice(0, 200),
            after: optimized.slice(0, 200),
            reason: rule.reason,
          });
        }
      }
    }

    // Apply model-specific optimizations
    if (config.targetModel) {
      optimized = this.applyModelOptimizations(optimized, config.targetModel);
    }

    // Apply goal-specific optimizations
    for (const goal of config.goals) {
      optimized = this.applyGoalOptimization(optimized, goal);
    }

    // Trim to max tokens if specified
    if (config.maxTokens && this.estimateTokens(optimized) > config.maxTokens) {
      optimized = this.trimToTokenLimit(optimized, config.maxTokens);
      changes.push({
        type: 'removed',
        section: 'end',
        before: `${this.estimateTokens(prompt)} tokens`,
        after: `${config.maxTokens} tokens`,
        reason: `Trimmed to ${config.maxTokens} token limit`,
      });
    }

    return {
      originalPrompt: prompt,
      optimizedPrompt: optimized,
      changes,
      estimatedTokenSavings: this.estimateTokens(prompt) - this.estimateTokens(optimized),
      estimatedQualityImprovement: this.estimateQualityImprovement(prompt, optimized),
    };
  }

  private addMarkdownStructure(prompt: string): string {
    // Simple heuristic: split by double newlines and add headers
    const sections = prompt.split('\n\n').filter(s => s.trim().length > 0);
    if (sections.length <= 1) return prompt;

    return sections.map((section, i) => {
      const firstLine = section.split('\n')[0].trim();
      if (firstLine.endsWith(':') || firstLine.match(/^\d+\./)) {
        return `## ${firstLine}\n\n${section}`;
      }
      return section;
    }).join('\n\n');
  }

  private applyModelOptimizations(prompt: string, model: string): string {
    const optimizations: Record<string, (p: string) => string> = {
      'gpt-4': (p) => p, // Already optimized for GPT-4
      'claude-3': (p) => {
        // Add XML tags for Claude
        return p.replace(/^(.+)$/gm, (match) => {
          if (match.startsWith('#')) return match;
          return `<instruction>${match}</instruction>`;
        });
      },
      'gemini': (p) => p, // Works well as-is
      'llama': (p) => {
        // Add explicit formatting instructions
        return `### Instruction\n${p}\n\n### Response`;
      },
    };

    const optimizer = optimizations[model.toLowerCase()];
    return optimizer ? optimizer(prompt) : prompt;
  }

  private applyGoalOptimization(prompt: string, goal: string): string {
    switch (goal) {
      case 'reduce_tokens':
        return this.compressPrompt(prompt);
      case 'improve_quality':
        return this.enhancePrompt(prompt);
      case 'add_structure':
        return this.addMarkdownStructure(prompt);
      case 'add_examples':
        return this.addExamplePlaceholders(prompt);
      case 'reduce_ambiguity':
        return this.disambiguatePrompt(prompt);
      default:
        return prompt;
    }
  }

  private compressPrompt(prompt: string): string {
    return prompt
      .replace(/\b(?:in order to|for the purpose of|due to the fact that)\b/gi, 'to')
      .replace(/\b(?:a large number of|a great deal of)\b/gi, 'many')
      .replace(/\b(?:at this point in time|at the present time)\b/gi, 'now')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private enhancePrompt(prompt: string): string {
    // Add quality-enhancing instructions
    const enhancements = [
      'Think step by step.',
      'Provide clear explanations.',
      'Use best practices.',
      'Handle edge cases.',
    ];
    return `${prompt}\n\n${enhancements.join(' ')}`;
  }

  private addExamplePlaceholders(prompt: string): string {
    if (prompt.includes('example') || prompt.includes('Example')) return prompt;
    return `${prompt}\n\nExample:\nInput: [example input]\nOutput: [expected output]`;
  }

  private disambiguatePrompt(prompt: string): string {
    return prompt
      .replace(/\b(it|this|that)\b/gi, (match) => {
        // Simple heuristic - would need NLP for real disambiguation
        return `the ${match}`;
      });
  }

  private trimToTokenLimit(prompt: string, maxTokens: number): string {
    const estimatedTokens = this.estimateTokens(prompt);
    if (estimatedTokens <= maxTokens) return prompt;

    const ratio = maxTokens / estimatedTokens;
    const targetLength = Math.floor(prompt.length * ratio * 0.9); // 90% safety margin
    return prompt.slice(0, targetLength) + '\n\n[Content trimmed for token limit]';
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }

  private estimateQualityImprovement(original: string, optimized: string): number {
    // Simple heuristic based on changes made
    const originalTokens = this.estimateTokens(original);
    const optimizedTokens = this.estimateTokens(optimized);
    const tokenReduction = (originalTokens - optimizedTokens) / originalTokens;

    // Quality improvement correlates with structure and clarity
    const hasStructure = optimized.includes('##') && !original.includes('##');
    const hasExamples = optimized.toLowerCase().includes('example') && !original.toLowerCase().includes('example');
    const reducedAmbiguity = (original.match(/\b(it|this|that)\b/gi) || []).length >
                             (optimized.match(/\b(it|this|that)\b/gi) || []).length;

    let score = 0;
    if (hasStructure) score += 0.3;
    if (hasExamples) score += 0.2;
    if (reducedAmbiguity) score += 0.2;
    if (tokenReduction > 0.1) score += 0.2;
    if (optimized.length > original.length * 0.8) score += 0.1; // Not over-compressed

    return Math.min(1, score);
  }
}

interface OptimizationRule {
  name: string;
  pattern?: RegExp;
  replacement?: string | ((match: string) => string);
  condition?: (prompt: string) => boolean;
  action?: (prompt: string) => string;
  reason: string;
}

export const promptOptimizer = new PromptOptimizer();

// ==================== Template Service ====================

export class PromptTemplateService {
  async createTemplate(input: {
    name: string;
    description?: string;
    category: IPromptTemplate['category'];
    template: string;
    variables: IPromptTemplate['variables'];
    modelOverrides?: IPromptTemplate['modelOverrides'];
    tags?: string[];
    isPublic?: boolean;
    createdBy: string;
    organizationId?: string;
    teamId?: string;
  }): Promise<IPromptTemplate> {
    return PromptTemplate.create({
      ...input,
      createdBy: input.createdBy,
      version: 1,
    });
  }

  async getTemplate(id: string): Promise<IPromptTemplate | null> {
    return PromptTemplate.findById(id);
  }

  async listTemplates(filters: {
    organizationId?: string;
    teamId?: string;
    userId?: string;
    category?: string;
    isPublic?: boolean;
    tags?: string[];
    search?: string;
  }): Promise<IPromptTemplate[]> {
    const query: any = {};

    if (filters.organizationId) query.organizationId = filters.organizationId;
    if (filters.teamId) query.teamId = filters.teamId;
    if (filters.userId) query.userId = filters.userId;
    if (filters.category) query.category = filters.category;
    if (filters.isPublic !== undefined) query.isPublic = filters.isPublic;
    if (filters.tags?.length) query.tags = { $in: filters.tags };
    if (filters.search) query.$text = { $search: filters.search };

    return PromptTemplate.find(query).sort({ updatedAt: -1 }).lean();
  }

  async updateTemplate(id: string, userId: string, updates: Partial<IPromptTemplate>): Promise<IPromptTemplate | null> {
    const template = await PromptTemplate.findById(id);
    if (!template) return null;

    // Check ownership/permissions
    if (template.createdBy.toString() !== userId && template.userId?.toString() !== userId) {
      // Check team/org permissions
      // Implementation depends on your auth system
    }

    const allowedUpdates = ['name', 'description', 'template', 'variables', 'modelOverrides', 'tags', 'isPublic'];
    const filteredUpdates: Record<string, unknown> = {};

    for (const key of allowedUpdates) {
      if (updates[key as keyof IPromptTemplate] !== undefined) {
        filteredUpdates[key] = updates[key as keyof IPromptTemplate];
      }
    }

    // Increment version on template change
    if (updates.template !== undefined) {
      filteredUpdates.version = template.version + 1;
    }

    return PromptTemplate.findByIdAndUpdate(id, { $set: filteredUpdates }, { new: true });
  }

  async deleteTemplate(id: string, userId: string): Promise<boolean> {
    const template = await PromptTemplate.findById(id);
    if (!template) return false;

    if (template.createdBy.toString() !== userId) {
      return false;
    }

    const result = await PromptTemplate.deleteOne({ _id: id });
    return result.deletedCount > 0;
  }

  async renderTemplate(id: string, variables: Record<string, any>): Promise<string> {
    const template = await PromptTemplate.findById(id);
    if (!template) throw new Error('Template not found');

    let rendered = template.template;

    // Validate required variables
    for (const variable of template.variables) {
      if (variable.required && !(variable.name in variables)) {
        if (variable.default !== undefined) {
          variables[variable.name] = variable.default;
        } else {
          throw new Error(`Required variable "${variable.name}" is missing`);
        }
      }
    }

    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      rendered = rendered.replace(regex, String(value));
    }

    return rendered;
  }

  async getTemplateVersions(id: string): Promise<IPromptTemplate[]> {
    // In a full implementation, you'd store version history
    // For now, return just the current version
    const template = await PromptTemplate.findById(id);
    return template ? [template] : [];
  }
}

export const promptTemplateService = new PromptTemplateService();

// ==================== Built-in Templates ====================

export const BUILTIN_TEMPLATES: Omit<IPromptTemplate, '_id' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy'>[] = [
  {
    name: 'Code Review',
    description: 'Comprehensive code review with security, performance, and best practices focus',
    category: 'coding',
    template: `You are an expert code reviewer. Review the following code for:
1. Security vulnerabilities
2. Performance issues
3. Best practices violations
4. Maintainability concerns
5. Test coverage gaps

Code to review:
{{code}}

Language: {{language}}
Context: {{context}}

Provide your review in this format:
## Summary
[Overall assessment]

## Issues Found
### Critical
- [Issue 1]
### High
- [Issue 2]
### Medium
- [Issue 3]
### Low
- [Issue 4]

## Suggestions
- [Suggestion 1]
- [Suggestion 2]

## Code Quality Score: [1-10]`,
    variables: [
      { name: 'code', type: 'string', required: true, description: 'The code to review' },
      { name: 'language', type: 'string', required: true, description: 'Programming language' },
      { name: 'context', type: 'string', required: false, description: 'Additional context about the code' },
    ],
    tags: ['code-review', 'security', 'best-practices'],
    isPublic: true,
    modelOverrides: {
      'claude-3-opus': { temperature: 0.1, maxTokens: 4000 },
      'gpt-4': { temperature: 0.2, maxTokens: 4000 },
    },
  },
  {
    name: 'Bug Fix Assistant',
    description: 'Help diagnose and fix bugs with systematic debugging approach',
    category: 'coding',
    template: `You are a debugging expert. Help me fix this bug:

**Bug Description:** {{bugDescription}}
**Error Message:** {{errorMessage}}
**Stack Trace:** {{stackTrace}}
**Code Context:** {{codeContext}}
**Environment:** {{environment}}
**Steps to Reproduce:** {{reproductionSteps}}

Please provide:
1. Root cause analysis
2. Possible solutions (ranked by likelihood)
3. Code fix with explanation
4. Prevention strategies
5. Test cases to verify the fix`,
    variables: [
      { name: 'bugDescription', type: 'string', required: true },
      { name: 'errorMessage', type: 'string', required: false },
      { name: 'stackTrace', type: 'string', required: false },
      { name: 'codeContext', type: 'string', required: true },
      { name: 'environment', type: 'string', required: false },
      { name: 'reproductionSteps', type: 'string', required: false },
    ],
    tags: ['debugging', 'bug-fix', 'troubleshooting'],
    isPublic: true,
    modelOverrides: {
      'claude-3-opus': { temperature: 0.2, maxTokens: 4000 },
      'gpt-4': { temperature: 0.3, maxTokens: 4000 },
    },
  },
  {
    name: 'API Design Review',
    description: 'Review API design for REST/GraphQL best practices',
    category: 'analysis',
    template: `Review this API design for best practices:

**API Specification:**
{{apiSpec}}

**Requirements:**
{{requirements}}

**Current Implementation:**
{{currentImplementation}}

Evaluate:
1. REST/GraphQL best practices
2. Naming conventions
3. Error handling patterns
4. Pagination and filtering
5. Versioning strategy
6. Security considerations
7. Documentation completeness

Provide specific recommendations with examples.`,
    variables: [
      { name: 'apiSpec', type: 'string', required: true },
      { name: 'requirements', type: 'string', required: false },
      { name: 'currentImplementation', type: 'string', required: false },
    ],
    tags: ['api-design', 'rest', 'graphql', 'architecture'],
    isPublic: true,
  },
  {
    name: 'Technical Documentation Writer',
    description: 'Generate clear, comprehensive technical documentation',
    category: 'writing',
    template: `Write technical documentation for:

**Topic:** {{topic}}
**Target Audience:** {{audience}} (e.g., developers, DevOps, product managers)
**Format:** {{format}} (e.g., markdown, OpenAPI, tutorial)
**Key Points to Cover:**
{{keyPoints}}

**Code Examples Needed:** {{codeExamples}}
**Prerequisites:** {{prerequisites}}

Structure the documentation with:
1. Overview/Introduction
2. Prerequisites
3. Quick Start / Getting Started
4. Core Concepts
5. Detailed Guides
6. API Reference (if applicable)
7. Examples
8. Troubleshooting/FAQ
9. Best Practices
10. Further Reading`,
    variables: [
      { name: 'topic', type: 'string', required: true },
      { name: 'audience', type: 'string', required: true },
      { name: 'format', type: 'string', required: true, default: 'markdown' },
      { name: 'keyPoints', type: 'string', required: true },
      { name: 'codeExamples', type: 'boolean', required: false, default: true },
      { name: 'prerequisites', type: 'string', required: false },
    ],
    tags: ['documentation', 'technical-writing', 'markdown'],
    isPublic: true,
  },
  {
    name: 'Refactoring Assistant',
    description: 'Guide for refactoring legacy code with safety',
    category: 'coding',
    template: `Help me refactor this code safely:

**Current Code:**
{{currentCode}}

**Goals:**
{{goals}}

**Constraints:**
{{constraints}}

**Test Coverage:** {{testCoverage}}
**Dependencies:** {{dependencies}}

Provide:
1. Refactoring plan (step by step)
2. Risk assessment for each step
3. Recommended order of changes
4. Test strategy for verification
5. Rollback plan
6. Code after refactoring (if straightforward)`,
    variables: [
      { name: 'currentCode', type: 'string', required: true },
      { name: 'goals', type: 'string', required: true },
      { name: 'constraints', type: 'string', required: false },
      { name: 'testCoverage', type: 'string', required: false },
      { name: 'dependencies', type: 'string', required: false },
    ],
    tags: ['refactoring', 'legacy-code', 'modernization'],
    isPublic: true,
  },
];

// Initialize built-in templates
export async function initializeBuiltinTemplates(userId: string) {
  for (const template of BUILTIN_TEMPLATES) {
    const existing = await PromptTemplate.findOne({ name: template.name, isPublic: true });
    if (!existing) {
      await PromptTemplate.create({
        ...template,
        createdBy: userId,
        isPublic: true,
      });
    }
  }
}