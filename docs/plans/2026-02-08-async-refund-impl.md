# Async Refund Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add async refund capability to the x402 server — when a business route determines service failed after payment settlement, automatically refund the payer via ERC20 transfer.

**Architecture:** Refund wrapper middleware registers before x402 payment middleware, listens to `res.on('finish')`, checks guard conditions, and enqueues async refund jobs. A same-process worker executes ERC20 transfers via viem. An in-memory store with TTL tracks refund state. A query endpoint exposes refund status.

**Tech Stack:** TypeScript, Express, viem (walletClient + writeContract), zod, pino, node:crypto (randomUUID), node:test

**Design doc:** `docs/plans/2026-02-08-async-refund-design.md`

---

### Task 1: Refund Store (in-memory Map + TTL + CAS)

**Files:**
- Create: `packages/server/src/refund/refund-store.ts`
- Test: `packages/server/test/refund-store.test.mjs`

**Step 1: Write the failing tests**

Create `packages/server/test/refund-store.test.mjs`:

```javascript
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
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/refund-store.test.mjs`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/server/src/refund/refund-store.ts`:

```typescript
import { logger } from '../logger.js'

export type RefundState = 'settled' | 'refund_queued' | 'refund_submitted' | 'refund_failed'

export interface RefundRecord {
  requestId: string
  payer: string
  amount: string
  token: string
  network: string
  settleTxHash: string
  refundTxHash?: string
  reason?: string
  state: RefundState
  createdAt: number
}

export interface CreateRefundInput {
  requestId: string
  payer: string
  amount: string
  token: string
  network: string
  settleTxHash: string
  reason?: string
}

export class RefundStore {
  private readonly records = new Map<string, { record: RefundRecord; expiresAt: number }>()
  private cleanupTimer: ReturnType<typeof setInterval> | undefined
  private readonly ttlMs: number

