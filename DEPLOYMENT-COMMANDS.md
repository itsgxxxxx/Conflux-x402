# Quick Reference: MCP Server Deployment Commands

## Local Machine (Already Done)

The deployment package has been created at:
```
/Users/itsgxxxxx/Vibe Coding/Claude Code/Conflux/conflux-x402-toolkit/x402-mcp-server-deploy.tar.gz
```

Size: 11MB

## Step 1: Upload to VPS

```bash
scp /Users/itsgxxxxx/Vibe\ Coding/Claude\ Code/Conflux/conflux-x402-toolkit/x402-mcp-server-deploy.tar.gz root@31.170.165.234:/tmp/
```

## Step 2: Install on VPS

Option A - Manual commands:
```bash
ssh root@31.170.165.234

# Create directory
mkdir -p ~/.openclaw/mcp-servers/x402

# Extract
cd ~/.openclaw/mcp-servers/x402
tar -xzf /tmp/x402-mcp-server-deploy.tar.gz

# Set permissions
chmod +x mcp-server/dist/index.js

# Test
cd mcp-server
node dist/index.js
# Press Ctrl+C to stop
```

Option B - Using install script:
```bash
# First, upload the install script
scp /Users/itsgxxxxx/Vibe\ Coding/Claude\ Code/Conflux/conflux-x402-toolkit/vps-install.sh root@31.170.165.234:/tmp/

# Then run it
ssh root@31.170.165.234 "bash /tmp/vps-install.sh"
```

## Step 3: Configure Claude Desktop

Edit your Claude Desktop config file:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Add this configuration:
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

## Step 4: Restart Claude Desktop

Restart Claude Desktop to load the new MCP server.

## Verification

Test the SSH connection manually:
```bash
ssh root@31.170.165.234 "node ~/.openclaw/mcp-servers/x402/mcp-server/dist/index.js"
```

You should see MCP protocol messages. Press Ctrl+C to stop.

## Rebuilding (If Needed)

If you make changes to the code:
```bash
cd /Users/itsgxxxxx/Vibe\ Coding/Claude\ Code/Conflux/conflux-x402-toolkit

# Build packages
pnpm build

# Create new deployment package
./deploy-mcp-server.sh

# Upload and install (repeat steps 1-2)
```

## Troubleshooting

Check Node.js version on VPS (requires >= 18.0.0):
```bash
ssh root@31.170.165.234 "node --version"
```

Check installed files:
```bash
ssh root@31.170.165.234 "ls -la ~/.openclaw/mcp-servers/x402/"
```

View server logs:
```bash
ssh root@31.170.165.234 "cd ~/.openclaw/mcp-servers/x402/mcp-server && node dist/index.js 2>&1 | head -20"
```

## Files Created

1. `/Users/itsgxxxxx/Vibe Coding/Claude Code/Conflux/conflux-x402-toolkit/deploy-mcp-server.sh`
   - Script to build deployment package

2. `/Users/itsgxxxxx/Vibe Coding/Claude Code/Conflux/conflux-x402-toolkit/x402-mcp-server-deploy.tar.gz`
   - Deployment tarball (11MB)

3. `/Users/itsgxxxxx/Vibe Coding/Claude Code/Conflux/conflux-x402-toolkit/vps-install.sh`
   - VPS installation script

4. `/Users/itsgxxxxx/Vibe Coding/Claude Code/Conflux/conflux-x402-toolkit/DEPLOYMENT-GUIDE.md`
   - Comprehensive deployment guide
