# Model Translation Gateway - Project Specification

## Overview
A gateway service that translates Anthropic/Claude API requests to various LLM provider formats (OpenRouter, Vertex AI, Ollama, custom endpoints), allowing coding agents like **Claude Code**, **Codex**, **Cursor**, **Windsurf** to use any LLM through the familiar Anthropic API interface.

## Core Concept
```
Claude Code → [Local Gateway: http://localhost:3000] → [Mapped Provider: OpenRouter/Ollama/Custom]
                    │
                    └── Model ID Mapping: "claude-3-opus" → "deepseek/deepseek-coder"
```

Users configure:
1. **Provider Endpoints** (OpenRouter, Vertex AI, Ollama, Custom HTTP)
2. **API Keys** for each provider
3. **Model Mappings** - Map any Claude model ID to any provider model

## Tech Stack

| Component | Technology |
|-----------|------------|
| **API Server** | Node.js (Fastify) + TypeScript |
| **Database** | MongoDB (Mongoose ODM) |
| **Auth** | OAuth 2.0 + JWT (Google/GitHub providers) |
| **Dashboard** | React + Vite + TailwindCSS |
| **Translation Engine** | TypeScript (core) + Python (advanced routing) |
| **CLI** | Node.js (commander.js) |
| **Process Manager** | PM2 (production) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
                        CLI Entry Point
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
                      Fastify API Server (Port 3000)
         ┌──────────────────┬──────────────────┬────────────────┐
         ▼                  ▼                  ▼                ▼
   ┌──────────┐       ┌────────────┐    ┌───────────┐    ┌────────────┐
   │  Auth    │       │  Dashboard │    │  Proxy    │    │  Admin     │
   │  Routes  │       │  REST API  │    │  Engine   │    │  Routes    │
   └──────────┘       └────────────┘    └───────────┘    └────────────┘
                            │                  │
                            ▼                  ▼
                     ┌────────────┐    ┌─────────────────┐
                     │  MongoDB   │    │ Translation     │
                     │  (Models,  │    │ Engine          │
                     │  Keys,     │    │ ├─ Anthropic→   │
                     │  Mappings) │    │ │  OpenAI       │
                     └────────────┘    │ ├─ Anthropic→   │
                                       │ │  Ollama       │
                                       │ ├─ Anthropic→   │
                                       │ │  Vertex       │
                                       │ └─ Python       │
                                       │    Router (opt) │
                                       └─────────────────┘
```

---

## Database Schemas (MongoDB)

### User
```typescript
interface User {
  _id: ObjectId;
  email: string;
  name: string;
  avatar?: string;
  provider: 'google' | 'github' | 'local';
  providerId: string;
  createdAt: Date;
  updatedAt: Date;
  settings: UserSettings;
}

interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  defaultProvider?: ObjectId;
  requestTimeout: number; // ms
}
```

### ApiKey (encrypted at rest)
```typescript
interface ApiKey {
  _id: ObjectId;
  userId: ObjectId;
  name: string; // "My OpenRouter Key"
  provider: ProviderType;
  keyEncrypted: string; // AES-256-GCM encrypted
  keyHash: string; // Last 4 chars for display
  isActive: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
}

type ProviderType = 'openrouter' | 'vertex' | 'ollama' | 'custom' | 'anthropic';
```

### Endpoint
```typescript
interface Endpoint {
  _id: ObjectId;
  userId: ObjectId;
  name: string; // "OpenRouter Primary"
  provider: ProviderType;
  baseUrl: string; // "https://openrouter.ai/api/v1"
  apiKeyId: ObjectId; // Reference to ApiKey
  models: EndpointModel[]; // Available models at this endpoint
  config: EndpointConfig;
  isActive: boolean;
  priority: number; // For load balancing
  createdAt: Date;
  updatedAt: Date;
}

interface EndpointModel {
  id: string; // Provider's model ID: "deepseek/deepseek-coder"
  name: string; // Display name
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
  pricing?: ModelPricing;
}

