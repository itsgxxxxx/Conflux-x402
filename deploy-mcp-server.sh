#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting MCP Server deployment package creation...${NC}"

# Configuration
PROJECT_ROOT="/Users/itsgxxxxx/Vibe Coding/Claude Code/Conflux/conflux-x402-toolkit"
DEPLOY_DIR="$PROJECT_ROOT/deploy-package"
TARBALL_NAME="x402-mcp-server-deploy.tar.gz"

# Clean up previous deployment
if [ -d "$DEPLOY_DIR" ]; then
  echo "Cleaning up previous deployment directory..."
  rm -rf "$DEPLOY_DIR"
fi

# Create deployment directory structure
echo -e "${GREEN}Creating deployment directory structure...${NC}"
mkdir -p "$DEPLOY_DIR/mcp-server"
mkdir -p "$DEPLOY_DIR/node_modules/@conflux-x402/chain-config"

# Copy built mcp-server
echo -e "${GREEN}Copying built mcp-server...${NC}"
cp -r "$PROJECT_ROOT/packages/mcp-server/dist" "$DEPLOY_DIR/mcp-server/"
cp "$PROJECT_ROOT/packages/mcp-server/package.json" "$DEPLOY_DIR/mcp-server/"

# Copy built chain-config to node_modules
echo -e "${GREEN}Copying built chain-config...${NC}"
cp -r "$PROJECT_ROOT/packages/chain-config/dist" "$DEPLOY_DIR/node_modules/@conflux-x402/chain-config/"
cp "$PROJECT_ROOT/packages/chain-config/package.json" "$DEPLOY_DIR/node_modules/@conflux-x402/chain-config/"

# Create standalone package.json for mcp-server
echo -e "${GREEN}Creating standalone package.json...${NC}"
cat > "$DEPLOY_DIR/mcp-server/package.json" << 'EOF'
{
  "name": "@conflux-x402/mcp-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "x402-mcp-server": "./dist/index.js"
  },
  "scripts": {
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@conflux-x402/chain-config": "file:../node_modules/@conflux-x402/chain-config",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "@x402/core": "^2.3.0",
    "@x402/evm": "^2.3.0",
    "@x402/fetch": "^2.3.0",
    "viem": "^2.21.0",
    "zod": "^3.23.0"
  }
}
EOF

# Install production dependencies
echo -e "${GREEN}Installing production dependencies...${NC}"
cd "$DEPLOY_DIR/mcp-server"
npm install --production --no-package-lock

# Create tarball
echo -e "${GREEN}Creating deployment tarball...${NC}"
cd "$PROJECT_ROOT"
tar -czf "$TARBALL_NAME" -C "$DEPLOY_DIR" .

echo -e "${BLUE}Deployment package created successfully!${NC}"
echo -e "${GREEN}Tarball: $PROJECT_ROOT/$TARBALL_NAME${NC}"
echo ""
echo -e "${BLUE}Deployment Instructions:${NC}"
echo "1. Upload tarball to VPS:"
echo "   scp $TARBALL_NAME root@31.170.165.234:/tmp/"
echo ""
echo "2. On VPS, extract and setup:"
echo "   mkdir -p ~/.openclaw/mcp-servers/x402"
echo "   cd ~/.openclaw/mcp-servers/x402"
echo "   tar -xzf /tmp/$TARBALL_NAME"
echo "   chmod +x mcp-server/dist/index.js"
echo ""
echo "3. Test the server:"
echo "   cd ~/.openclaw/mcp-servers/x402/mcp-server"
echo "   node dist/index.js"
echo ""
echo "4. Configure in Claude Desktop (add to config):"
echo '   "x402-mcp-server": {'
echo '     "command": "node",'
echo '     "args": ["~/.openclaw/mcp-servers/x402/mcp-server/dist/index.js"]'
echo '   }'
