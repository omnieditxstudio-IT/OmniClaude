# LLM Gateway

Use ANY LLM with Claude Code, Cursor, Codex, Aider, and any AI tool.

## Install

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/yourusername/llm-gateway/main/install.sh | bash
```

**Windows PowerShell:**
```powershell
irm https://raw.githubusercontent.com/yourusername/llm-gateway/main/install.ps1 | iex
```

**Windows CMD:**
```bat
curl -fsSL https://raw.githubusercontent.com/yourusername/llm-gateway/main/install.bat -o install.bat && install.bat
```

## Commands
```bash
llm-gateway setup     # First-time setup
llm-gateway start     # Start gateway
llm-gateway open      # Open UI in browser
llm-gateway stop      # Stop gateway
llm-gateway reset     # Reset config
llm-gateway uninstall # Remove everything
```

## Use with Claude Code

**macOS / Linux:**
```bash
export ANTHROPIC_BASE_URL=http://localhost:8080
export ANTHROPIC_AUTH_TOKEN=any-value
claude
```

**Windows PowerShell:**
```powershell
$env:ANTHROPIC_BASE_URL="http://localhost:8080"
$env:ANTHROPIC_AUTH_TOKEN="any-value"
claude
```

**Windows CMD:**
```bat
set ANTHROPIC_BASE_URL=http://localhost:8080
set ANTHROPIC_AUTH_TOKEN=any-value
claude
```

Supports: OpenAI, Anthropic, Google, Ollama, Groq, DeepSeek, vLLM, LM Studio, Azure, Bedrock, and 15+ more providers.
