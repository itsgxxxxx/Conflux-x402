#!/bin/bash
set -e

echo "=== Building x402 MCP Server Deployment Package ==="

# Get the root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$ROOT_DIR/deploy-temp"
PACKAGE_NAME="x402-mcp-server-deploy-v2.tar.gz"

# Clean up any previous deployment directory
echo "Cleaning up previous deployment..."
rm -rf "$DEPLOY_DIR"
rm -f "$ROOT_DIR/$PACKAGE_NAME"

# Create deployment directory structure
echo "Creating deployment directory structure..."
mkdir -p "$DEPLOY_DIR/mcp-server"
mkdir -p "$DEPLOY_DIR/node_modules/@conflux-x402/chain-config"

# Build chain-config package
echo "Building chain-config package..."
cd "$ROOT_DIR/packages/chain-config"
pnpm build

# Build mcp-server package
echo "Building mcp-server package..."
cd "$ROOT_DIR/packages/mcp-server"
pnpm build

# Copy built mcp-server to deployment
echo "Copying mcp-server to deployment..."
cp -r "$ROOT_DIR/packages/mcp-server/dist" "$DEPLOY_DIR/mcp-server/"
cp "$ROOT_DIR/packages/mcp-server/package.json" "$DEPLOY_DIR/mcp-server/"

# Create a temporary package.json for installing all dependencies with npm
echo "Creating temporary package.json for dependency installation..."
cat > "$DEPLOY_DIR/package.json" << 'EOF'
{
  "name": "x402-mcp-server-deploy",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "@x402/core": "^2.3.0",
    "@x402/evm": "^2.3.0",
    "@x402/fetch": "^2.3.0",
    "viem": "^2.21.0",
    "zod": "^3.23.0"
  }
}
EOF

# Install all dependencies using npm (not pnpm) for flat structure
echo "Installing dependencies with npm..."
cd "$DEPLOY_DIR"
npm install --omit=dev --legacy-peer-deps

# NOW copy built chain-config to deployment (after npm install)
echo "Copying chain-config to deployment..."
mkdir -p "$DEPLOY_DIR/node_modules/@conflux-x402/chain-config/dist"
cp -r "$ROOT_DIR/packages/chain-config/dist/"* "$DEPLOY_DIR/node_modules/@conflux-x402/chain-config/dist/"
cp "$ROOT_DIR/packages/chain-config/package.json" "$DEPLOY_DIR/node_modules/@conflux-x402/chain-config/"

# Update mcp-server package.json to use local chain-config
echo "Updating mcp-server package.json..."
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

# Update chain-config package.json
echo "Updating chain-config package.json..."
cat > "$DEPLOY_DIR/node_modules/@conflux-x402/chain-config/package.json" << 'EOF'
{
  "name": "@conflux-x402/chain-config",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "viem": "^2.21.0"
  }
}
EOF

# Remove the temporary root package.json
rm "$DEPLOY_DIR/package.json"
rm "$DEPLOY_DIR/package-lock.json"

# Create README for deployment
echo "Creating deployment README..."
cat > "$DEPLOY_DIR/README.md" << 'EOF'
# x402 MCP Server Deployment Package v2

This package contains the x402 MCP Server with all dependencies properly resolved.

## Structure

```
.
├── mcp-server/
│   └── dist/
│       └── index.js          # MCP server entry point
└── node_modules/
    ├── @conflux-x402/
    │   └── chain-config/     # Chain configuration package
    ├── viem/                 # Ethereum library
    └── ... (all other dependencies)
```

## Installation on VPS

1. Upload this package to your VPS:
   ```bash
   scp x402-mcp-server-deploy-v2.tar.gz user@your-vps:/tmp/
   ```

2. SSH into your VPS and extract:
   ```bash
   ssh user@your-vps
   cd /root/.openclaw/mcp-servers/

   # Backup old installation if needed
   mv x402 x402-backup-$(date +%Y%m%d-%H%M%S)

   # Extract new package
   tar -xzf /tmp/x402-mcp-server-deploy-v2.tar.gz
   mv deploy-temp x402
   ```

3. Test the installation:
   ```bash
   cd /root/.openclaw/mcp-servers/x402
   node mcp-server/dist/index.js
   ```

   You should see: `x402 MCP Server started` (on stderr)

4. Configure your MCP client to use:
   ```
   /root/.openclaw/mcp-servers/x402/mcp-server/dist/index.js
   ```

## Environment Configuration

Create a `.env` file in the mcp-server directory:

```bash
cd /root/.openclaw/mcp-servers/x402/mcp-server
cat > .env << 'ENVEOF'
PRIVATE_KEY=your_private_key_here
RPC_URL=https://evm.confluxrpc.com
USDT0_ADDRESS=0xfe97E85d13ABD9c1c33384E796F10B73905637cE
ENVEOF
```

## Troubleshooting

If you encounter module resolution errors:

1. Check that all dependencies are present:
   ```bash
   ls -la node_modules/viem
   ls -la node_modules/@conflux-x402/chain-config
   ```

2. Verify Node.js version (requires >= 18.0.0):
   ```bash
   node --version
   ```

3. Test module resolution:
   ```bash
   node -e "import('viem').then(() => console.log('viem OK'))"
   ```

## Package Contents

- Built TypeScript code (compiled to JavaScript)
- All runtime dependencies (no devDependencies)
- Proper module resolution for ESM imports
- Chain configuration for Conflux eSpace

## Version

- Package Version: 0.1.0
- Build Date: $(date)
EOF

# Create tarball
echo "Creating deployment tarball..."
cd "$ROOT_DIR"
tar -czf "$PACKAGE_NAME" -C "$DEPLOY_DIR" .

# Get tarball size
TARBALL_SIZE=$(du -h "$ROOT_DIR/$PACKAGE_NAME" | cut -f1)

echo ""
echo "=== Deployment Package Created Successfully ==="
echo "Package: $ROOT_DIR/$PACKAGE_NAME"
echo "Size: $TARBALL_SIZE"
echo ""
echo "To deploy to VPS:"
echo "1. scp $PACKAGE_NAME user@your-vps:/tmp/"
echo "2. ssh user@your-vps"
echo "3. cd /root/.openclaw/mcp-servers/"
echo "4. tar -xzf /tmp/$PACKAGE_NAME"
echo "5. mv deploy-temp x402"
echo "6. node x402/mcp-server/dist/index.js"
echo ""

# Clean up deployment directory
echo "Cleaning up temporary files..."
rm -rf "$DEPLOY_DIR"

echo "Done!"