interface EndpointConfig {
  timeout: number;
  maxRetries: number;
  headers?: Record<string, string>; // Custom headers
  // For Ollama
  ollamaOptions?: {
    numCtx?: number;
    temperature?: number;
  };
}

interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
  currency: 'USD';
}
```

### ModelMapping (The Core Feature)
```typescript
interface ModelMapping {
  _id: ObjectId;
  userId: ObjectId;
  name: string; // "Coding Setup"
  description?: string;
  mappings: ModelMappingEntry[];
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ModelMappingEntry {
  // What Claude Code requests
  claudeModelId: string; // "claude-3-opus-20240229", "claude-3-5-sonnet"
  
  // Where to route it
  endpointId: ObjectId;
  providerModelId: string; // "deepseek/deepseek-coder", "llama-3.1-70b"
  
  // Optional overrides
  overrides?: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    tools?: ToolConfig[];
  };
  
  // Fallback chain
  fallbacks?: FallbackEntry[];
}

interface FallbackEntry {
  endpointId: ObjectId;
  providerModelId: string;
  priority: number;
}
```

### RequestLog (Analytics)
```typescript
interface RequestLog {
  _id: ObjectId;
  userId: ObjectId;
  mappingId?: ObjectId;
  claudeModelId: string;
  providerModelId: string;
  endpointId: ObjectId;
  requestType: 'messages' | 'completions' | 'embeddings';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  statusCode: number;
  error?: string;
  createdAt: Date;
}
```

---

## API Endpoints

### Authentication
```
POST   /api/auth/google          # Google OAuth callback
POST   /api/auth/github          # GitHub OAuth callback
POST   /api/auth/refresh         # Refresh access token
POST   /api/auth/logout          # Revoke tokens
GET    /api/auth/me              # Current user info
```

### API Keys
```
GET    /api/keys                 # List user's API keys
POST   /api/keys                 # Add new API key
GET    /api/keys/:id             # Get key details (masked)
PATCH  /api/keys/:id             # Update key (name, active)
DELETE /api/keys/:id             # Delete key
POST   /api/keys/:id/test        # Test key validity
```

### Endpoints
```
GET    /api/endpoints                    # List endpoints
POST   /api/endpoints                    # Create endpoint
GET    /api/endpoints/:id                # Get endpoint details
PATCH  /api/endpoints/:id                # Update endpoint
DELETE /api/endpoints/:id                # Delete endpoint
POST   /api/endpoints/:id/sync-models    # Fetch models from provider
GET    /api/endpoints/:id/health         # Health check
```

### Model Mappings
```
GET    /api/mappings                     # List mappings
POST   /api/mappings                     # Create mapping
GET    /api/mappings/:id                 # Get mapping details
PATCH  /api/mappings/:id                 # Update mapping
DELETE /api/mappings/:id                 # Delete mapping
POST   /api/mappings/:id/set-default     # Set as default
POST   /api/mappings/:id/validate        # Test mapping
```

### Proxy Engine (Anthropic-Compatible)
```
POST   /v1/messages                      # Anthropic Messages API
POST   /v1/complete                      # Legacy completions
GET    /v1/models                        # List available models (mapped)
```

---

## Translation Engine

### Anthropic → OpenAI Format (OpenRouter, Custom OpenAI-compatible)
```typescript
// Input: Anthropic Messages API
{
  model: "claude-3-opus",
  messages: [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi!" },
    { role: "user", content: "How are you?" }
  ],
  system: "You are helpful",
  max_tokens: 1000,
  temperature: 0.7,
  tools: [...],
  tool_choice: "auto"
}

