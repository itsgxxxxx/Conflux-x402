# x402 MCP Server Deployment Guide v2

## Problem Analysis

The original deployment had a module resolution issue where `@conflux-x402/chain-config` couldn't find the `viem` package. This occurred because:

1. **pnpm workspace structure**: The local development uses pnpm workspaces with `workspace:*` dependencies
2. **Symlinked dependencies**: pnpm creates symlinks for workspace packages
3. **Hoisted dependencies**: In pnpm, `viem` was hoisted to `mcp-server/node_modules/` but `chain-config` couldn't access it
4. **Broken on VPS**: When deployed, the symlinks broke and the module resolution failed

### Error on VPS
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'viem' imported from
/root/.openclaw/mcp-servers/x402/node_modules/@conflux-x402/chain-config/dist/chains.js
```

## Solution

The new deployment package uses **npm** (not pnpm) to create a flat `node_modules` structure where:
- All dependencies are in a single `node_modules/` directory at the root
- `@conflux-x402/chain-config` is copied as a regular package (not symlinked)
- `viem` and all other dependencies are accessible to all packages
- No workspace dependencies or symlinks

## Package Structure

```
x402/
├── mcp-server/
│   ├── dist/
│   │   └── index.js          # MCP server entry point
│   └── package.json
├── node_modules/
│   ├── @conflux-x402/
│   │   └── chain-config/     # Built chain-config package
│   │       ├── dist/
│   │       └── package.json
│   ├── viem/                 # Ethereum library (accessible to all)
│   ├── @modelcontextprotocol/
│   ├── @x402/
│   └── ... (all other dependencies)
└── README.md
```

## Building the Deployment Package

### Prerequisites
- Node.js >= 18.0.0
- pnpm installed
- All source code in the monorepo

### Build Command

```bash
cd /Users/itsgxxxxx/Vibe\ Coding/Claude\ Code/Conflux/conflux-x402-toolkit
./scripts/build-deployment.sh
```

### What the Script Does

1. **Builds TypeScript packages**
   - Compiles `chain-config` package
   - Compiles `mcp-server` package

2. **Creates deployment structure**
   - Creates temporary deployment directory
   - Copies built code (dist folders)

3. **Installs dependencies with npm**
   - Uses npm (not pnpm) for flat structure
   - Installs all runtime dependencies
   - Omits devDependencies

4. **Copies chain-config**
   - Places built chain-config in `node_modules/@conflux-x402/`
   - Ensures it can access viem from parent node_modules

5. **Creates tarball**
   - Packages everything into `x402-mcp-server-deploy-v2.tar.gz`
   - Size: ~11MB

## Deployment to VPS

### Step 1: Upload Package

```bash
scp x402-mcp-server-deploy-v2.tar.gz root@your-vps:/tmp/
```

### Step 2: Backup Old Installation (Optional)

```bash
ssh root@your-vps
cd /root/.openclaw/mcp-servers/
mv x402 x402-backup-$(date +%Y%m%d-%H%M%S)
```

### Step 3: Extract New Package

```bash
cd /root/.openclaw/mcp-servers/
tar -xzf /tmp/x402-mcp-server-deploy-v2.tar.gz
ls -la
# You should see: mcp-server/, node_modules/, README.md
```

### Step 4: Configure Environment

Create `.env` file in the mcp-server directory:

```bash
cd /root/.openclaw/mcp-servers/x402/mcp-server
cat > .env << 'EOF'
PRIVATE_KEY=your_private_key_here
RPC_URL=https://evm.confluxrpc.com
USDT0_ADDRESS=0xfe97E85d13ABD9c1c33384E796F10B73905637cE
EOF
```

### Step 5: Test the Installation

```bash
cd /root/.openclaw/mcp-servers/x402
node mcp-server/dist/index.js
```

Expected output (on stderr):
```
x402 MCP Server started
```

Press Ctrl+C to stop.

### Step 6: Configure MCP Client

Update your MCP client configuration (e.g., Claude Desktop, Cline) to use:

```json
{
  "mcpServers": {
    "x402-payment": {
      "command": "node",
      "args": ["/root/.openclaw/mcp-servers/x402/mcp-server/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "your_private_key_here",
        "RPC_URL": "https://evm.confluxrpc.com",
        "USDT0_ADDRESS": "0xfe97E85d13ABD9c1c33384E796F10B73905637cE"
      }
    }
  }
}
```

## Verification

### Check Module Resolution

```bash
cd /root/.openclaw/mcp-servers/x402
node -e "import('viem').then(() => console.log('viem: OK'))"
node -e "import('./node_modules/@conflux-x402/chain-config/dist/index.js').then(() => console.log('chain-config: OK'))"
```

Both should output "OK".

### Check Directory Structure

```bash
cd /root/.openclaw/mcp-servers/x402
ls -la node_modules/viem
ls -la node_modules/@conflux-x402/chain-config
ls -la mcp-server/dist
```

All directories should exist.

### Test MCP Server

```bash
cd /root/.openclaw/mcp-servers/x402
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node mcp-server/dist/index.js
```

Should return a JSON response with available tools.

## Troubleshooting

### Error: Cannot find package 'viem'

**Cause**: viem is not in node_modules or path is wrong

**Solution**:
```bash
cd /root/.openclaw/mcp-servers/x402
ls -la node_modules/viem  # Should exist
```

If missing, re-extract the tarball.

### Error: Cannot find module '@conflux-x402/chain-config'

**Cause**: chain-config not properly copied

**Solution**:
```bash
cd /root/.openclaw/mcp-servers/x402
ls -la node_modules/@conflux-x402/chain-config/dist
```

If missing, re-extract the tarball.

### Error: Required environment variable

**Cause**: Missing .env file or environment variables

**Solution**:
```bash
cd /root/.openclaw/mcp-servers/x402/mcp-server
cat .env  # Should show PRIVATE_KEY, RPC_URL, USDT0_ADDRESS
```

### Node.js Version Error

**Cause**: Node.js version < 18.0.0

**Solution**:
```bash
node --version  # Should be >= 18.0.0
# If not, install Node.js 18 or higher
```

## Differences from v1

| Aspect | v1 (Failed) | v2 (Fixed) |
|--------|-------------|------------|
| Package Manager | pnpm | npm |
| Dependency Structure | Hoisted/Symlinked | Flat |
| chain-config Location | Symlinked workspace | Copied to node_modules |
| viem Accessibility | Only in mcp-server/node_modules | In root node_modules |
| Module Resolution | Broken | Working |

## Files Included

- `/Users/itsgxxxxx/Vibe Coding/Claude Code/Conflux/conflux-x402-toolkit/scripts/build-deployment.sh` - Build script
- `/Users/itsgxxxxx/Vibe Coding/Claude Code/Conflux/conflux-x402-toolkit/x402-mcp-server-deploy-v2.tar.gz` - Deployment package (11MB)
- This guide

## Next Steps

1. Upload the tarball to your VPS
2. Extract and configure as described above
3. Test the MCP server
4. Update your MCP client configuration
5. Verify the tools are working
  - `package.json`: Standalone package configuration

- **node_modules/@conflux-x402/chain-config/**: The workspace dependency
  - `dist/`: Compiled chain configuration files
  - `package.json`: Chain config package metadata

## Deployment Steps

### 1. Upload Tarball to VPS

```bash
scp x402-mcp-server-deploy.tar.gz root@31.170.165.234:/tmp/
```

### 2. Extract on VPS

SSH into your VPS and run:

```bash
# Create target directory
mkdir -p ~/.openclaw/mcp-servers/x402

