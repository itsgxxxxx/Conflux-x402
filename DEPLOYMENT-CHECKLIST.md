# Deployment Checklist

## Pre-Deployment (Local)

- [x] Build script created: `scripts/build-deployment.sh`
- [x] Build script is executable
- [x] TypeScript packages compile successfully
- [x] Deployment package created: `x402-mcp-server-deploy-v2.tar.gz`
- [x] Package size: 11MB (reasonable)
- [x] Package integrity verified (tarball is valid)
- [x] Critical files present in package:
  - [x] `mcp-server/dist/index.js`
  - [x] `node_modules/viem/package.json`
  - [x] `node_modules/@conflux-x402/chain-config/package.json`
  - [x] `README.md`
- [x] Module resolution tested locally
- [x] Documentation created:
  - [x] DEPLOYMENT-GUIDE.md (full guide)
  - [x] QUICK-DEPLOY.md (quick reference)
  - [x] DEPLOYMENT-SUMMARY.md (summary)
  - [x] DEPLOYMENT-CHECKLIST.md (this file)

## Deployment to VPS

### Step 1: Upload Package
- [ ] Upload tarball to VPS: `scp x402-mcp-server-deploy-v2.tar.gz root@your-vps:/tmp/`
- [ ] Verify upload completed successfully
- [ ] Check file size on VPS matches local (11MB)

### Step 2: Backup Existing Installation
- [ ] SSH into VPS: `ssh root@your-vps`
- [ ] Navigate to MCP servers directory: `cd /root/.openclaw/mcp-servers/`
- [ ] Backup old installation: `mv x402 x402-backup-$(date +%Y%m%d-%H%M%S)`
- [ ] Verify backup created

### Step 3: Extract Package
- [ ] Extract tarball: `tar -xzf /tmp/x402-mcp-server-deploy-v2.tar.gz`
- [ ] Verify extraction completed without errors
- [ ] Check directory structure:
  - [ ] `ls -la mcp-server/`
  - [ ] `ls -la node_modules/`
  - [ ] `ls -la README.md`

### Step 4: Verify Dependencies
- [ ] Check viem exists: `ls -la node_modules/viem`
- [ ] Check chain-config exists: `ls -la node_modules/@conflux-x402/chain-config`
- [ ] Check MCP server dist: `ls -la mcp-server/dist/index.js`
- [ ] Test viem import: `node -e "import('viem').then(() => console.log('OK'))"`
- [ ] Test chain-config import: `node -e "import('./node_modules/@conflux-x402/chain-config/dist/index.js').then(() => console.log('OK'))"`

### Step 5: Configure Environment
- [ ] Navigate to mcp-server: `cd mcp-server`
- [ ] Create .env file with:
  - [ ] PRIVATE_KEY
  - [ ] RPC_URL
  - [ ] USDT0_ADDRESS
- [ ] Verify .env file: `cat .env`
- [ ] Check file permissions: `chmod 600 .env`

### Step 6: Test MCP Server
- [ ] Navigate to x402 directory: `cd /root/.openclaw/mcp-servers/x402`
- [ ] Test server start: `node mcp-server/dist/index.js`
- [ ] Verify output: "x402 MCP Server started" (on stderr)
- [ ] Stop server: Ctrl+C
- [ ] Check for any error messages

### Step 7: Configure MCP Client
- [ ] Update MCP client configuration file
- [ ] Set command: `node`
- [ ] Set args: `["/root/.openclaw/mcp-servers/x402/mcp-server/dist/index.js"]`
- [ ] Set environment variables (or use .env file)
- [ ] Save configuration

### Step 8: Final Verification
- [ ] Restart MCP client
- [ ] Check MCP server appears in client
- [ ] Test x402_check_balance tool
- [ ] Test x402_payment_history tool
- [ ] Test x402_pay_fetch tool (with test endpoint)
- [ ] Verify no module resolution errors
- [ ] Check logs for any warnings

## Post-Deployment

### Monitoring
- [ ] Monitor server logs for errors
- [ ] Check payment transactions on blockchain
- [ ] Verify wallet balance is sufficient
- [ ] Test with real x402-protected endpoints

### Cleanup
- [ ] Remove tarball from /tmp: `rm /tmp/x402-mcp-server-deploy-v2.tar.gz`
- [ ] Remove old backup after confirming new version works
- [ ] Update documentation with any VPS-specific notes

### Documentation
- [ ] Document any issues encountered
- [ ] Note any VPS-specific configuration needed
- [ ] Update team on successful deployment
- [ ] Share deployment notes if needed

## Rollback Plan (If Needed)

If deployment fails:
1. [ ] Stop new MCP server
2. [ ] Restore backup: `mv x402-backup-YYYYMMDD-HHMMSS x402`
3. [ ] Restart MCP client
4. [ ] Verify old version works
5. [ ] Investigate issues with new version
6. [ ] Fix issues and retry deployment

## Troubleshooting Reference

### Module Resolution Errors
- Check node_modules structure
- Verify viem is in root node_modules
- Verify chain-config is in node_modules/@conflux-x402/
- Test imports manually

### Environment Variable Errors
- Check .env file exists
- Verify all required variables are set
- Check file permissions
- Verify no extra whitespace in values

### Server Start Errors
- Check Node.js version (>= 18.0.0)
- Verify all files extracted correctly
- Check file permissions
- Review error messages carefully

## Success Criteria

Deployment is successful when:
- [x] Package built and uploaded
- [ ] Server starts without errors
- [ ] Module resolution works correctly
- [ ] All three MCP tools are available
- [ ] Tools execute without errors
- [ ] No module not found errors
- [ ] Client can communicate with server

## Notes

- Keep backup for at least 24 hours
- Monitor for any issues in first few hours
- Document any unexpected behavior
- Update this checklist based on experience

## Support

For issues, refer to:
- DEPLOYMENT-GUIDE.md (full troubleshooting)
- QUICK-DEPLOY.md (quick commands)
- DEPLOYMENT-SUMMARY.md (technical details)
- Package README.md (on-VPS reference)
