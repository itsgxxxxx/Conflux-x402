import { logger } from './logger.js'

interface SettlementRecord {
  readonly settledAt: number
  readonly network: string
  readonly amount: string
}

const settledPayments = new Map<string, SettlementRecord>()

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const RECORD_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function isAlreadySettled(paymentIdentifier: string): boolean {
  return settledPayments.has(paymentIdentifier)
}

export function recordSettlement(
  paymentIdentifier: string,
  network: string,
  amount: string,
): void {
  settledPayments.set(paymentIdentifier, {
    settledAt: Date.now(),
    network,
    amount,
  })
  logger.info({ paymentIdentifier, network, amount }, 'settlement recorded')
}

export function getSettlementCount(): number {
  return settledPayments.size
}

function cleanupExpiredRecords(): void {
  const cutoff = Date.now() - RECORD_TTL_MS
  let removed = 0
  for (const [key, record] of settledPayments) {
    if (record.settledAt < cutoff) {
      settledPayments.delete(key)
      removed++
    }
  }
  if (removed > 0) {
    logger.info({ removed, remaining: settledPayments.size }, 'cleaned up expired settlement records')
  }
}

// Periodic cleanup
setInterval(cleanupExpiredRecords, CLEANUP_INTERVAL_MS).unref()
