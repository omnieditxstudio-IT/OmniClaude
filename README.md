# Model Translation Gateway

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3+-61dafb.svg)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-4.27+-000000.svg)](https://www.fastify.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7+-47A248.svg)](https://www.mongodb.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg)](https://www.python.org/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Ready-326CE5.svg)](https://kubernetes.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)

A **Model Translation Gateway** that lets you use **any LLM** (DeepSeek, Llama, Qwen, Gemini, etc.) with **Claude Code**, **Codex**, **Cursor**, **Windsurf**, and other Anthropic-compatible coding agents.

## 🎯 The Problem

Coding agents like Claude Code only work with Anthropic's API. But what if you want to use:
- **DeepSeek Coder** (better at coding, cheaper)
- **Llama 3.1 70B** (open source, self-hosted)
- **Qwen 2.5 Coder** (excellent for code)
- **Gemini 1.5 Pro** (huge context window)
- **Local Ollama models** (free, private)

## 💡 The Solution

This gateway **translates Anthropic API requests** to any provider's format:

```
Claude Code → [Gateway: http://localhost:3000] → [Any Provider]
                  │
                  └── "claude-3-opus" → "deepseek/deepseek-coder"
```

**Result**: Use **any LLM** with **Claude Code** seamlessly!

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **🔄 Model Translation** | Anthropic ↔ OpenAI (OpenRouter), Ollama, Vertex AI, Custom |
| **🗺️ Visual Mapping Builder** | Drag-drop UI to map Claude models → Provider models |
| **🔀 Fallback Chains** | Automatic failover: DeepSeek → Llama → Qwen |
| **🔐 Encrypted API Keys** | AES-256-GCM encryption at rest |
| **🌐 OAuth 2.0** | Google & GitHub login via Better-Auth |
| **📊 Real-time Analytics** | Latency, tokens, costs, errors with charts |
| **🎨 Beautiful Dashboard** | shadcn/ui + Framer Motion + Aceternity UI animations |
| **🐳 Docker Ready** | Production deployment with nginx, MongoDB |
| **⚡ Streaming Support** | Full SSE streaming for all providers |
| **🛠️ Tool Calling** | Translates tool calls across formats |
| **🧠 Semantic Caching** | Redis-based exact + semantic caching with embeddings |
| **🔔 Webhooks** | Event notifications for requests, errors, fallbacks |
| **👥 Teams & Organizations** | Multi-tenant with RBAC, budgets, usage limits |
| **🤖 Smart Routing** | Python router with adaptive ML-based selection, circuit breakers |
| **📝 Prompt Templates** | Versioned templates with variables, optimization, rendering |
| **🚀 Prompt Optimization** | Auto-compress, structure, disambiguate, add examples |
| **☸️ Kubernetes Native** | Helm charts, HPA, ServiceMonitors, NetworkPolicies |
| **🔄 CI/CD Pipeline** | GitHub Actions with tests, security scans, multi-arch builds |
| **📦 TypeScript/Python SDKs** | Full-featured clients for easy integration |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- MongoDB 7+
- npm 10+

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/model-translation-gateway.git
cd model-translation-gateway

# Install dependencies
npm install

# Generate encryption key
npm run cli -- generate-key
# Copy the output to .env as ENCRYPTION_KEY

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start development servers
npm run dev
```

### Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development
HOST=0.0.0.0

# MongoDB
MONGODB_URI=mongodb://localhost:27017/gateway

# Encryption (generate with: npm run cli -- generate-key)
ENCRYPTION_KEY=your-base64-encoded-32-byte-key

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars

# OAuth (get from Google/GitHub developer consoles)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Dashboard
DASHBOARD_URL=http://localhost:5173

# Python Router (optional)
PYTHON_ROUTER_URL=http://localhost:8000
PYTHON_ROUTER_ENABLED=false
```

### Access the Dashboard

Open http://localhost:5173 (or http://localhost:3000/docs for API docs)

---

## 📖 Usage Guide

### 1. Add API Keys
Go to **API Keys** page and add keys for your providers:
- **OpenRouter**: Get from [openrouter.ai](https://openrouter.ai)
- **Vertex AI**: Google Cloud service account JSON
- **Ollama**: Usually no key needed (local)
- **Custom**: Any OpenAI-compatible endpoint
- **Anthropic**: Official Anthropic API key

### 2. Configure Endpoints
Go to **Endpoints** page and add provider endpoints:
- Name: "OpenRouter Primary"
- Provider: Select from dropdown
- Base URL: e.g., `https://openrouter.ai/api/v1`
- API Key: Select from your keys
- Click **Sync Models** to fetch available models

### 3. Create Model Mappings
Go to **Model Mappings** - the core feature!

**Example: Coding Setup**
| Claude Model | Provider Model | Fallback |
|--------------|----------------|----------|
| `claude-3-opus` | `deepseek/deepseek-coder` | `qwen/qwen2.5-coder-32b` |
| `claude-3-5-sonnet` | `qwen/qwen2.5-coder-32b` | `meta-llama/llama-3.1-70b` |
| `claude-3-haiku` | `meta-llama/llama-3.1-8b-instant` | - |

Set as **Default** mapping.

### 4. Configure Claude Code

```bash
# Set environment variables
export ANTHROPIC_BASE_URL=http://localhost:3000
export ANTHROPIC_API_KEY=any-string-works  # Gateway validates via user session
```

Or in Claude Code settings:
```json
{
  "apiBaseUrl": "http://localhost:3000",
  "apiKey": "gateway-user-key"
}
```

### 5. Use Unlimited! 🎉

Now when you use **Claude Code**, it thinks it's talking to Anthropic but actually uses your mapped models!

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
                              CLI Entry Point
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
                    Fastify API Server (Port 3000)
       ┌─────────────┬─────────────┬─────────────┬──────────┬──────────┐
       ▼             ▼             ▼             ▼          ▼          ▼
   ┌────────┐  ┌───────────┐  ┌──────────┐  ┌────────┐ ┌────────┐ ┌────────┐
   │  Auth  │  │ Dashboard │  │  Proxy   │  │ Admin  │ │ Health │ │Prompt  │
   │ Routes │  │  REST API │  │ Engine   │  │ Routes │ │ Routes │ │Routes  │
   └────────┘  └───────────┘  └──────────┘  └────────┘ └────────┘ └────────┘
                        │             │                    │
                        ▼             ▼                    ▼
                   ┌─────────┐  ┌──────────────────┐ ┌─────────────┐
                   │ MongoDB │  │ Translation      │ │   Redis     │
                   │ (Users, │  │ Engine           │ │  (Cache,    │
                   │ Keys,   │  │ ├─ Anthropic→    │ │  Sessions,  │
                   │ Mappings)│  │ │  OpenAI       │ │  Pub/Sub)   │
                   └─────────┘  │ ├─ Anthropic→    │ └─────────────┘
                                │ │  Ollama       │
                                │ ├─ Anthropic→    │
                                │ │  Vertex       │
                                │ └─ Python Router │
                                └──────────────────┘
                                         │
                                         ▼
                                ┌──────────────────┐
                                │  Python Router   │
                                │  (Port 8000)     │
                                │ ├─ Adaptive ML   │
                                │ ├─ Circuit Break │
                                │ ├─ Load Balance  │
                                │ └─ Health Checks │
                                └──────────────────┘
```

### Translation Engine

| From → To | Format |
|-----------|--------|
| Anthropic → OpenAI | Messages → Chat Completions |
| Anthropic → Ollama | Messages → Chat Completions + options |
| Anthropic → Vertex | Messages → Gemini Contents |
| Anthropic → Anthropic | Passthrough |

Supports: **Streaming**, **Tool Calling**, **Vision**, **System Prompts**, **Temperature**, **Max Tokens**

### Python Router (Advanced Routing)

| Feature | Description |
|---------|-------------|
| **Adaptive ML Routing** | Learns from request outcomes to optimize model selection |
| **Circuit Breakers** | Automatic failover with half-open recovery |
| **Multiple Strategies** | Round-robin, Least Latency, Least Errors, Cost Optimized, Priority, Weighted, Adaptive |
| **Health Checks** | Continuous endpoint monitoring with Redis persistence |
| **Metrics & Analytics** | Prometheus metrics, latency percentiles, cost estimation |
| **Fallback Chains** | Configurable multi-level fallback with priority |

---

## 🛠️ Development

### Project Structure

```
gateway/
├── cli/                    # CLI tool (commander.js)
├── server/                 # Fastify API Server
│   ├── src/
│   │   ├── config/         # Config, Auth, Database
│   │   ├── models/         # Mongoose Models
│   │   ├── routes/         # API Routes
│   │   ├── services/       # Business Logic
│   │   └── index.ts        # Entry point
├── dashboard/              # React Dashboard
│   ├── src/
│   │   ├── components/     # UI Components (shadcn/ui)
│   │   ├── pages/          # Page Components
│   │   ├── hooks/          # Custom Hooks
│   │   ├── lib/            # Utilities, API Client
│   │   └── App.tsx         # Main App
├── python-router/          # Python Routing Service
│   └── main.py             # FastAPI App
├── shared/                 # Shared Types
├── docker/                 # Docker Files
└── docs/                   # Documentation
```

### Commands

```bash
# Development
npm run dev                 # Start all dev servers
npm run dev:server          # Server only
npm run dev:dashboard       # Dashboard only

# Build
npm run build               # Build all packages
npm run build:server        # Build server
npm run build:dashboard     # Build dashboard

# Database
npm run db:migrate          # Run migrations
npm run db:seed             # Seed test data

# CLI
npm run cli -- start        # Start gateway
npm run cli -- dashboard    # Open dashboard
npm run cli -- test mapping <id>  # Test a mapping

# Docker
npm run docker:build        # Build images
npm run docker:up           # Start containers
npm run docker:down         # Stop containers
```

---

## 🔧 Configuration

### Provider-Specific Setup

#### OpenRouter
```bash
# Get API key from https://openrouter.ai/keys
# Base URL: https://openrouter.ai/api/v1
```

#### Vertex AI (Gemini)
```bash
# 1. Enable Vertex AI API in Google Cloud
# 2. Create service account with "Vertex AI User" role
# 3. Download JSON key
# 4. Base URL: https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT/locations/us-central1/publishers/google/models
```

#### Ollama (Local)
```bash
# Install Ollama: https://ollama.ai
# Pull models: ollama pull llama3.1:70b
# Base URL: http://localhost:11434/v1
# No API key needed
```

#### Custom OpenAI-Compatible
```bash
# Any endpoint implementing /v1/chat/completions
# Base URL: your-endpoint.com/v1
# API Key: your-key (if required)
```

---

## 📊 API Reference

### Authentication
All API routes require authentication via Bearer token (JWT).

```bash
# Get session
GET /api/auth/me

# OAuth callbacks (handled by Better-Auth)
GET /api/auth/sign-in/social?provider=google
GET /api/auth/callback/google
```

### API Keys
```bash
GET    /api/keys              # List keys
POST   /api/keys              # Create key
GET    /api/keys/:id          # Get key
PATCH  /api/keys/:id          # Update key
DELETE /api/keys/:id          # Delete key
POST   /api/keys/:id/test     # Test key
```

### Endpoints
```bash
GET    /api/endpoints                    # List endpoints
POST   /api/endpoints                    # Create endpoint
GET    /api/endpoints/:id                # Get endpoint
PATCH  /api/endpoints/:id                # Update endpoint
DELETE /api/endpoints/:id                # Delete endpoint
POST   /api/endpoints/:id/sync-models    # Sync models
GET    /api/endpoints/:id/health         # Health check
```

### Model Mappings
```bash
GET    /api/mappings                    # List mappings
POST   /api/mappings                    # Create mapping
GET    /api/mappings/:id                # Get mapping
PATCH  /api/mappings/:id                # Update mapping
DELETE /api/mappings/:id                # Delete mapping
POST   /api/mappings/:id/set-default    # Set as default
POST   /api/mappings/:id/validate       # Validate mapping
POST   /api/mappings/:id/test           # Test mapping
```

### Proxy (Anthropic-Compatible)
```bash
POST   /v1/messages          # Anthropic Messages API
POST   /v1/complete          # Legacy completions
GET    /v1/models            # List available models
```

---

## 🐳 Production Deployment

### Docker Compose

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Kubernetes (Helm)

```bash
# Coming soon - Helm charts for K8s deployment
```

### Environment-Specific Configs

Create `.env.production`:
```env
NODE_ENV=production
MONGODB_URI=mongodb://mongodb:27017/gateway
ENCRYPTION_KEY=production-key
JWT_SECRET=production-jwt-secret
JWT_REFRESH_SECRET=production-refresh-secret
OAUTH_REDIRECT_URI=https://yourdomain.com/api/auth/callback
DASHBOARD_URL=https://yourdomain.com
PYTHON_ROUTER_ENABLED=true
```

### SSL/TLS

Place certificates in `docker/ssl/`:
```
docker/ssl/
├── fullchain.pem
└── privkey.pem
```

---

## 🧪 Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Load testing (requires running server)
npm run test:load
```

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- TypeScript strict mode
- ESLint + Prettier
- Conventional commits
- 100% type coverage for new code

---

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **[Better-Auth](https://www.better-auth.com/)** - Modern authentication
- **[Arctic](https://github.com/osohq/arctic)** - OAuth library
- **[shadcn/ui](https://ui.shadcn.com/)** - Beautiful components
- **[Framer Motion](https://www.framer.com/motion/)** - Animations
- **[Aceternity UI](https://ui.aceternity.com/)** - Animated components
- **[Fastify](https://www.fastify.io/)** - Fast web framework
- **[MongoDB](https://www.mongodb.com/)** - Database

---

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/model-translation-gateway/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/model-translation-gateway/discussions)
- **Discord**: [Join our community](https://discord.gg/your-invite)

---

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=yourusername/model-translation-gateway&type=Date)](https://star-history.com/#yourusername/model-translation-gateway&Date)

---

**Made with ❤️ for the developer community**

*Use any LLM with Claude Code. No limits. No compromises.*