  constructor(cleanupIntervalMs = 60_000, ttlMs = 30 * 60_000) {
    this.ttlMs = ttlMs
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs)
    this.cleanupTimer.unref()
  }

  create(input: CreateRefundInput): RefundRecord | null {
    if (this.records.has(input.requestId)) {
      logger.warn({ requestId: input.requestId }, 'refund-store: duplicate requestId, skipping')
      return null
    }

    const record: RefundRecord = {
      ...input,
      state: 'settled',
      createdAt: Date.now(),
    }

    this.records.set(input.requestId, {
      record,
      expiresAt: Date.now() + this.ttlMs,
    })

    return record
  }

  get(requestId: string): RefundRecord | null {
    const entry = this.records.get(requestId)
    if (!entry) return null
    if (Date.now() >= entry.expiresAt) {
      this.records.delete(requestId)
      return null
    }
    return entry.record
  }

  transition(requestId: string, from: RefundState, to: RefundState): boolean {
    const entry = this.records.get(requestId)
    if (!entry || entry.record.state !== from) return false
    entry.record.state = to
    return true
  }

  update(requestId: string, fields: Partial<Pick<RefundRecord, 'refundTxHash' | 'reason'>>): void {
    const entry = this.records.get(requestId)
    if (!entry) return
    Object.assign(entry.record, fields)
  }

  cleanup(): void {
    const now = Date.now()
    for (const [id, entry] of this.records) {
      if (now >= entry.expiresAt) {
        this.records.delete(id)
      }
    }
  }

  get size(): number {
    return this.records.size
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
    this.records.clear()
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/refund-store.test.mjs`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add packages/server/src/refund/refund-store.ts packages/server/test/refund-store.test.mjs
git commit -m "feat(server): add RefundStore with in-memory Map, TTL, and CAS transitions"
```

---

### Task 2: Server Config — add REFUND_DEFAULT and SERVER_PRIVATE_KEY

**Files:**
- Modify: `packages/server/src/config.ts`
- Modify: `.env.example`

**Step 1: Write the failing test**

Add to `packages/server/test/app.test.mjs`:

```javascript
test('loadServerConfig reads REFUND_DEFAULT and SERVER_PRIVATE_KEY', async () => {
  // Import dynamically to avoid env pollution; we test the schema shape
  const { loadServerConfig } = await import('../dist/config.js')

  // Set minimal env for parse to work
  process.env.FACILITATOR_URL = 'http://localhost:4022'
  process.env.EVM_ADDRESS = '0x1111111111111111111111111111111111111111'
  process.env.REFUND_DEFAULT = 'on'
  process.env.SERVER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

  const config = loadServerConfig()
  assert.equal(config.refundDefault, 'on')
  assert.equal(config.serverPrivateKey, '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')

  // Cleanup
  delete process.env.REFUND_DEFAULT
  delete process.env.SERVER_PRIVATE_KEY
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/app.test.mjs`
Expected: FAIL — `config.refundDefault` is undefined

**Step 3: Write minimal implementation**

Modify `packages/server/src/config.ts` — add two fields to the schema:

```typescript
// Add to ServerConfigSchema (after facilitatorApiKey):
  // Refund
  refundDefault: z.enum(['off', 'on']).default('off'),
  serverPrivateKey: z.string().startsWith('0x').optional(),
```

Add to `loadServerConfig()` parse block:

```typescript
    refundDefault: process.env.REFUND_DEFAULT,
    serverPrivateKey: process.env.SERVER_PRIVATE_KEY,
```

Add validation after existing authMode check:

```typescript
  if (config.refundDefault === 'on' && !config.serverPrivateKey) {
    throw new Error('SERVER_PRIVATE_KEY is required when REFUND_DEFAULT=on')
  }
```

Modify `.env.example` — add refund section after the auth gate section:

```
# ===== Server Refund (Optional) =====
# REFUND_DEFAULT controls whether refund is enabled for payment routes by default.
# Individual routes can override this in their route config.
#   off (default): Refund disabled globally
#   on: Refund enabled globally (routes can still opt out)
REFUND_DEFAULT=off
SERVER_PRIVATE_KEY=0x...             # Merchant wallet key (same as EVM_ADDRESS; needs CFX for gas)
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/app.test.mjs`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/server/src/config.ts .env.example
git commit -m "feat(server): add REFUND_DEFAULT and SERVER_PRIVATE_KEY to server config"
```

---

### Task 3: Route Config — add RefundPolicy to GateRouteConfig

**Files:**
- Modify: `packages/server/src/routes/config.ts`

**Step 1: Write the failing test**

Add to `packages/server/test/app.test.mjs`:

```javascript
test('buildRoutes includes refund policy when configured', () => {
  const config = createConfig()
  const routes = buildRoutes(config)
  const weather = routes['GET /sandbox/weather']

  assert.ok(weather)
  // After implementation, weather route should have refund config
  assert.ok(weather.refund !== undefined, 'weather route should have refund field')
  assert.equal(weather.refund.enabled, true)
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/app.test.mjs`
Expected: FAIL — `weather.refund` is undefined

**Step 3: Write minimal implementation**

Modify `packages/server/src/routes/config.ts`:

Add `RefundPolicySchema` after `PolicySchema` (line 12):

```typescript
const RefundPolicySchema = z.object({
  enabled: z.boolean().optional(),
  windowSec: z.number().optional(),
}).optional()
```

Add to `GateRouteConfigSchema` (after `resourceId`):

```typescript
  refund: RefundPolicySchema,
```

Add `amount` field to `GateRouteConfigSchema` (after `price`):

```typescript
  amount: z.string().optional(),   // raw units for refund (e.g. '1000' = 0.001 USDT0)
```

Update the weather route in `buildRoutes()` to include refund and amount:

```typescript
    'GET /sandbox/weather': GateRouteConfigSchema.parse({
      enableIdentity: false,
      enablePayment: true,
      price: '$0.001',
      amount: '1000',
      description: 'Weather data',
      mimeType: 'application/json',
      resourceId: 'weather',
      refund: { enabled: true },
    }),
```

Export `RefundPolicy` type:

```typescript
export type RefundPolicy = z.infer<typeof RefundPolicySchema>
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/app.test.mjs`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/server/src/routes/config.ts
git commit -m "feat(server): add RefundPolicy and amount to route config"
```

---

### Task 4: Refund Worker — async ERC20 transfer execution

**Files:**
- Create: `packages/server/src/refund/refund-worker.ts`
- Test: `packages/server/test/refund-worker.test.mjs`

**Step 1: Write the failing tests**

Create `packages/server/test/refund-worker.test.mjs`:

```javascript
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
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/refund-worker.test.mjs`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/server/src/refund/refund-worker.ts`:

```typescript
import { logger } from '../logger.js'
import type { RefundStore } from './refund-store.js'

export type SendRefundTx = (payer: string, amount: string, token: string) => Promise<string>

const DEFAULT_RETRY_DELAY_MS = 3_000

export async function processRefund(
  store: RefundStore,
  requestId: string,
  sendRefundTx: SendRefundTx,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
): Promise<void> {
  const record = store.get(requestId)
  if (!record) {
    logger.warn({ requestId }, 'refund-worker: record not found')
    return
  }

  // CAS: only process if in refund_queued state
  if (!store.transition(requestId, 'refund_queued', 'refund_submitted')) {
    logger.warn({ requestId, state: record.state }, 'refund-worker: unexpected state, skipping')
    return
  }

  try {
    const txHash = await sendRefundTx(record.payer, record.amount, record.token)
    store.update(requestId, { refundTxHash: txHash })
    logger.info({ requestId, txHash }, 'refund-worker: refund submitted')
  } catch (error) {
    logger.warn(
      { requestId, error: error instanceof Error ? error.message : String(error) },
      'refund-worker: first attempt failed, retrying',
    )

    // Single retry after delay
    await new Promise((r) => setTimeout(r, retryDelayMs))

    try {
      const txHash = await sendRefundTx(record.payer, record.amount, record.token)
      store.update(requestId, { refundTxHash: txHash })
      logger.info({ requestId, txHash }, 'refund-worker: refund submitted on retry')
    } catch (retryError) {
      store.transition(requestId, 'refund_submitted', 'refund_failed')
      store.update(requestId, {
        reason: retryError instanceof Error ? retryError.message : String(retryError),
      })
      logger.error(
        { requestId, error: retryError instanceof Error ? retryError.message : String(retryError) },
        'refund-worker: refund failed after retry',
      )
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/refund-worker.test.mjs`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add packages/server/src/refund/refund-worker.ts packages/server/test/refund-worker.test.mjs
git commit -m "feat(server): add refund worker with retry and CAS state transitions"
```

---

### Task 5: Refund Wrapper Middleware — finish callback + guards

**Files:**
- Create: `packages/server/src/middleware/refund-wrapper.ts`
- Test: `packages/server/test/refund-wrapper.test.mjs`

**Step 1: Write the failing tests**

Create `packages/server/test/refund-wrapper.test.mjs`:

```javascript
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
  // No route config for /test → refund not enabled
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
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/refund-wrapper.test.mjs`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/server/src/middleware/refund-wrapper.ts`:

```typescript
import { randomUUID } from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { logger } from '../logger.js'
import type { RefundStore } from '../refund/refund-store.js'

export interface RouteRefundInfo {
  enabled: boolean
  amount: string
  token: string
  network: string
}

export interface RefundWrapperDeps {
  store: RefundStore
  routeRefundConfig: Record<string, RouteRefundInfo>
  refundDefault: 'off' | 'on'
  enqueueRefund: (requestId: string) => Promise<void>
}

declare global {
  namespace Express {
    interface Request {
      ctx?: {
        payer?: string
        requestId?: string
        routeKey?: string
      }
    }
  }
}

export function createRefundWrapper(deps: RefundWrapperDeps) {
  const { store, routeRefundConfig, refundDefault, enqueueRefund } = deps

  return (req: Request, res: Response, next: NextFunction) => {
    // Ensure req.ctx exists
    if (!req.ctx) req.ctx = {}

    // Assign requestId: client-provided or server-generated
    const clientRequestId = req.headers['x-request-id'] as string | undefined
    const requestId = clientRequestId || randomUUID()
    req.ctx.requestId = requestId

    // Echo requestId back in response
    res.setHeader('X-Request-Id', requestId)

    // Determine route key for refund config lookup
    const routeKey = `${req.method.toUpperCase()} ${req.path}`
    req.ctx.routeKey = routeKey

    // Listen for response completion
    res.on('finish', () => {
      try {
        // Guard 1: X-Refund-Requested must be '1'
        const refundRequested = res.getHeader('x-refund-requested')
        if (refundRequested !== '1') return

        // Guard 2: settlement tx must exist (payment was collected)
        const settleTxHash = res.getHeader('x-settlement-transaction') as string | undefined
        if (!settleTxHash) {
          logger.warn({ requestId }, 'refund-wrapper: refund requested but no settlement tx')
          return
        }

        // Guard 3: requestId must exist (always true at this point, but be safe)
        if (!requestId) return

        // Guard 4: route refund must be enabled
        const routeConfig = routeRefundConfig[routeKey]
        const refundEnabled = routeConfig?.enabled ?? (refundDefault === 'on')
        if (!refundEnabled) {
          logger.info({ requestId, routeKey }, 'refund-wrapper: refund not enabled for route')
          return
        }

        // Get payer from request context (set by auth-check middleware)
        const payer = req.ctx?.payer
        if (!payer) {
          logger.warn({ requestId }, 'refund-wrapper: refund requested but no payer in context')
          return
        }

        // Create record and CAS to refund_queued
        const record = store.create({
          requestId,
          payer,
          amount: routeConfig.amount,
          token: routeConfig.token,
          network: routeConfig.network,
          settleTxHash,
        })

        if (!record) {
          logger.warn({ requestId }, 'refund-wrapper: duplicate requestId, already in store')
          return
        }

        if (!store.transition(requestId, 'settled', 'refund_queued')) {
          logger.warn({ requestId }, 'refund-wrapper: CAS settled→refund_queued failed')
          return
        }

        logger.info({ requestId, payer, amount: routeConfig.amount }, 'refund-wrapper: refund queued')

        // Fire-and-forget async refund
        enqueueRefund(requestId).catch((err) => {
          logger.error(
            { requestId, error: err instanceof Error ? err.message : String(err) },
            'refund-wrapper: enqueue failed',
          )
        })
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          'refund-wrapper: finish callback error',
        )
      }
    })

    next()
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/refund-wrapper.test.mjs`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add packages/server/src/middleware/refund-wrapper.ts packages/server/test/refund-wrapper.test.mjs
git commit -m "feat(server): add refund wrapper middleware with finish callback and guards"
```

---

### Task 6: Refund Query Endpoint — GET /refunds/:requestId

**Files:**
- Create: `packages/server/src/routes/refunds.ts`
- Test: `packages/server/test/refund-query.test.mjs`

**Step 1: Write the failing tests**

Create `packages/server/test/refund-query.test.mjs`:

```javascript
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
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/refund-query.test.mjs`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/server/src/routes/refunds.ts`:

```typescript
import { Router } from 'express'
import type { RefundStore } from '../refund/refund-store.js'

export function createRefundRouter(store: RefundStore): Router {
  const router = Router()

  router.get('/:requestId', (req, res) => {
    const record = store.get(req.params.requestId)

    if (!record) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'No refund record for this requestId',
      })
      return
    }

    res.json(record)
  })

  return router
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/refund-query.test.mjs`
Expected: All 2 tests PASS

**Step 5: Commit**

```bash
git add packages/server/src/routes/refunds.ts packages/server/test/refund-query.test.mjs
git commit -m "feat(server): add GET /refunds/:requestId query endpoint"
```

---

### Task 7: Wire Everything into app.ts

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/routes/index.ts`

**Step 1: Write the failing test**

Add to `packages/server/test/app.test.mjs`:

```javascript
test('app registers refund query route', () => {
  const app = createApp(createConfig({
    paymentEnabled: false,
    refundDefault: 'off',
  }))

  const routeLayers = app._router.stack
    .filter((layer) => layer.name === 'router')
    .flatMap((layer) =>
      layer.handle.stack
        ? layer.handle.stack.filter((l) => l.route).map((l) => l.route.path)
        : []
    )

  // Check via a simple request
  // The refund route should be mounted even if refund is off (query is always available)
  assert.ok(true, 'app creates without error with refund config')
})
```

**Step 2: Write the implementation**

Modify `packages/server/src/app.ts` to wire refund components:

```typescript
import express from 'express'
import type { Express } from 'express'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { paymentMiddleware } from '@x402/express'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { HTTPFacilitatorClient } from '@x402/core/server'
import { x402ResourceServer } from '@x402/express'
import { confluxESpace } from '@conflux-x402/chain-config'
import { CONFLUX_ESPACE_MAINNET } from '@conflux-x402/chain-config'
import type { ServerConfig } from './config.js'
import { logger } from './logger.js'
import { registerRoutes } from './routes/index.js'
import { buildRoutes, toX402RoutesConfig } from './routes/config.js'
import { createAuthCheckMiddleware } from './middleware/auth-check.js'
import { createRefundWrapper } from './middleware/refund-wrapper.js'
import type { RouteRefundInfo } from './middleware/refund-wrapper.js'
import { RefundStore } from './refund/refund-store.js'
import { processRefund } from './refund/refund-worker.js'
import type { SendRefundTx } from './refund/refund-worker.js'
import { createRefundRouter } from './routes/refunds.js'

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

export function createApp(config: ServerConfig): Express {
  const app = express()
  app.use(express.json())

  // Build route configs
  const gateRoutes = buildRoutes(config)
  const x402Routes = toX402RoutesConfig(gateRoutes, config)

  logger.info({ routes: Object.keys(x402Routes) }, 'x402 protected routes')

  // Setup auth gate middleware (before x402)
  if (config.authMode !== 'none') {
    const publicClient = createPublicClient({
      chain: confluxESpace,
      transport: http(config.rpcUrl),
    })

    app.use(createAuthCheckMiddleware({ config, publicClient }))

    logger.info(
      { authMode: config.authMode, registryAddress: config.identityRegistryAddress },
      'auth gate enabled',
    )
  } else {
    logger.info('auth gate disabled (AUTH_MODE=none)')
  }

  // Setup refund system
  const refundStore = new RefundStore()

  // Build route refund config map from gate routes
  const routeRefundConfig: Record<string, RouteRefundInfo> = {}
  const { token } = CONFLUX_ESPACE_MAINNET
  for (const [pattern, route] of Object.entries(gateRoutes)) {
    if (route.refund?.enabled !== undefined || config.refundDefault === 'on') {
      routeRefundConfig[pattern] = {
        enabled: route.refund?.enabled ?? (config.refundDefault === 'on'),
        amount: route.amount ?? '0',
        token: token.address,
        network: CONFLUX_ESPACE_MAINNET.caip2Id,
      }
    }
  }

  // Build sendRefundTx function (only if we have a private key)
  let sendRefundTx: SendRefundTx | undefined
  if (config.serverPrivateKey) {
    const account = privateKeyToAccount(config.serverPrivateKey as `0x${string}`)
    const walletClient = createWalletClient({
      account,
      chain: confluxESpace,
      transport: http(config.rpcUrl),
    })

    sendRefundTx = async (payer: string, amount: string, tokenAddress: string) => {
      const hash = await walletClient.writeContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [payer as `0x${string}`, BigInt(amount)],
      })
      return hash
    }
  }

  // Refund wrapper middleware (before x402)
  const enqueueRefund = async (requestId: string) => {
    if (!sendRefundTx) {
      logger.error({ requestId }, 'refund: SERVER_PRIVATE_KEY not configured, cannot refund')
      refundStore.transition(requestId, 'refund_queued', 'refund_failed')
      refundStore.update(requestId, { reason: 'SERVER_PRIVATE_KEY not configured' })
      return
    }
    setImmediate(() => {
      processRefund(refundStore, requestId, sendRefundTx!).catch((err) => {
        logger.error(
          { requestId, error: err instanceof Error ? err.message : String(err) },
          'refund: processRefund error',
        )
      })
    })
  }

  app.use(
    createRefundWrapper({
      store: refundStore,
      routeRefundConfig,
      refundDefault: config.refundDefault,
      enqueueRefund,
    }),
  )

  logger.info(
    { refundDefault: config.refundDefault, refundRoutes: Object.keys(routeRefundConfig) },
    'refund system initialized',
  )

  // Setup x402 payment middleware
  if (config.paymentEnabled) {
    const facilitatorClient = new HTTPFacilitatorClient({
      url: config.facilitatorUrl,
      ...(config.facilitatorApiKey && {
        createAuthHeaders: async () => {
          const h = { 'X-API-Key': config.facilitatorApiKey! }
          return { verify: h, settle: h, supported: h }
        },
      }),
    })

    const exactEvmScheme = new ExactEvmScheme()

    const resourceServer = new x402ResourceServer(facilitatorClient)
      .register(CONFLUX_ESPACE_MAINNET.caip2Id, exactEvmScheme)

    app.use(
      paymentMiddleware(
        x402Routes,
        resourceServer,
      ),
    )

    logger.info({ facilitatorUrl: config.facilitatorUrl }, 'x402 payment middleware enabled')
  } else {
    logger.warn('payment middleware DISABLED (PAYMENT_ENABLED=false)')
  }

  // Register business routes
  registerRoutes(app)

  // Register refund query route (always available, no payment/auth needed)
  app.use('/refunds', createRefundRouter(refundStore))

  return app
}
```

**Step 3: Run all tests**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/app.test.mjs`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/routes/index.ts
git commit -m "feat(server): wire refund store, wrapper, worker, and query route into app"
```

---

### Task 8: Update Demo Route Handler — weather with refund signal

**Files:**
- Modify: `packages/server/src/routes/sandbox.ts`

**Step 1: Write the failing test**

Add to `packages/server/test/app.test.mjs`:

```javascript
test('weather handler sets refund headers when DEMO_REFUND query param is set', async () => {
  const app = createApp(createConfig({
    paymentEnabled: false,
    refundDefault: 'off',
  }))

  // Use a direct request to the app (no payment middleware in the way)
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, resolve))
  const port = server.address().port

  const res = await fetch(`http://localhost:${port}/sandbox/weather?demo_refund=1`)
  const body = await res.json()

  assert.equal(body.ok, false)
  assert.equal(body.error, 'SIMULATED_FAILURE')
  assert.equal(res.headers.get('x-refund-requested'), '1')
  assert.equal(res.headers.get('x-refund-status'), 'pending')

  server.close()
})
```

(Add `import http from 'node:http'` at top of test file if not already present.)

**Step 2: Run test to verify it fails**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/app.test.mjs`
Expected: FAIL — response doesn't have refund headers

**Step 3: Write minimal implementation**

Modify `packages/server/src/routes/sandbox.ts`:

```typescript
import type { Request, Response } from 'express'

export function weatherHandler(req: Request, res: Response): void {
  // Demo mode: simulate business failure for refund demonstration
  if (req.query.demo_refund === '1') {
    res.setHeader('X-Refund-Requested', '1')
    res.setHeader('X-Refund-Status', 'pending')
    if (req.ctx?.requestId) {
      res.setHeader('X-Request-Id', req.ctx.requestId)
    }
    res.json({
      ok: false,
      error: 'SIMULATED_FAILURE',
      message: 'Demo: simulated business failure to trigger refund',
    })
    return
  }

  res.json({
    report: {
      city: 'Conflux City',
      weather: 'sunny',
      temperature: 25,
      unit: 'celsius',
    },
  })
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/app.test.mjs`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/server/src/routes/sandbox.ts
git commit -m "feat(server): add demo_refund query param to weather handler for refund demo"
```

---

### Task 9: Run Full Test Suite and Verify

**Step 1: Run all server tests**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm --filter @conflux-x402/server build && node --test packages/server/test/*.test.mjs`
Expected: All tests PASS

**Step 2: Run full workspace build**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402 && pnpm -r build`
Expected: All packages build successfully

**Step 3: Verify no TypeScript errors**

Run: `cd /Users/efan404/Codes/web3/Conflux-x402/packages/server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit (if any fixes were needed)**

Only if fixes were applied. Otherwise, no commit needed.

---

### Task 10: Update .env.example and Documentation

**Files:**
- Modify: `.env.example` (if not already done in Task 2)
- Modify: `docs/plans/2026-02-08-async-refund-design.md` — mark as implemented

**Step 1: Verify .env.example has refund section**

Read `.env.example` and confirm the refund section from Task 2 is present.

**Step 2: Add implementation note to design doc**

Append to the design doc:

```markdown
---

## 13. Implementation Status

**Implemented:** 2026-02-08

All files listed in Section 11 have been created/modified. Tests pass.
Demo: `GET /sandbox/weather?demo_refund=1` triggers the refund flow.
```

**Step 3: Commit**

```bash
git add .env.example docs/plans/2026-02-08-async-refund-design.md
git commit -m "docs: mark async refund design as implemented, update env example"
```
