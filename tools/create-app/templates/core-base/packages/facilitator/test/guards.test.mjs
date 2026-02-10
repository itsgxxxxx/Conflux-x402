import assert from 'node:assert/strict'
import test from 'node:test'
import { checkTransactionLimits, isAllowedPayer, recordFailure, recordSuccessfulPayment } from '../dist/rate-limiter.js'
import { isAlreadySettled, recordSettlement } from '../dist/idempotency.js'

function createConfig(overrides = {}) {
  return {
    port: 4022,
    privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    rpcUrl: 'https://evm.confluxrpc.com',
    network: 'eip155:1030',
    verifyOnlyMode: true,
    allowedPayerAddresses: [],
    maxPerTransaction: 1,
    maxDailyTotal: 2,
    circuitBreakerThreshold: 10,
    gasBufferPercent: 50,
    ...overrides,
  }
}

test('allowlist accepts all payers when empty', () => {
  const config = createConfig({ allowedPayerAddresses: [] })
  assert.equal(isAllowedPayer('0xabc', config), true)
})

test('allowlist rejects payer outside configured list', () => {
  const config = createConfig({ allowedPayerAddresses: ['0xaaa'] })
  assert.equal(isAllowedPayer('0xbbb', config), false)
  assert.equal(isAllowedPayer('0xAaA', config), true)
})

test('per-transaction and daily limits are enforced', () => {
  const config = createConfig({ maxPerTransaction: 2, maxDailyTotal: 2 })
  const payer = '0x1111111111111111111111111111111111111111'

  const overPerTx = checkTransactionLimits(payer, 2.1, config)
  assert.equal(overPerTx.allowed, false)
  assert.equal(overPerTx.reason, 'EXCEEDS_PER_TX_LIMIT')

  const first = checkTransactionLimits(payer, 1.5, config)
  assert.equal(first.allowed, true)
  recordSuccessfulPayment(payer, 1.5)

  const overDaily = checkTransactionLimits(payer, 0.6, config)
  assert.equal(overDaily.allowed, false)
  assert.equal(overDaily.reason, 'EXCEEDS_DAILY_LIMIT')
})

test('settlement idempotency marks duplicate payment ids', () => {
  const paymentId = `test-payment-${Date.now()}`
  assert.equal(isAlreadySettled(paymentId), false)
  recordSettlement(paymentId, 'eip155:1030', '1000')
  assert.equal(isAlreadySettled(paymentId), true)
})

test('circuit breaker blocks settlement checks after threshold', () => {
  const config = createConfig({ circuitBreakerThreshold: 1 })
  recordFailure(config)

  const blocked = checkTransactionLimits(
    '0x2222222222222222222222222222222222222222',
    0.1,
    config,
  )
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.reason, 'CIRCUIT_BREAKER_OPEN')
})