// Output: OpenAI Chat Completions
{
  model: "deepseek/deepseek-coder",
  messages: [
    { role: "system", content: "You are helpful" },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi!" },
    { role: "user", content: "How are you?" }
  ],
  max_tokens: 1000,
  temperature: 0.7,
  tools: [...], // Converted format
  tool_choice: "auto"
}
```

### Anthropic → Ollama Format
```typescript
// Ollama uses OpenAI-compatible format but with different options
{
  model: "llama3.1:70b",
  messages: [...],
  options: {
    num_ctx: 32768,
    temperature: 0.7,
    num_predict: 1000
  }
}
```

### Anthropic → Vertex AI (Gemini)
```typescript
// Vertex AI Gemini format
{
  contents: [
    { role: "user", parts: [{ text: "Hello" }] },
    { role: "model", parts: [{ text: "Hi!" }] }
  ],
  systemInstruction: { parts: [{ text: "You are helpful" }] },
  generationConfig: {
    maxOutputTokens: 1000,
    temperature: 0.7
  },
  tools: [...]
}
```

### Streaming Response Translation
- **SSE (Server-Sent Events)** for Anthropic streaming
- Convert provider streaming → Anthropic streaming format
- Handle tool calls, thinking blocks, citations

---

## Dashboard UI (React + Tailwind)

### Pages
1. **Login/OAuth** - Clean auth page
2. **Dashboard Home** - Overview stats, quick actions
3. **API Keys** - CRUD + test keys
4. **Endpoints** - CRUD + sync models + health checks
5. **Model Mappings** - Visual mapping builder
   - Drag-drop to map Claude models → Provider models
   - Fallback chain configuration
   - Per-mapping overrides (temp, max_tokens, system prompt)
6. **Analytics** - Request logs, latency, token usage, costs
7. **Settings** - Theme, account, default mapping

### Key Components
- **MappingBuilder** - Visual interface for model mappings (drag-drop with Framer Motion)
- **EndpointCard** - Shows status, models, health (animated status indicators)
- **KeyManager** - Add/edit/test API keys (show last 4 chars)
- **LogViewer** - Filterable request logs with expandable details
- **CostTracker** - Estimated costs per provider/model (animated charts)

### UI/Animation Stack (Zero Design Effort)
| Library | Purpose |
|---------|---------|
| **shadcn/ui** | Base components (Button, Card, Dialog, Table, Form, Toast, etc.) - beautiful, accessible, customizable |
| **Framer Motion** | Page transitions, drag-drop, micro-interactions, layout animations |
| **Aceternity UI** | Pre-built animated components: Background Beams, Spotlight, Moving Border, Animated Testimonials |
| **Magic UI** | Additional animated components: Number Ticker, Marquee, Orbital, Globe |
| **Recharts** | Animated charts for analytics (works with Framer Motion) |
| **Lucide React** | Clean icons |
| **Tailwind CSS** | Utility-first styling (already configured) |

### Dashboard Visual Features
- **Hero Section** - Background Beams + Spotlight effect (Aceternity)
- **Page Transitions** - Framer Motion layout animations
- **Mapping Builder** - Drag-drop with spring animations
- **Stat Cards** - Number tickers, hover lift effects
- **Status Indicators** - Pulsing dots, smooth color transitions
- **Loading States** - Skeleton screens, shimmer effects
- **Toasts/Notifications** - Slide-in with spring physics

---

## CLI Tool

```bash
# Start the gateway
gateway start                    # Start server + dashboard
gateway start --port 3000        # Custom port
gateway start --no-dashboard     # API only

# Dashboard
gateway dashboard                # Open dashboard in browser
gateway dashboard --port 5173    # Dev server port

# Configuration
gateway config set key value     # Set config
gateway config get key           # Get config
gateway config list              # List all config

# Database
gateway db migrate               # Run migrations
gateway db seed                  # Seed test data
gateway db backup                # Backup MongoDB

# User management
gateway user create --email=x    # Create local user
gateway user list                # List users

# Testing
gateway test mapping <id>        # Test a model mapping
gateway test endpoint <id>       # Test endpoint health
```

---

## Python Service (Advanced Routing)

Separate FastAPI service for:
- **Smart Load Balancing** - Route based on latency, cost, availability
- **Model Fallbacks** - Automatic failover with health checks
- **Request Transformations** - Advanced prompt engineering, injection
- **Response Processing** - Caching, moderation, formatting
- **Analytics Pipeline** - Async log processing, aggregations

```python
# python/router/main.py
from fastapi import FastAPI
from pydantic import BaseModel

