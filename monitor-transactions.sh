#!/bin/bash
# 交易监控脚本 - 在 VPS 上定期运行

WALLET_ADDRESS="0xYOUR_WALLET_ADDRESS"
ALERT_THRESHOLD=0.5  # USDT
LOG_FILE=~/.openclaw/logs/x402-monitor.log

# 检查余额
BALANCE=$(mcporter call x402 x402_check_balance '{}' | grep -oP 'Balance: \K[0-9.]+')

# 检查交易历史
RECENT_PAYMENTS=$(mcporter call x402 x402_payment_history '{"limit": 10}')

# 记录日志
echo "[$(date)] Balance: $BALANCE USDT" >> $LOG_FILE
echo "$RECENT_PAYMENTS" >> $LOG_FILE

# 如果余额低于阈值，发送告警
if (( $(echo "$BALANCE < $ALERT_THRESHOLD" | bc -l) )); then
    echo "⚠️ WARNING: Balance low ($BALANCE USDT)" >> $LOG_FILE
    # 可以添加邮件或其他告警方式
fi
