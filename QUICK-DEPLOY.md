# Quick Deployment Reference

## Build Package Locally

```bash
cd /Users/itsgxxxxx/Vibe\ Coding/Claude\ Code/Conflux/conflux-x402-toolkit
./scripts/build-deployment.sh
```

Output: `x402-mcp-server-deploy-v2.tar.gz` (~11MB)

## Deploy to VPS

```bash
# 1. Upload
scp x402-mcp-server-deploy-v2.tar.gz root@your-vps:/tmp/

# 2. SSH and extract
ssh root@your-vps
cd /root/.openclaw/mcp-servers/
tar -xzf /tmp/x402-mcp-server-deploy-v2.tar.gz

# 3. Configure
cd x402/mcp-server
cat > .env << 'ENVEOF'
PRIVATE_KEY=your_private_key_here
RPC_URL=https://evm.confluxrpc.com
USDT0_ADDRESS=0xfe97E85d13ABD9c1c33384E796F10B73905637cE
ENVEOF

# 4. Test
cd /root/.openclaw/mcp-servers/x402
node mcp-server/dist/index.js
# Should see: "x402 MCP Server started"
```

## MCP Client Config

```json
{
  "mcpServers": {
    "x402-payment": {
      "command": "node",
      "args": ["/root/.openclaw/mcp-servers/x402/mcp-server/dist/index.js"]
    }
  }
}
```

## Verify

```bash
cd /root/.openclaw/mcp-servers/x402
ls -la node_modules/viem                           # Should exist
ls -la node_modules/@conflux-x402/chain-config     # Should exist
node -e "import('viem').then(() => console.log('OK'))"  # Should print OK
```

## Key Differences from v1

- Uses npm (not pnpm) for flat dependency structure
- All dependencies in single node_modules/ at root
- chain-config copied (not symlinked)
- viem accessible to all packages
- Module resolution works correctly

See DEPLOYMENT-GUIDE.md for full details.
