import { logger } from './logger.js'
import type { FacilitatorConfig } from './config.js'

interface DailyUsage {
  readonly date: string
  total: number
}

interface CircuitBreakerState {
  failures: number
  isOpen: boolean
  lastFailureAt: number
}

const dailyUsageByPayer = new Map<string, DailyUsage>()
const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  isOpen: false,
  lastFailureAt: 0,
}

const CIRCUIT_BREAKER_RESET_MS = 5 * 60 * 1000 // 5 minutes

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function getDailyUsage(payer: string): number {
  const key = `${payer}:${getTodayKey()}`
  const usage = dailyUsageByPayer.get(key)
  if (!usage || usage.date !== getTodayKey()) {
    return 0
  }
  return usage.total
}

function addDailyUsage(payer: string, amount: number): void {
  const today = getTodayKey()
  const key = `${payer}:${today}`
  const existing = dailyUsageByPayer.get(key)
  if (existing && existing.date === today) {
    dailyUsageByPayer.set(key, { date: today, total: existing.total + amount })
  } else {
    dailyUsageByPayer.set(key, { date: today, total: amount })
  }
}

export function isAllowedPayer(
  payer: string,
  config: { allowedPayerAddresses: string[] },
): boolean {
  if (config.allowedPayerAddresses.length === 0) {
    return true // Empty allowlist = allow all
  }
  return config.allowedPayerAddresses.includes(payer.toLowerCase())
}

export function checkTransactionLimits(
  payer: string,
  amountUsd: number,
  config: FacilitatorConfig,
): { allowed: boolean; reason?: string } {
  // Circuit breaker check
  if (circuitBreaker.isOpen) {
    const elapsed = Date.now() - circuitBreaker.lastFailureAt
    if (elapsed < CIRCUIT_BREAKER_RESET_MS) {
      return { allowed: false, reason: 'CIRCUIT_BREAKER_OPEN' }
    }
    // Reset after cooldown
    circuitBreaker.isOpen = false
    circuitBreaker.failures = 0
    logger.info('circuit breaker reset')
  }

  // Per-transaction limit
  if (amountUsd > config.maxPerTransaction) {
    return { allowed: false, reason: 'EXCEEDS_PER_TX_LIMIT' }
  }

  // Daily total limit
  const dailyUsed = getDailyUsage(payer)
  if (dailyUsed + amountUsd > config.maxDailyTotal) {
    return { allowed: false, reason: 'EXCEEDS_DAILY_LIMIT' }
  }

  return { allowed: true }
}

export function recordSuccessfulPayment(payer: string, amountUsd: number): void {
  addDailyUsage(payer, amountUsd)
}

export function recordFailure(config: FacilitatorConfig): void {
  circuitBreaker.failures++
  circuitBreaker.lastFailureAt = Date.now()
  if (circuitBreaker.failures >= config.circuitBreakerThreshold) {
    circuitBreaker.isOpen = true
    logger.error(
      { failures: circuitBreaker.failures },
      'circuit breaker OPEN - halting settlements',
    )
  }
}

export function getCircuitBreakerStatus(): {
  isOpen: boolean
  failures: number
} {
  return {
    isOpen: circuitBreaker.isOpen,
    failures: circuitBreaker.failures,
  }
}
