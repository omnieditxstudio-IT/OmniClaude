@echo off
REM LLM Gateway - Windows Installer

echo.
echo 🚀 Installing LLM Gateway...
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed. Please install Node.js 20+ from https://nodejs.org
    pause
    exit /b 1
)

echo ✓ Node.js detected

REM Install globally
echo 📦 Installing LLM Gateway globally...
npm install -g llm-gateway

echo.
echo ✅ Installation complete!
echo.
echo Next steps:
echo   1. Run setup wizard:
echo      llm-gateway setup
echo.
echo   2. Start the gateway:
echo      llm-gateway start
echo.
echo   3. Use with Claude Code:
echo      claude --profile llm-gateway
echo.
echo   4. Or point directly:
echo      set ANTHROPIC_BASE_URL=http://localhost:8080
echo      claude
echo.
pause
