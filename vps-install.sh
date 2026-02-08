#!/bin/bash
# Quick deployment commands for x402 MCP Server
# Run this on your VPS after uploading the tarball

set -e

echo "=== x402 MCP Server Deployment ==="
echo ""

# Check Node.js version
echo "Checking Node.js version..."
NODE_VERSION=$(node --version)
echo "Node.js version: $NODE_VERSION"

if ! node -e "process.exit(parseInt(process.version.slice(1)) >= 18 ? 0 : 1)"; then
  echo "ERROR: Node.js >= 18.0.0 required"
  exit 1
fi

# Create directory
echo ""
echo "Creating installation directory..."
mkdir -p ~/.openclaw/mcp-servers/x402

# Extract tarball
echo ""
echo "Extracting deployment package..."
cd ~/.openclaw/mcp-servers/x402
tar -xzf /tmp/x402-mcp-server-deploy.tar.gz

# Set permissions
echo ""
echo "Setting permissions..."
chmod +x mcp-server/dist/index.js

# Test server
echo ""
echo "Testing server (will run for 3 seconds)..."
cd mcp-server
timeout 3 node dist/index.js || true

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Server installed at: ~/.openclaw/mcp-servers/x402/mcp-server"
echo ""
echo "To test manually:"
echo "  cd ~/.openclaw/mcp-servers/x402/mcp-server"
echo "  node dist/index.js"
echo ""
echo "Claude Desktop configuration:"
echo '  "x402-mcp-server": {'
echo '    "command": "ssh",'
echo '    "args": ["root@31.170.165.234", "node", "~/.openclaw/mcp-servers/x402/mcp-server/dist/index.js"]'
echo '  }'
echo ""
