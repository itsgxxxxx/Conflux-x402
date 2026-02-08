import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import http from 'node:http'
import { RefundStore } from '../dist/refund/refund-store.js'
import { createRefundWrapper } from '../dist/middleware/refund-wrapper.js'

function makeRequest(app, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, () => {
      const port = server.address().port
      const url = `http://localhost:${port}${path}`
      fetch(url, { headers })
        .then(async (res) => {
          const body = await res.json()
          resolve({ status: res.status, headers: Object.fromEntries(res.headers.entries()), body })
          server.close()
        })
        .catch((err) => {
          server.close()
          reject(err)
        })
    })
  })
}

test('refund-wrapper: assigns X-Request-Id when client does not provide one', async () => {
  const store = new RefundStore(600_000)
  const routeRefundConfig = { 'GET /test': { enabled: true, amount: '1000', token: '0xtoken', network: 'eip155:1030' } }
  const app = express()
  app.use(createRefundWrapper({ store, routeRefundConfig, refundDefault: 'off', enqueueRefund: async () => {} }))
  app.get('/test', (req, res) => {
    res.json({ requestId: req.ctx?.requestId })
  })

  const result = await makeRequest(app, '/test')
  assert.ok(result.body.requestId, 'should have a requestId')
  assert.ok(result.headers['x-request-id'], 'should echo X-Request-Id in response')
  store.destroy()
})

test('refund-wrapper: uses client-provided X-Request-Id', async () => {
  const store = new RefundStore(600_000)
  const routeRefundConfig = { 'GET /test': { enabled: true, amount: '1000', token: '0xtoken', network: 'eip155:1030' } }
  const app = express()
  app.use(createRefundWrapper({ store, routeRefundConfig, refundDefault: 'off', enqueueRefund: async () => {} }))
  app.get('/test', (req, res) => {
    res.json({ requestId: req.ctx?.requestId })
  })

  const result = await makeRequest(app, '/test', { 'x-request-id': 'client-id-123' })
  assert.equal(result.body.requestId, 'client-id-123')
  store.destroy()
})

test('refund-wrapper: enqueues refund when all guards pass', async () => {
  const store = new RefundStore(600_000)
  const routeRefundConfig = { 'GET /test': { enabled: true, amount: '1000', token: '0xtoken', network: 'eip155:1030' } }
  let enqueuedId = null

  const app = express()
  app.use((req, _res, next) => {
    req.ctx = { payer: '0xpayer' }
    next()
  })
  app.use(createRefundWrapper({
    store,
    routeRefundConfig,
    refundDefault: 'off',
    enqueueRefund: async (requestId) => { enqueuedId = requestId },
  }))
  app.get('/test', (_req, res) => {
    // Simulate x402 settlement header
    res.setHeader('x-settlement-transaction', '0xsettle-hash')
    // Business signals refund
    res.setHeader('X-Refund-Requested', '1')
    res.setHeader('X-Refund-Status', 'pending')
    res.json({ ok: false })
  })

  await makeRequest(app, '/test')

  // Give finish event time to fire
  await new Promise((r) => setTimeout(r, 50))

  assert.ok(enqueuedId, 'should have enqueued a refund')
  const record = store.get(enqueuedId)
  assert.ok(record, 'should have a store record')
  assert.equal(record.state, 'refund_queued')
  assert.equal(record.payer, '0xpayer')
  assert.equal(record.settleTxHash, '0xsettle-hash')
  store.destroy()
})

test('refund-wrapper: does NOT enqueue when X-Refund-Requested is absent', async () => {
  const store = new RefundStore(600_000)
  const routeRefundConfig = { 'GET /test': { enabled: true, amount: '1000', token: '0xtoken', network: 'eip155:1030' } }
  let enqueueCalled = false

  const app = express()
  app.use((req, _res, next) => {
    req.ctx = { payer: '0xpayer' }
    next()
  })
  app.use(createRefundWrapper({
    store,
    routeRefundConfig,
    refundDefault: 'off',
    enqueueRefund: async () => { enqueueCalled = true },
  }))
  app.get('/test', (_req, res) => {
    res.setHeader('x-settlement-transaction', '0xsettle-hash')
    res.json({ ok: true })
  })

  await makeRequest(app, '/test')
  await new Promise((r) => setTimeout(r, 50))

  assert.equal(enqueueCalled, false, 'should not enqueue refund')
  store.destroy()
})

test('refund-wrapper: does NOT enqueue when route refund is disabled', async () => {
  const store = new RefundStore(600_000)
  // No route config for /test -> refund not enabled
  const routeRefundConfig = {}
  let enqueueCalled = false

  const app = express()
  app.use((req, _res, next) => {
    req.ctx = { payer: '0xpayer' }
    next()
  })
  app.use(createRefundWrapper({
    store,
    routeRefundConfig,
    refundDefault: 'off',
    enqueueRefund: async () => { enqueueCalled = true },
  }))
  app.get('/test', (_req, res) => {
    res.setHeader('x-settlement-transaction', '0xsettle-hash')
    res.setHeader('X-Refund-Requested', '1')
    res.json({ ok: false })
  })

  await makeRequest(app, '/test')
  await new Promise((r) => setTimeout(r, 50))

  assert.equal(enqueueCalled, false, 'should not enqueue when route refund disabled')
  store.destroy()
})
