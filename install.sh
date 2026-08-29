#!/bin/bash
# LLM Gateway - Linux/macOS Installer

set -e

echo "🚀 Installing LLM Gateway..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✓ Node.js $(node -v) detected"

# Install globally
echo "📦 Installing LLM Gateway globally..."
npm install -g .

# Verify installation
echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Run setup wizard:"
echo "     llm-gateway setup"
echo ""
echo "  2. Start the gateway:"
echo "     llm-gateway start"
echo ""
echo "  3. Use with Claude Code:"
echo "     claude --profile llm-gateway"
echo ""
echo "  4. Or point directly:"
echo "     ANTHROPIC_BASE_URL=http://localhost:8080 claude"
echo ""
