import type { PaymentRecord } from '../types.js'

const paymentLog: PaymentRecord[] = []

export function recordPayment(record: PaymentRecord): void {
  paymentLog.push(record)
}

export function getRecentPayments(limit: number = 10): PaymentRecord[] {
  return paymentLog.slice(-limit).reverse()
}

export function getDailyTotal(): number {
  const today = new Date().toISOString().split('T')[0]
  return paymentLog
    .filter((p) => p.timestamp.startsWith(today) && p.status === 'success')
    .reduce((sum, p) => sum + parseFloat(p.amount), 0)
}
