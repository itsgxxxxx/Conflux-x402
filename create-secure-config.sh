#!/bin/bash
# 在 VPS 上执行此脚本

# 创建安全的配置文件
mkdir -p ~/.openclaw/secrets
cat > ~/.openclaw/secrets/x402.env << 'ENVEOF'
X402_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
X402_RPC_URL=https://evm.confluxrpc.com
X402_MAX_PAYMENT_PER_CALL=0.05
X402_MAX_DAILY_SPEND=1.0
ENVEOF

# 设置严格的文件权限（只有 root 可以读写）
chmod 600 ~/.openclaw/secrets/x402.env
chown root:root ~/.openclaw/secrets/x402.env

echo "配置文件已创建：~/.openclaw/secrets/x402.env"
echo "权限已设置为 600（仅 root 可读写）"
