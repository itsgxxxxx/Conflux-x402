import { getRecentPayments } from '../state/payment-log.js'

export function paymentHistoryTool(limit: number = 10): string {
  const payments = getRecentPayments(limit)

  if (payments.length === 0) {
    return 'No payment history found.'
  }

  let result = `Recent Payments (${payments.length}):\n\n`

  for (const payment of payments) {
    result += `URL: ${payment.url}\n`
    result += `Amount: ${payment.amount} USDT0\n`
    result += `Status: ${payment.status}\n`
    result += `TX Hash: ${payment.txHash}\n`
    result += `Time: ${payment.timestamp}\n`
    result += `---\n`
  }

  return result
}
