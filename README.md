# LLM Gateway

Use ANY LLM with Claude Code, Cursor, Codex, Aider, and any AI tool.

## Install
```bash
curl -fsSL https://raw.githubusercontent.com/yourusername/llm-gateway/main/install.sh | bash
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
```bash
export ANTHROPIC_BASE_URL=http://localhost:8080
export ANTHROPIC_AUTH_TOKEN=any-value
claude
```

Supports: OpenAI, Anthropic, Google, Ollama, Groq, DeepSeek, vLLM, LM Studio, Azure, Bedrock, and 15+ more providers.
