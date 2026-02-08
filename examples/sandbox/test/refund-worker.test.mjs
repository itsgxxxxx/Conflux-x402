import assert from 'node:assert/strict'
import test from 'node:test'
import { RefundStore } from '../dist/refund/refund-store.js'
import { processRefund } from '../dist/refund/refund-worker.js'

test('processRefund: transitions to refund_submitted on success', async () => {
  const store = new RefundStore(600_000)
  store.create({
    requestId: 'req-1',
    payer: '0xabc',
    amount: '1000',
    token: '0xtoken',
    network: 'eip155:1030',
    settleTxHash: '0xsettle',
  })
  store.transition('req-1', 'settled', 'refund_queued')

  // Mock sendRefundTx that succeeds
  const mockSend = async () => '0xrefund-tx-hash'

  await processRefund(store, 'req-1', mockSend)

  const record = store.get('req-1')
  assert.equal(record.state, 'refund_submitted')
  assert.equal(record.refundTxHash, '0xrefund-tx-hash')
  store.destroy()
})

test('processRefund: transitions to refund_failed after send failure + retry', async () => {
  const store = new RefundStore(600_000)
  store.create({
    requestId: 'req-1',
    payer: '0xabc',
    amount: '1000',
    token: '0xtoken',
    network: 'eip155:1030',
    settleTxHash: '0xsettle',
  })
  store.transition('req-1', 'settled', 'refund_queued')

  let attempts = 0
  const mockSend = async () => {
    attempts++
    throw new Error('tx failed')
  }

  await processRefund(store, 'req-1', mockSend, 10) // 10ms retry delay

  const record = store.get('req-1')
  assert.equal(record.state, 'refund_failed')
  assert.equal(attempts, 2) // initial + 1 retry
  store.destroy()
})

test('processRefund: no-op if record not in refund_queued state', async () => {
  const store = new RefundStore(600_000)
  store.create({
    requestId: 'req-1',
    payer: '0xabc',
    amount: '1000',
    token: '0xtoken',
    network: 'eip155:1030',
    settleTxHash: '0xsettle',
  })
  // State is 'settled', not 'refund_queued'

  const mockSend = async () => '0xshould-not-be-called'

  await processRefund(store, 'req-1', mockSend)

  const record = store.get('req-1')
  assert.equal(record.state, 'settled')
  assert.equal(record.refundTxHash, undefined)
  store.destroy()
})
