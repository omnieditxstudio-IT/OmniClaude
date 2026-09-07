# LLM Gateway - Windows PowerShell Installer

Write-Host ""
Write-Host "Installing LLM Gateway..." -ForegroundColor Cyan
Write-Host ""

# Check Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node.js is not installed. Please install Node.js 20+ from https://nodejs.org" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Node.js detected: $($node.Version)" -ForegroundColor Green

# Install globally
Write-Host "Installing LLM Gateway globally..." -ForegroundColor Yellow
npm install -g llm-gateway

if ($LASTEXITCODE -ne 0) {
    Write-Host "Installation failed!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Run setup wizard:"
Write-Host "     llm-gateway setup"
Write-Host ""
Write-Host "  2. Start the gateway:"
Write-Host "     llm-gateway start"
Write-Host ""
Write-Host "  3. Use with Claude Code:"
Write-Host "     `$env:ANTHROPIC_BASE_URL='http://localhost:8080'"
Write-Host "     `$env:ANTHROPIC_AUTH_TOKEN='any-value'"
Write-Host "     claude"
Write-Host ""

Read-Host "Press Enter to exit"
