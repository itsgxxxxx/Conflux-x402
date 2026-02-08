import assert from 'node:assert/strict'
import test from 'node:test'
import { RefundStore } from '../dist/refund/refund-store.js'

test('RefundStore: create() stores a record with settled state', () => {
  const store = new RefundStore(600_000)
  const record = store.create({
    requestId: 'req-1',
    payer: '0xabc',
    amount: '1000',
    token: '0xtoken',
    network: 'eip155:1030',
    settleTxHash: '0xsettle',
  })
  assert.equal(record.state, 'settled')
  assert.equal(record.requestId, 'req-1')
  store.destroy()
})

test('RefundStore: create() rejects duplicate requestId', () => {
  const store = new RefundStore(600_000)
  store.create({
    requestId: 'req-1',
    payer: '0xabc',
    amount: '1000',
    token: '0xtoken',
    network: 'eip155:1030',
    settleTxHash: '0xsettle',
  })
  const dup = store.create({
    requestId: 'req-1',
    payer: '0xabc',
    amount: '1000',
    token: '0xtoken',
    network: 'eip155:1030',
    settleTxHash: '0xsettle',
  })
  assert.equal(dup, null)
  store.destroy()
})

test('RefundStore: transition() performs CAS correctly', () => {
  const store = new RefundStore(600_000)
  store.create({
    requestId: 'req-1',
    payer: '0xabc',
    amount: '1000',
    token: '0xtoken',
    network: 'eip155:1030',
    settleTxHash: '0xsettle',
  })
  const ok = store.transition('req-1', 'settled', 'refund_queued')
  assert.equal(ok, true)
  assert.equal(store.get('req-1').state, 'refund_queued')

  // Cannot transition again from settled (already moved)
  const dup = store.transition('req-1', 'settled', 'refund_queued')
  assert.equal(dup, false)
  store.destroy()
})

test('RefundStore: get() returns null for unknown requestId', () => {
  const store = new RefundStore(600_000)
  assert.equal(store.get('unknown'), null)
  store.destroy()
})

test('RefundStore: update() merges fields into record', () => {
  const store = new RefundStore(600_000)
  store.create({
    requestId: 'req-1',
    payer: '0xabc',
    amount: '1000',
    token: '0xtoken',
    network: 'eip155:1030',
    settleTxHash: '0xsettle',
  })
  store.update('req-1', { refundTxHash: '0xrefund', reason: 'DIRTY_DATA' })
  const record = store.get('req-1')
  assert.equal(record.refundTxHash, '0xrefund')
  assert.equal(record.reason, 'DIRTY_DATA')
  store.destroy()
})

test('RefundStore: expired records are cleaned up', async () => {
  const store = new RefundStore(600_000, 1) // TTL = 1ms
  store.create({
    requestId: 'req-1',
    payer: '0xabc',
    amount: '1000',
    token: '0xtoken',
    network: 'eip155:1030',
    settleTxHash: '0xsettle',
  })
  await new Promise((r) => setTimeout(r, 10))
  store.cleanup()
  assert.equal(store.get('req-1'), null)
  store.destroy()
})
