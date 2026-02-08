import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import http from 'node:http'
import { RefundStore } from '../dist/refund/refund-store.js'
import { createRefundRouter } from '../dist/routes/refunds.js'

function makeRequest(app, path) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, () => {
      const port = server.address().port
      fetch(`http://localhost:${port}${path}`)
        .then(async (res) => {
          const body = await res.json()
          resolve({ status: res.status, body })
          server.close()
        })
        .catch((err) => {
          server.close()
          reject(err)
        })
    })
  })
}

test('GET /refunds/:requestId returns record when found', async () => {
  const store = new RefundStore(600_000)
  store.create({
    requestId: 'req-1',
    payer: '0xpayer',
    amount: '1000',
    token: '0xtoken',
    network: 'eip155:1030',
    settleTxHash: '0xsettle',
  })

  const app = express()
  app.use('/refunds', createRefundRouter(store))

  const result = await makeRequest(app, '/refunds/req-1')
  assert.equal(result.status, 200)
  assert.equal(result.body.requestId, 'req-1')
  assert.equal(result.body.state, 'settled')
  assert.equal(result.body.payer, '0xpayer')
  store.destroy()
})

test('GET /refunds/:requestId returns 404 when not found', async () => {
  const store = new RefundStore(600_000)
  const app = express()
  app.use('/refunds', createRefundRouter(store))

  const result = await makeRequest(app, '/refunds/unknown')
  assert.equal(result.status, 404)
  assert.equal(result.body.error, 'NOT_FOUND')
  store.destroy()
})