class RouteRequest(BaseModel):
    claude_model: str
    user_id: str
    preferred_providers: list[str]
    fallback_enabled: bool
    cost_optimize: bool
    latency_optimize: bool

class RouteResponse(BaseModel):
    endpoint_id: str
    provider_model: str
    reasoning: str

app = FastAPI()

@app.post("/route", response_model=RouteResponse)
async def route_request(req: RouteRequest):
    # Intelligent routing logic
    pass
```

Communication: Node.js ↔ Python via HTTP or gRPC

---

## Security

1. **API Keys Encrypted** - AES-256-GCM with per-user keys
2. **OAuth 2.0** - Google, GitHub providers
3. **JWT Tokens** - Short-lived access (15min), long-lived refresh (30d)
4. **Rate Limiting** - Per-user, per-endpoint, per-model
5. **CORS** - Configurable origins
6. **Helmet** - Security headers
7. **Input Validation** - Zod schemas on all inputs
8. **Audit Logs** - All config changes logged

---

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development
HOST=0.0.0.0

# MongoDB
MONGODB_URI=mongodb://localhost:27017/gateway
MONGODB_URI_TEST=mongodb://localhost:27017/gateway_test

# Encryption
ENCRYPTION_KEY=32-byte-base64-key-here
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret

# OAuth
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Dashboard
DASHBOARD_PORT=5173
DASHBOARD_URL=http://localhost:5173

# Python Router (optional)
PYTHON_ROUTER_URL=http://localhost:8000
PYTHON_ROUTER_ENABLED=false

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json
```

---

## Project Structure

```
gateway/
├── cli/                    # CLI entry point
│   ├── index.ts
│   ├── commands/
│   │   ├── start.ts
│   │   ├── dashboard.ts
│   │   ├── config.ts
│   │   ├── db.ts
│   │   ├── user.ts
│   │   └── test.ts
│   └── utils.ts
│
├── server/                 # Fastify API Server
│   ├── index.ts            # Entry point
│   ├── config/             # Configuration
│   │   ├── index.ts
│   │   ├── database.ts
│   │   ├── encryption.ts
│   │   └── oauth.ts
│   ├── plugins/            # Fastify plugins
│   │   ├── auth.ts
│   │   ├── rate-limit.ts
│   │   ├── cors.ts
│   │   └── helmet.ts
│   ├── routes/             # API Routes
│   │   ├── auth.ts
│   │   ├── keys.ts
│   │   ├── endpoints.ts
│   │   ├── mappings.ts
│   │   ├── proxy.ts        # Anthropic-compatible proxy
│   │   ├── admin.ts
│   │   └── health.ts
│   ├── services/           # Business Logic
│   │   ├── auth.service.ts
│   │   ├── key.service.ts
│   │   ├── endpoint.service.ts
│   │   ├── mapping.service.ts
│   │   ├── translation.service.ts
│   │   ├── provider/
│   │   │   ├── base.ts
│   │   │   ├── openrouter.ts
│   │   │   ├── ollama.ts
│   │   │   ├── vertex.ts
│   │   │   └── custom.ts
│   │   └── python-router.client.ts
│   ├── models/             # Mongoose Models
│   │   ├── User.ts
│   │   ├── ApiKey.ts
│   │   ├── Endpoint.ts
│   │   ├── ModelMapping.ts
│   │   └── RequestLog.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── validation.ts
│   │   └── error-handler.ts
│   └── utils/
│       ├── logger.ts
│       └── helpers.ts
│
├── dashboard/              # React Dashboard
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── stores/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── python-router/          # Python Routing Service
│   ├── main.py
│   ├── router/
│   │   ├── __init__.py
│   │   ├── engine.py
│   │   ├── strategies.py
│   │   └── health.py
│   ├── models/
│   │   └── schemas.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── shared/                 # Shared types/constants
│   ├── types/
│   │   ├── api.ts
│   │   ├── models.ts
│   │   └── providers.ts
│   └── constants.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docker/
│   ├── Dockerfile.server
│   ├── Dockerfile.dashboard
│   ├── Dockerfile.python
│   └── docker-compose.yml
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── deployment.md
│   └── development.md
│
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Project setup, TypeScript config, ESLint/Prettier
- [ ] MongoDB connection, base models
- [ ] Fastify server with plugins
- [ ] OAuth authentication (Google + GitHub)
- [ ] JWT token management
- [ ] Basic CLI structure

### Phase 2: Core API (Week 2)
- [ ] API Keys CRUD + encryption
- [ ] Endpoints CRUD + model sync
- [ ] Model Mappings CRUD
- [ ] Validation & error handling
- [ ] Request logging middleware

### Phase 3: Translation Engine (Week 3)
- [ ] Anthropic → OpenAI format converter
- [ ] Anthropic → Ollama format converter
- [ ] Anthropic → Vertex AI converter
- [ ] Streaming response handling
- [ ] Tool calling translation
- [ ] Fallback chain execution

### Phase 4: Proxy & Testing (Week 4)
- [ ] Anthropic-compatible proxy endpoints
- [ ] Integration testing with real providers
- [ ] Load testing & optimization
- [ ] Error handling & retries

### Phase 5: Dashboard (Week 5-6)
- [ ] React + Vite + Tailwind setup
- [ ] Auth pages + protected routes
- [ ] API Keys management UI
- [ ] Endpoints management UI
- [ ] **Model Mapping Builder** (core feature)
- [ ] Analytics/Logs viewer
- [ ] Settings page

### Phase 6: Python Router & Polish (Week 7)
- [ ] Python FastAPI routing service
- [ ] Smart load balancing strategies
- [ ] Health monitoring
- [ ] CLI polish + documentation
- [ ] Docker compose for production

---

## Usage Example

### 1. User Setup via Dashboard
```
1. Login with Google/GitHub
2. Add API Key: "OpenRouter Key" → sk-or-xxx
3. Add Endpoint: "OpenRouter" → https://openrouter.ai/api/v1
4. Sync Models → Shows: deepseek-coder, llama-3.1-70b, qwen2.5-coder...
5. Create Mapping: "Claude Code Mapping"
   - claude-3-opus → deepseek/deepseek-coder
   - claude-3-sonnet → qwen/qwen2.5-coder-32b
   - claude-3-haiku → meta-llama/llama-3.1-8b-instant
   - Fallback: deepseek → llama → qwen