# Navigate to target directory
cd ~/.openclaw/mcp-servers/x402

# Extract tarball
tar -xzf /tmp/x402-mcp-server-deploy.tar.gz

# Make the entry point executable
chmod +x mcp-server/dist/index.js

# Clean up
rm /tmp/x402-mcp-server-deploy.tar.gz
```

### 3. Test the Server

```bash
cd ~/.openclaw/mcp-servers/x402/mcp-server
node dist/index.js
```

The server should start and display MCP protocol messages. Press Ctrl+C to stop.

### 4. Configure Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "x402-mcp-server": {
      "command": "ssh",
      "args": [
        "root@31.170.165.234",
        "node",
        "~/.openclaw/mcp-servers/x402/mcp-server/dist/index.js"
      ]
    }
  }
}
```

### 5. Restart Claude Desktop

Restart Claude Desktop to load the new MCP server configuration.

## Rebuilding the Deployment Package

If you need to rebuild the deployment package after making changes:

```bash
# 1. Build both packages
cd /Users/itsgxxxxx/Vibe\ Coding/Claude\ Code/Conflux/conflux-x402-toolkit
pnpm build

# 2. Run the deployment script
./deploy-mcp-server.sh
```

This will create a fresh `x402-mcp-server-deploy.tar.gz` file.

## Troubleshooting

### Server Won't Start

1. Check Node.js version on VPS (requires >= 18.0.0):
   ```bash
   node --version
   ```

2. Check for missing dependencies:
   ```bash
   cd ~/.openclaw/mcp-servers/x402/mcp-server
   npm ls
   ```

### Import Errors

If you see errors about missing `@conflux-x402/chain-config`:

1. Verify the chain-config package exists:
   ```bash
   ls -la ~/.openclaw/mcp-servers/x402/node_modules/@conflux-x402/chain-config/
   ```

2. Check the symlink in mcp-server:
   ```bash
   ls -la ~/.openclaw/mcp-servers/x402/mcp-server/node_modules/@conflux-x402/
   ```

### Claude Desktop Connection Issues

1. Test SSH connection manually:
   ```bash
   ssh root@31.170.165.234 "node ~/.openclaw/mcp-servers/x402/mcp-server/dist/index.js"
   ```

2. Check Claude Desktop logs for error messages

3. Ensure SSH key authentication is set up (no password prompt)

## Architecture Notes

### Why This Approach?

The deployment uses a `file:` protocol reference in package.json to link the workspace dependency. This approach:

- Avoids publishing private packages to npm
- Maintains the dependency relationship
- Works without workspace tooling (pnpm) on the VPS
- Includes all necessary files in a single tarball

### Directory Structure

```
~/.openclaw/mcp-servers/x402/
├── mcp-server/
│   ├── dist/                    # Compiled MCP server
│   ├── node_modules/            # Server dependencies
│   │   └── @conflux-x402/
│   │       └── chain-config -> ../../node_modules/@conflux-x402/chain-config
│   └── package.json
└── node_modules/
    └── @conflux-x402/
        └── chain-config/        # Compiled chain config
            ├── dist/
            └── package.json
```

## Security Considerations

1. The server runs with the privileges of the SSH user (root in this example)
2. Consider creating a dedicated user for running the MCP server
3. Ensure proper firewall rules are in place
4. Keep Node.js and dependencies updated

## Updates

To update the server after code changes:

1. Rebuild locally: `pnpm build`
2. Create new deployment package: `./deploy-mcp-server.sh`
3. Upload and extract on VPS (steps 1-2 above)
4. Restart Claude Desktop

No need to reconfigure Claude Desktop unless the path changes.