6. Set as Default
```

### 2. Configure Claude Code
```bash
# In Claude Code settings or environment
ANTHROPIC_BASE_URL=http://localhost:3000
ANTHROPIC_API_KEY=gateway-user-key-xxx  # Any string, validated by gateway
```

### 3. Use Unlimited
```
Claude Code thinks it's talking to Anthropic
→ Requests go to http://localhost:3000/v1/messages
→ Gateway translates to OpenRouter format
→ Uses DeepSeek Coder (or whatever mapped)
→ Returns response in Anthropic format
→ Claude Code works with any model!
```

---

## Future Enhancements

- [ ] **Multi-user teams/organizations**
- [ ] **Model benchmarking** - Auto-test latency/quality
- [ ] **Prompt templates** - Per-model prompt optimization
- [ ] **Request caching** - Semantic caching for repeated queries
- [ ] **Usage budgets** - Per-user/model cost limits
- [ ] **Webhook notifications** - On errors, quota exceeded
- [ ] **Plugin system** - Custom translators, middleware
- [ ] **Kubernetes deployment** - Helm charts, operators
- [ ] **Metrics export** - Prometheus/Grafana dashboards

---

## Success Criteria

1. ✅ Claude Code works seamlessly with any mapped model
2. ✅ Sub-100ms translation overhead
3. ✅ Support for 5+ providers (OpenRouter, Ollama, Vertex, Custom, Anthropic)
4. ✅ Visual mapping builder in dashboard
5. ✅ Fallback chains work automatically
6. ✅ Encrypted API key storage
7. ✅ OAuth login + session management
8. ✅ Request analytics & cost tracking
9. ✅ Single CLI command to start everything
10. ✅ Production-ready Docker deployment